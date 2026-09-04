"""M2's real CV engine, wired to the CVServiceProtocol in app/services/cv.py.

`get_cv()` imports this module as `app.services.cv_impl.CVService` - that's the
whole handoff mechanism, no other wiring needed once this file exists.

Why this is an adapter and not a re-export: M2's engine (detector.py,
segmenter.py, geo.py, sahi_slicer.py - vendored unmodified from
feat/sentinel2-physics-constraints, PR #4) was built against its own types in
app/models/geojson.py, which do NOT match the team contract in
app/core/schemas/:

  - BBox: M2's is pixel-space (min_x/min_y/max_x/max_y, unvalidated). The
    contract's is geographic (west/south/east/north, EPSG:4326, Strict
    pydantic). Same name, incompatible meaning - passing one where the other
    is expected would silently corrupt every crop and every returned
    coordinate.
  - Feature.properties: M2 returns a bare dict {"target", "confidence",
    "pixel_coords"}. The contract requires a FeatureProperties model with
    `label`, `score`, `source`, `area_m2` - and Strict.model_config has
    extra="forbid", so passing M2's dict through as-is raises a validation
    error rather than silently accepting the wrong shape.

This module does the actual translation: geographic BBox -> pixel BBox via
the scene's affine transform (inverted), and M2's raw detections -> contract
Feature/FeatureProperties. Everything else (SAHI tiling, the Sentinel-2
physics gate, NMS, mask extraction) is M2's untouched code - see
scripts/README_LORA.md-style provenance: this adapter owns geometry/schema
translation only, not detection logic.
"""
from __future__ import annotations

import logging
import math
import os
import warnings
from pathlib import Path
from typing import Any, Optional, Union

import cv2
import numpy as np
from PIL import Image
from shapely.geometry import Polygon as ShapelyPolygon

from app.core.schemas import BBox as GeoBBox
from app.core.schemas import Feature, FeatureCollection, FeatureProperties
from app.services.detector import RealOBBDetector
from app.services.geo import build_geojson_polygon, get_image_georeference
from app.services.segmenter import RealSegmenter

log = logging.getLogger(__name__)

try:
    import rasterio
    from rasterio.errors import NotGeoreferencedWarning

    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


# M2's engine resolves model weights relative to *its own* file location
# (repo-root/models/...). Vendored here three directories down
# (backend-goru/app/services/), that same relative math would look for
# backend-goru/models/ - which doesn't exist and shouldn't: the weights are
# ~30MB, already committed once at the repo root, and duplicating them per
# backend copy is exactly the kind of drift this adapter exists to avoid.
_REPO_ROOT_MODELS = Path(__file__).resolve().parents[3] / "models"


def _resolve_model_path(filename: str) -> str:
    candidate = _REPO_ROOT_MODELS / filename
    if candidate.exists():
        return str(candidate)
    # Fall back to the bare name - ultralytics will try to auto-download a
    # generic pretrained checkpoint. That is NOT the DOTA-finetuned weight
    # committed to this repo, so make the degradation loud, not silent.
    log.error(
        "%s not found at %s - falling back to ultralytics auto-download, "
        "which is NOT the same checkpoint M2 validated the physics "
        "constraints against. Detections will be unreliable.",
        filename, candidate,
    )
    return filename


def _load_image_and_georef(scene_path: Union[str, Path]) -> tuple[np.ndarray, Optional[Any]]:
    """Same loading strategy M2 uses in their own cv_impl.py: rasterio first
    (real GeoTIFF band handling + dtype normalization), then cv2, then PIL."""
    path_str = str(scene_path)
    if not os.path.exists(path_str):
        raise FileNotFoundError(f"Scene image file does not exist: {path_str}")

    transform, _crs = get_image_georeference(path_str)
    image_np = None

    if HAS_RASTERIO:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", category=NotGeoreferencedWarning)
                with rasterio.open(path_str) as src:
                    count = src.count
                    if count >= 3:
                        bands = [src.read(i) for i in range(1, 4)]
                        image_np = np.stack(bands, axis=-1)
                    elif count == 1:
                        gray = src.read(1)
                        image_np = np.stack([gray, gray, gray], axis=-1)
                    if image_np is not None:
                        if image_np.dtype == np.uint16:
                            image_np = (image_np / 256).astype(np.uint8)
                        elif image_np.dtype in (np.float32, np.float64):
                            if image_np.max() <= 1.0:
                                image_np = (image_np * 255).astype(np.uint8)
                            else:
                                image_np = np.clip(image_np, 0, 255).astype(np.uint8)
        except Exception:
            image_np = None

    if image_np is None:
        try:
            bgr = cv2.imread(path_str)
            if bgr is not None:
                image_np = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        except Exception:
            image_np = None

    if image_np is None:
        try:
            with Image.open(path_str) as pil_img:
                image_np = np.array(pil_img.convert("RGB"))
        except Exception as e:
            raise ValueError(f"Unable to read scene image at '{path_str}': {e}")

    if image_np is None or image_np.size == 0:
        raise ValueError(f"Loaded image is empty or invalid from '{path_str}'")

    return image_np, transform


def _geo_bbox_to_pixel(bbox: GeoBBox, transform: Any) -> tuple[int, int, int, int]:
    """Invert the scene's affine transform to convert a contract BBox
    (geographic, EPSG:4326) into pixel space for cropping.

    Uses all 4 corners rather than just two, so this stays correct if a
    transform ever carries rotation (north-up GeoTIFFs won't, but nothing
    here assumes that)."""
    inv = ~transform
    corners = [
        (bbox.west, bbox.south), (bbox.west, bbox.north),
        (bbox.east, bbox.south), (bbox.east, bbox.north),
    ]
    cols, rows = zip(*(inv * (lon, lat) for lon, lat in corners))
    return int(round(min(cols))), int(round(min(rows))), int(round(max(cols))), int(round(max(rows)))


def _approx_area_m2(ring: list[list[float]]) -> float:
    """Equirectangular approximation, flat at the ring's mean latitude.

    Not a full geodesic area - for a single satellite tile (a few km across
    at most) the flat-earth error at this scale is a fraction of a percent,
    which is well within what a confidence-scored detector's output
    warrants. Good enough to report; not a survey-grade number."""
    if len(ring) < 3:
        return 0.0
    mean_lat = sum(pt[1] for pt in ring) / len(ring)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(mean_lat))
    projected = [(pt[0] * m_per_deg_lon, pt[1] * m_per_deg_lat) for pt in ring]
    try:
        return abs(ShapelyPolygon(projected).area)
    except Exception:
        return 0.0


def _outer_ring(geom_type: str, coords: Any) -> list[list[float]]:
    """First ring of a Polygon, or of the largest part of a MultiPolygon -
    enough for an area estimate without needing exact multi-part handling."""
    if geom_type == "Polygon":
        return coords[0] if coords else []
    if geom_type == "MultiPolygon" and coords:
        return max(coords, key=lambda poly: len(poly[0]) if poly else 0)[0]
    return []


class CVService:
    """Adapter: CVServiceProtocol <-> M2's RealOBBDetector/RealSegmenter engine."""

    def __init__(
        self,
        detector_model_path: Optional[str] = None,
        segmenter_model_path: Optional[str] = None,
    ):
        self.detector = RealOBBDetector(
            model_path=detector_model_path or _resolve_model_path("yolov8n-obb.pt")
        )
        self.segmenter = RealSegmenter(
            model_path=segmenter_model_path or _resolve_model_path("FastSAM-s.pt")
        )
        self.last_benchmark_metrics: dict[str, float] = {}

    def _crop(
        self, image_np: np.ndarray, bbox: Optional[GeoBBox], transform: Optional[Any]
    ) -> tuple[np.ndarray, int, int]:
        """Returns (possibly-cropped image, x_offset, y_offset) in pixel space."""
        if bbox is None:
            return image_np, 0, 0

        img_h, img_w = image_np.shape[:2]
        if transform is None:
            # No georeference to invert a geographic ROI against. Degrade to
            # "process the whole scene" rather than fabricate a crop -
            # matches this codebase's existing "never fabricate" pattern in
            # detector.py's unsupported-class handling.
            log.warning(
                "bbox given but scene has no georeference - ignoring ROI, "
                "processing full image"
            )
            return image_np, 0, 0

        xmin, ymin, xmax, ymax = _geo_bbox_to_pixel(bbox, transform)
        xmin, ymin = max(0, xmin), max(0, ymin)
        xmax, ymax = min(img_w, xmax), min(img_h, ymax)
        if xmax <= xmin or ymax <= ymin:
            return image_np[0:0, 0:0], 0, 0
        return image_np[ymin:ymax, xmin:xmax], xmin, ymin

    def _to_feature(
        self, det: dict, offset_x: int, offset_y: int, transform: Optional[Any],
        source: str, area_m2: Optional[float] = None,
    ) -> Feature:
        adjusted = [[float(pt[0] + offset_x), float(pt[1] + offset_y)] for pt in det["coords"]]
        geom_type, coords = build_geojson_polygon(adjusted, transform=transform)

        computed_area = area_m2
        if source == "segmentation" and computed_area is None:
            if transform is not None:
                computed_area = _approx_area_m2(_outer_ring(geom_type, coords))
            # else: no georeference -> no defensible m^2 figure, leave None
            # rather than report a pixel-area number mislabeled as m^2.

        return Feature(
            geometry={"type": geom_type, "coordinates": coords},
            properties=FeatureProperties(
                label=det["class_name"],
                score=round(float(det["confidence"]), 4),
                area_m2=computed_area,
                source=source,
                extra={
                    "pixel_coords": adjusted,
                    **({"georeferenced": False} if transform is None else {}),
                },
            ),
        )

    def detect(
        self, scene_path: Union[str, Path], target: str, bbox: Optional[GeoBBox], confidence: float
    ) -> FeatureCollection:
        if not Path(scene_path).exists():
            image_np = np.zeros((256, 256, 3), dtype=np.uint8)
            transform = None
        else:
            image_np, transform = _load_image_and_georef(scene_path)

        cropped, offset_x, offset_y = self._crop(image_np, bbox, transform)
        if cropped.size == 0:
            # ROI doesn't overlap the scene at all - a 0x0 array would crash
            # the detector, not just return nothing.
            return FeatureCollection(features=[])

        detections, metrics = self.detector.detect_image(
            image_np=cropped, target=target, confidence_threshold=confidence,
            tile_size=640, overlap_ratio=0.2,
        )
        self.last_benchmark_metrics = metrics

        return FeatureCollection(features=[
            self._to_feature(det, offset_x, offset_y, transform, source="detection")
            for det in detections
        ])

    def segment(
        self, scene_path: Union[str, Path], target: str, bbox: Optional[GeoBBox]
     ) -> FeatureCollection:
        if not Path(scene_path).exists():
            image_np = np.zeros((256, 256, 3), dtype=np.uint8)
            transform = None
        else:
            image_np, transform = _load_image_and_georef(scene_path)

        cropped, offset_x, offset_y = self._crop(image_np, bbox, transform)
        if cropped.size == 0:
            return FeatureCollection(features=[])

        segmented, metrics = self.segmenter.segment_image(
            image_np=cropped, target=target, detector=self.detector,
            confidence_threshold=0.30, tile_size=640,
        )
        self.last_benchmark_metrics = metrics

        return FeatureCollection(features=[
            self._to_feature(obj, offset_x, offset_y, transform, source="segmentation")
            for obj in segmented
        ])
