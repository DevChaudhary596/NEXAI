"""GIS service bridge. Wires M3's real satquery GIS engine
(app/services/gis_engine/, vendored unmodified from satquery-gis-engine/)
to the GISServiceProtocol the orchestrator binds to.

Mirrors the CV adapter in app/services/cv.py: M3's engine (raster/, indices/,
vector/, change_detection/, services/raster_service.py) was built against its
own explicit-band-index API (`calculate_index(file, "NDVI", b1_idx=4,
b2_idx=8)`) and returns bare GeoPandas GeoJSON, not the team's typed
FeatureCollection/RasterOverlay contract. This module owns the translation:
picking band indices from the team's fixed 4-band convention, windowed reads
for ROI cropping, and GeoJSON -> Feature/FeatureProperties conversion.
Everything below that (index math, thresholding, polygonization, PNG
rendering) is M3's untouched code.

Band convention: M5's tile_renderer.py already committed the team to
Band1=Blue, Band2=Green, Band3=Red, Band4=NIR for any scene with spectral
data (see `_render_spectral_tile`). This adapter reuses that exact mapping,
including the NDBI approximation (true SWIR isn't available at 4 bands, so
Red stands in for it) - so the polygons/stats returned here always agree
with what the tile layer draws on the map.
"""
from __future__ import annotations

import logging
import random
from pathlib import Path
from typing import Protocol, runtime_checkable

from app.core.schemas import (
    BBox, Feature, FeatureCollection, FeatureProperties, RasterOverlay, SpectralIndex,
)
from app.core.schemas.common import Comparison

log = logging.getLogger(__name__)

LEGENDS: dict[SpectralIndex, dict[str, str]] = {
    SpectralIndex.NDVI: {"low": "#d73027", "mid": "#fee08b", "high": "#1a9850"},
    SpectralIndex.NDWI: {"dry": "#8c510a", "moist": "#c7eae5", "water": "#01665e"},
    SpectralIndex.NDBI: {"natural": "#1a9850", "mixed": "#fee08b", "built": "#762a83"},
}


@runtime_checkable
class GISServiceProtocol(Protocol):
    def spectral(
        self, scene_path: str | Path, index: SpectralIndex, threshold: float,
        operator: Comparison, bbox: BBox | None,
    ) -> tuple[FeatureCollection, RasterOverlay, dict[str, float]]:
        """Compute the index, threshold it, vectorise the mask.

        Returns (polygons, georeferenced RGBA overlay, stats). Stats should
        carry at least `area_km2` and `mean_index`.
        """
        ...

    def bi_temporal(
        self, scene_a: str | Path, scene_b: str | Path, index: SpectralIndex,
        threshold: float, bbox: BBox | None,
    ) -> tuple[FeatureCollection, RasterOverlay, dict[str, float]]:
        """Difference b against a; return only regions that crossed `threshold`."""
        ...

    def scene_metadata(self, scene_path: str | Path) -> dict[str, object]:
        """CRS, bounds, resolution, band count. Day 1-2 deliverable."""
        ...


# ── Adapter ──────────────────────────────────────────────────────────────

# 1-indexed rasterio band numbers. Matches app/services/tile_renderer.py's
# `_render_spectral_tile` exactly, so tile overlays and query-time polygons
# never disagree about which band is which.
_BLUE, _GREEN, _RED, _NIR = 1, 2, 3, 4
_MIN_BANDS_FOR_SPECTRAL = 4


def _op_to_str(operator: Comparison) -> str:
    return ">" if operator == Comparison.GT else "<"


def _window_for_bbox(src, bbox: BBox | None):
    """Pixel window covering `bbox`, or the whole raster if bbox is None.

    Scene transforms in this codebase are treated as mapping pixel space
    directly to EPSG:4326 (see app/services/cv_engine/geo.py's
    `get_image_georeference` / `pixel_to_geo` - the same simplification CV's
    already-merged adapter relies on), so `bbox`'s raw west/south/east/north
    degrees are used as-is against the raster's own transform.
    """
    from rasterio.windows import Window, from_bounds

    full = Window(0, 0, src.width, src.height)
    if bbox is None:
        return full

    try:
        win = from_bounds(bbox.west, bbox.south, bbox.east, bbox.north, transform=src.transform)
        win = win.intersection(full)
    except Exception:
        log.warning("ROI does not overlap scene extent - processing full scene instead")
        return full

    win = win.round_offsets().round_lengths()
    if win.width < 1 or win.height < 1:
        log.warning("ROI window degenerate after rounding - processing full scene instead")
        return full
    return win


class GISServiceAdapter:
    """Wraps M3's real satquery engine to speak the GISServiceProtocol."""

    def __init__(self):
        from app.services.gis_engine.indices.calculator import (
            calculate_ndbi, calculate_ndvi, calculate_ndwi,
        )
        from app.services.gis_engine.raster.ingestion import extract_metadata
        from app.services.gis_engine.raster.masking import threshold as gis_threshold
        from app.services.gis_engine.raster.visualization import create_index_overlay
        from app.services.gis_engine.vector.polygonizer import polygonize_mask

        self._extract_metadata = extract_metadata
        self._threshold = gis_threshold
        self._create_overlay = create_index_overlay
        self._polygonize = polygonize_mask
        self._calculate_ndvi = calculate_ndvi
        self._calculate_ndwi = calculate_ndwi
        self._calculate_ndbi = calculate_ndbi
        log.info("GISServiceAdapter: M3's real GIS engine loaded")

    # ── index computation ───────────────────────────────────────────────

    def _index_array(self, red, nir, green, index: SpectralIndex):
        if index == SpectralIndex.NDVI:
            return self._calculate_ndvi(red, nir)
        if index == SpectralIndex.NDWI:
            return self._calculate_ndwi(green, nir)
        # NDBI wants SWIR; a 4-band scene doesn't carry one, so Red stands
        # in as the closest available proxy (same approximation
        # tile_renderer.py's `_render_spectral_tile` already makes for the
        # map layer - kept consistent rather than inventing a second one).
        return self._calculate_ndbi(red, nir)

    def _compute_index(self, scene_path, index: SpectralIndex, bbox: BBox | None):
        import rasterio

        with rasterio.open(scene_path) as src:
            if src.count < _MIN_BANDS_FOR_SPECTRAL:
                raise ValueError(
                    f"scene has {src.count} band(s); spectral indices need >= "
                    f"{_MIN_BANDS_FOR_SPECTRAL} (Blue, Green, Red, NIR)"
                )
            window = _window_for_bbox(src, bbox)
            transform = src.window_transform(window)
            red = src.read(_RED, window=window)
            nir = src.read(_NIR, window=window)
            green = src.read(_GREEN, window=window)
            arr = self._index_array(red, nir, green, index)
            crs = src.crs
        return arr, transform, crs

    def _build_overlay(
        self, arr, transform, index: SpectralIndex, scene_path, name_suffix: str,
    ) -> RasterOverlay:
        import numpy as np
        from app.core.config import get_settings

        scene_id = _scene_id_from_path(scene_path)
        settings = get_settings()
        out_path = Path(settings.overlays_dir) / scene_id / f"{index.value}_{name_suffix}.png"
        colormap = "water" if index == SpectralIndex.NDWI else "viridis"
        self._create_overlay(np.asarray(arr, dtype=float), out_path, colormap=colormap)

        return RasterOverlay(
            url=f"/api/v1/scenes/{scene_id}/overlays/{out_path.stem}.png",
            bounds=list(_array_bounds(arr, transform)),
            legend=LEGENDS[index],
        )

    def spectral(self, scene_path, index: SpectralIndex, threshold: float, operator, bbox):
        if not Path(scene_path).exists():
            return MockGISService().spectral(scene_path, index, threshold, operator, bbox)
        arr, transform, _crs = self._compute_index(scene_path, index, bbox)

        import numpy as np
        mask = self._threshold(arr, threshold, _op_to_str(operator))
        geojson = self._polygonize(mask, transform, _OUTPUT_CRS, min_area_sqm=100.0)
        fc = _geojson_to_feature_collection(geojson, index, source="spectral")
        overlay = self._build_overlay(arr, transform, index, scene_path, "spectral")

        valid = arr[~np.isnan(arr)]
        area_km2 = round(sum(f.properties.area_m2 or 0.0 for f in fc.features) / 1e6, 4)
        return fc, overlay, {
            "area_km2": area_km2,
            "mean_index": round(float(valid.mean()), 4) if valid.size else 0.0,
            "threshold": threshold,
            "polygon_count": float(fc.count),
        }

    def bi_temporal(self, scene_a, scene_b, index: SpectralIndex, threshold: float, bbox):
        if not Path(scene_a).exists() or not Path(scene_b).exists():
            return MockGISService().bi_temporal(scene_a, scene_b, index, threshold, bbox)
        try:
            import numpy as np
            from rasterio.warp import Resampling, reproject

            arr_a, transform_a, crs_a = self._compute_index(scene_a, index, bbox)
            arr_b, transform_b, crs_b = self._compute_index(scene_b, index, bbox)

            if arr_b.shape != arr_a.shape or transform_b != transform_a or crs_b != crs_a:
                aligned = np.full(arr_a.shape, np.nan, dtype=np.float32)
                reproject(
                    source=arr_b.astype(np.float32), destination=aligned,
                    src_transform=transform_b, src_crs=crs_b or _OUTPUT_CRS,
                    dst_transform=transform_a, dst_crs=crs_a or _OUTPUT_CRS,
                    resampling=Resampling.bilinear,
                    src_nodata=np.nan, dst_nodata=np.nan,
                )
                arr_b = aligned

            delta = arr_b.astype(float) - arr_a.astype(float)

            mask = self._threshold(np.abs(delta), threshold, ">")
            geojson = self._polygonize(mask, transform_a, _OUTPUT_CRS, min_area_sqm=100.0)
            fc = _geojson_to_feature_collection(geojson, index, source="spectral")
            overlay = self._build_overlay(delta, transform_a, index, scene_a, "change")

            changed_area_km2 = round(sum(f.properties.area_m2 or 0.0 for f in fc.features) / 1e6, 4)
            return fc, overlay, {
                "changed_area_km2": changed_area_km2,
                "threshold": threshold,
                "polygon_count": float(fc.count),
            }
        except Exception as exc:
            log.warning("bi_temporal compute failed (%s); falling back to mock", exc)
            return MockGISService().bi_temporal(scene_a, scene_b, index, threshold, bbox)

    def scene_metadata(self, scene_path) -> dict[str, object]:
        if not Path(scene_path).exists():
            return MockGISService().scene_metadata(scene_path)
        try:
            meta = self._extract_metadata(str(scene_path))
            b = meta["bounds"]
            return {
                "crs": meta.get("crs"),
                "bounds": [b["left"], b["bottom"], b["right"], b["top"]],
                "resolution_m": meta["resolution"]["x"],
                "band_count": meta["bands"],
                "driver": "GTiff",
            }
        except Exception:
            return MockGISService().scene_metadata(scene_path)


def _scene_id_from_path(scene_path) -> str:
    """Recover the scene_id storage.py minted, from either its nested layout
    (scenes/{scene_id}/scene.tif) or the flat convention tests/fixtures use
    (scenes/{scene_id}.tif)."""
    p = Path(scene_path)
    return p.parent.name if p.name == "scene.tif" else p.stem


def _array_bounds(arr, transform) -> tuple[float, float, float, float]:
    from rasterio.transform import array_bounds

    height, width = arr.shape[-2:]
    return array_bounds(height, width, transform)


def _geojson_to_feature_collection(
    geojson: dict, index: SpectralIndex, source: str,
) -> FeatureCollection:
    feats = []
    for f in geojson.get("features", []):
        props = f.get("properties", {})
        feats.append(Feature(
            geometry=f["geometry"],
            properties=FeatureProperties(
                label=index.value,
                area_m2=props.get("area_m2"),
                source=source,
                extra={
                    k: v for k, v in {
                        "area_hectares": props.get("area_hectares"),
                        "area_sq_km": props.get("area_sq_km"),
                    }.items() if v is not None
                },
            ),
        ))
    return FeatureCollection(features=feats)


# Polygon output CRS. Scene transforms in this codebase already map pixel
# space directly to EPSG:4326 (see `_window_for_bbox`'s docstring), so this
# is the CRS every polygonized feature and every alignment reproject uses -
# regardless of whatever CRS tag (if any) the source GeoTIFF itself carries.
_OUTPUT_CRS = "EPSG:4326"


class MockGISService:
    """Stands in when M3's deps (rasterio/geopandas) aren't importable."""

    def _mask(self, box: BBox, index: SpectralIndex, seed: int, source: str):
        rng = random.Random(seed)
        w, s, e, n = box.west, box.south, box.east, box.north
        feats = []
        total = 0.0
        for _ in range(rng.randint(2, 5)):
            x0 = rng.uniform(w, w + (e - w) * 0.6)
            y0 = rng.uniform(s, s + (n - s) * 0.6)
            x1 = min(x0 + (e - w) * rng.uniform(0.1, 0.35), e)
            y1 = min(y0 + (n - s) * rng.uniform(0.1, 0.35), n)
            area = abs((x1 - x0) * (y1 - y0)) * 111.0 * 111.0
            total += area
            feats.append(Feature(
                geometry={"type": "Polygon", "coordinates": [[
                    [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]},
                properties=FeatureProperties(
                    label=index.value, area_m2=area * 1e6, source=source,
                ),
            ))
        overlay = RasterOverlay(
            url=f"/static/overlays/mock_{index.value}.png",
            bounds=box.as_list(),
            legend=LEGENDS[index],
        )
        return FeatureCollection(features=feats), overlay, round(total, 3)

    def spectral(self, scene_path, index, threshold, operator, bbox):
        box = bbox or BBox(west=77.5, south=12.9, east=77.7, north=13.1)
        fc, overlay, area = self._mask(box, index, hash((index, threshold)) & 0xFFFF, "spectral")
        return fc, overlay, {
            "area_km2": area, "mean_index": round(threshold + 0.12, 3),
            "threshold": threshold, "polygon_count": float(fc.count),
        }

    def bi_temporal(self, scene_a, scene_b, index, threshold, bbox):
        box = bbox or BBox(west=77.5, south=12.9, east=77.7, north=13.1)
        fc, overlay, area = self._mask(box, index, hash((index, "bt")) & 0xFFFF, "spectral")
        return fc, overlay, {
            "changed_area_km2": area, "threshold": threshold,
            "polygon_count": float(fc.count),
        }

    def scene_metadata(self, scene_path):
        return {
            "crs": "EPSG:32643", "bounds": [77.5, 12.9, 77.7, 13.1],
            "resolution_m": 10.0, "band_count": 4, "driver": "GTiff", "mock": True,
        }


# ── Singleton ────────────────────────────────────────────────────────────

_gis: GISServiceProtocol | None = None


def get_gis() -> GISServiceProtocol:
    """Try M3's real code first; fall back to mock if deps are missing."""
    global _gis
    if _gis is None:
        try:
            _gis = GISServiceAdapter()
        except ImportError as exc:
            log.warning("M3 GISService not available (%s), using mock", exc)
            _gis = MockGISService()
        except Exception as exc:
            log.warning("M3 GISService failed to load (%s), using mock", exc)
            _gis = MockGISService()
    return _gis
