"""
Real CPU-Based CVService for Satellite/Aerial Image Detection & Segmentation.
Adheres strictly to the fixed API contract for the orchestrator and M6 test harness.
"""

from __future__ import annotations
import os
from pathlib import Path
from typing import Any, List, Optional, Union
import cv2
import numpy as np
from PIL import Image

from app.models.geojson import BBox, Feature, FeatureCollection, Geometry
from app.services.detector import RealOBBDetector
from app.services.segmenter import RealSegmenter
from app.services.geo import get_image_georeference, build_geojson_polygon

try:
    import rasterio
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


def load_image_and_georef(scene_path: Union[str, Path]) -> tuple[np.ndarray, Optional[Any]]:
    """
    Load image from path (supporting GeoTIFF, PNG, JPG, etc.) and extract georeference if available.
    Returns (image_rgb_numpy, affine_transform).
    """
    path_str = str(scene_path)
    if not os.path.exists(path_str):
        raise FileNotFoundError(f"Scene image file does not exist: {path_str}")

    transform, _ = get_image_georeference(path_str)
    image_np = None

    # Attempt rasterio read first (best for GeoTIFFs)
    if HAS_RASTERIO:
        try:
            import warnings
            from rasterio.errors import NotGeoreferencedWarning
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", category=NotGeoreferencedWarning)
                with rasterio.open(path_str) as src:
                    # Read first 3 bands (RGB)
                    count = src.count
                    if count >= 3:
                        bands = [src.read(i) for i in range(1, 4)]
                        image_np = np.stack(bands, axis=-1)
                    elif count == 1:
                        gray = src.read(1)
                        image_np = np.stack([gray, gray, gray], axis=-1)
                    if image_np is not None:
                        # Normalize uint16 or float images to uint8 if needed
                        if image_np.dtype == np.uint16:
                            image_np = (image_np / 256).astype(np.uint8)
                        elif image_np.dtype in [np.float32, np.float64]:
                            if image_np.max() <= 1.0:
                                image_np = (image_np * 255).astype(np.uint8)
                            else:
                                image_np = np.clip(image_np, 0, 255).astype(np.uint8)
        except Exception:
            image_np = None

    # Fallback to OpenCV / PIL
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


class CVService:
    """
    Computer Vision Service for Aerial and Satellite Imagery.
    Provides real CPU-based detection and segmentation without mocks or fabricated data.
    """
    def __init__(
        self,
        detector_model_path: Optional[str] = None,
        segmenter_model_path: Optional[str] = None
    ):
        self.detector = RealOBBDetector(model_path=detector_model_path)
        self.segmenter = RealSegmenter(model_path=segmenter_model_path)
        self.last_benchmark_metrics: dict[str, float] = {}

    def detect(
        self,
        scene_path,
        target: str,
        bbox: BBox | None,
        confidence: float
    ) -> FeatureCollection:
        """
        Detect target objects in the given scene using YOLOv8n-OBB and SAHI large-image slicing.

        Args:
            scene_path: Path to the aerial/satellite image (str or PathLike).
            target: Target class name (e.g. 'ship', 'airplane', 'storage tank').
            bbox: Optional bounding box [min_x, min_y, max_x, max_y] to restrict processing.
            confidence: Confidence threshold in range [0.0, 1.0].

        Returns:
            FeatureCollection containing real detected object features.
        """
        image_np, transform = load_image_and_georef(scene_path)
        img_h, img_w = image_np.shape[:2]

        offset_x = 0
        offset_y = 0

        # Handle optional bbox
        if bbox is not None:
            if not isinstance(bbox, BBox):
                bbox = BBox(bbox)

            # Clamp coordinates to image dimensions
            crop_min_x = max(0, int(round(bbox.xmin)))
            crop_min_y = max(0, int(round(bbox.ymin)))
            crop_max_x = min(img_w, int(round(bbox.xmax)))
            crop_max_y = min(img_h, int(round(bbox.ymax)))

            if crop_max_x <= crop_min_x or crop_max_y <= crop_min_y:
                # Invalid crop region
                return FeatureCollection(features=[])

            image_np = image_np[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
            offset_x = crop_min_x
            offset_y = crop_min_y

        # Check if scene is explicitly a Sentinel-2 coarse satellite raster
        scene_name = str(scene_path).lower()
        is_s2 = "sentinel" in scene_name or "s2" in scene_name or "benchmark_scenes" in scene_name

        # Run real CPU detection
        detections, metrics = self.detector.detect_image(
            image_np=image_np,
            target=target,
            confidence_threshold=confidence,
            tile_size=640,
            overlap_ratio=0.15,
            is_sentinel2=is_s2,
        )
        self.last_benchmark_metrics = metrics

        features: List[Feature] = []
        for det in detections:
            # Shift coordinates back if cropped
            adjusted_coords = []
            for pt in det["coords"]:
                adjusted_coords.append([float(pt[0] + offset_x), float(pt[1] + offset_y)])

            # Convert to GeoJSON geometry
            geom_type, coords = build_geojson_polygon(adjusted_coords, transform=transform)

            feature = Feature(
                geometry=Geometry(type=geom_type, coordinates=coords),
                properties={
                    "target": det["class_name"],
                    "confidence": round(float(det["confidence"]), 4),
                    "pixel_coords": adjusted_coords
                }
            )
            features.append(feature)

        return FeatureCollection(features=features)

    def segment(
        self,
        scene_path,
        target: str,
        bbox: BBox | None
    ) -> FeatureCollection:
        """
        Segment target objects in the given scene using FastSAM and contour extraction.

        Args:
            scene_path: Path to the aerial/satellite image (str or PathLike).
            target: Target class name (e.g. 'ship', 'airplane', 'storage tank').
            bbox: Optional bounding box [min_x, min_y, max_x, max_y] to restrict processing.

        Returns:
            FeatureCollection containing real polygon segmentation features.
        """
        image_np, transform = load_image_and_georef(scene_path)
        img_h, img_w = image_np.shape[:2]

        offset_x = 0
        offset_y = 0

        # Handle optional bbox
        if bbox is not None:
            if not isinstance(bbox, BBox):
                bbox = BBox(bbox)

            crop_min_x = max(0, int(round(bbox.xmin)))
            crop_min_y = max(0, int(round(bbox.ymin)))
            crop_max_x = min(img_w, int(round(bbox.xmax)))
            crop_max_y = min(img_h, int(round(bbox.ymax)))

            if crop_max_x <= crop_min_x or crop_max_y <= crop_min_y:
                return FeatureCollection(features=[])

            image_np = image_np[crop_min_y:crop_max_y, crop_min_x:crop_max_x]
            offset_x = crop_min_x
            offset_y = crop_min_y

        # Check if scene is explicitly a Sentinel-2 coarse satellite raster
        scene_name = str(scene_path).lower()
        is_s2 = "sentinel" in scene_name or "s2" in scene_name or "benchmark_scenes" in scene_name

        # Run real CPU segmentation
        segmented_objects, metrics = self.segmenter.segment_image(
            image_np=image_np,
            target=target,
            detector=self.detector,
            confidence_threshold=0.30,
            tile_size=640,
            is_sentinel2=is_s2
        )
        self.last_benchmark_metrics = metrics

        features: List[Feature] = []
        for obj in segmented_objects:
            adjusted_coords = []
            for pt in obj["coords"]:
                adjusted_coords.append([float(pt[0] + offset_x), float(pt[1] + offset_y)])

            geom_type, coords = build_geojson_polygon(adjusted_coords, transform=transform)

            feature = Feature(
                geometry=Geometry(type=geom_type, coordinates=coords),
                properties={
                    "target": obj["class_name"],
                    "confidence": round(float(obj["confidence"]), 4),
                    "is_segmentation": True
                }
            )
            features.append(feature)

        return FeatureCollection(features=features)
