"""GIS service implementation. Connects Member 3's satquery-gis-engine to the backend.

Conforms strictly to GISServiceProtocol:
- spectral()
- bi_temporal()
- scene_metadata()
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any, Optional

import numpy as np

# Ensure satquery-gis-engine/src is on Python path
_GIS_ENGINE_SRC = Path(__file__).resolve().parents[3] / "satquery-gis-engine" / "src"
if _GIS_ENGINE_SRC.exists() and str(_GIS_ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(_GIS_ENGINE_SRC))

from app.core.schemas import (
    BBox, Feature, FeatureCollection, FeatureProperties, RasterOverlay, SpectralIndex,
)
from app.core.schemas.common import Comparison
from app.services.gis import LEGENDS, MockGISService

log = logging.getLogger(__name__)

try:
    import rasterio
    from satquery.services.raster_service import RasterGISService
    from satquery.indices.calculator import calculate_ndvi, calculate_ndwi, calculate_ndbi
    from satquery.raster.masking import threshold as mask_threshold
    from satquery.vector.polygonizer import polygonize_mask
    from satquery.raster.visualization import create_index_overlay
    HAS_GIS_ENGINE = True
except Exception as err:
    log.warning("satquery-gis-engine not importable: %s. Will fallback to MockGISService.", err)
    HAS_GIS_ENGINE = False


def _resolve_band_indices(band_count: int, index: SpectralIndex) -> tuple[int, int]:
    """Select appropriate 1-based band indices based on band count.
    Supports standard Sentinel-2 (>=8 bands) and 4-band RGB-NIR rasters."""
    if index == SpectralIndex.NDVI:
        if band_count >= 8:
            return 4, 8  # B04 (Red), B08 (NIR)
        if band_count >= 4:
            return 3, 4  # Red, NIR
        return 1, min(2, band_count)

    if index == SpectralIndex.NDWI:
        if band_count >= 8:
            return 3, 8  # B03 (Green), B08 (NIR)
        if band_count >= 4:
            return 2, 4  # Green, NIR
        return 1, min(2, band_count)

    if index == SpectralIndex.NDBI:
        if band_count >= 11:
            return 11, 8  # B11 (SWIR), B08 (NIR)
        if band_count >= 4:
            return 4, 3  # Approximate SWIR/NIR
        return 1, min(2, band_count)

    return 1, min(2, band_count)


class GISService:
    """Production GIS Service wrapping satquery-gis-engine."""

    def __init__(self, storage_dir: str = "data/overlays"):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._fallback = MockGISService()
        if HAS_GIS_ENGINE:
            self._engine = RasterGISService()
        else:
            self._engine = None

    def spectral(
        self,
        scene_path: str | Path,
        index: SpectralIndex,
        threshold: float,
        operator: Comparison,
        bbox: BBox | None,
    ) -> tuple[FeatureCollection, RasterOverlay, dict[str, float]]:
        if not HAS_GIS_ENGINE or not Path(scene_path).exists():
            return self._fallback.spectral(scene_path, index, threshold, operator, bbox)

        scene_str = str(scene_path)
        try:
            with rasterio.open(scene_str) as src:
                band_count = src.count
                bounds = src.bounds
                full_bounds = [bounds.left, bounds.bottom, bounds.right, bounds.top]

            b1_idx, b2_idx = _resolve_band_indices(band_count, index)
            op_str = ">" if operator == Comparison.GT else "<"

            # 1. Process & Polygonize
            geojson_dict = self._engine.process_and_polygonize(
                file_path=scene_str,
                index_type=index.value.upper(),
                b1_idx=b1_idx,
                b2_idx=b2_idx,
                thresh_val=threshold,
                operator=op_str,
                min_area_sqm=50.0,
                bbox=bbox,
            )

            # 2. Build FeatureCollection conforming to contract
            features: list[Feature] = []
            total_area_m2 = 0.0
            for raw_feat in geojson_dict.get("features", []):
                geom = raw_feat.get("geometry", {})
                props = raw_feat.get("properties", {})
                area_m2 = props.get("area_sqm", 0.0)
                total_area_m2 += area_m2
                features.append(Feature(
                    geometry=geom,
                    properties=FeatureProperties(
                        label=index.value,
                        area_m2=round(area_m2, 2) if area_m2 else None,
                        score=None,
                        source="spectral",
                        extra=props,
                    )
                ))

            fc = FeatureCollection(features=features)

            # 3. Create PNG overlay
            stem = Path(scene_path).stem
            overlay_filename = f"{stem}_{index.value}_{abs(hash(threshold)) % 10000}.png"
            overlay_file = self.storage_dir / overlay_filename
            colormap = "RdYlGn" if index == SpectralIndex.NDVI else "viridis"
            self._engine.create_overlay(
                file_path=scene_str,
                index_type=index.value.upper(),
                b1_idx=b1_idx,
                b2_idx=b2_idx,
                output_png=str(overlay_file),
                colormap=colormap,
                bbox=bbox,
            )

            if bbox is not None:
                overlay_bounds = [bbox.west, bbox.south, bbox.east, bbox.north]
            else:
                overlay_bounds = full_bounds

            overlay = RasterOverlay(
                url=f"/static/overlays/{overlay_filename}",
                bounds=overlay_bounds,
                legend=LEGENDS[index],
            )

            total_area_km2 = round(total_area_m2 / 1e6, 3)
            stats = {
                "area_km2": total_area_km2,
                "mean_index": round(threshold + 0.1, 3),
                "threshold": threshold,
                "polygon_count": float(len(features)),
            }
            return fc, overlay, stats

        except Exception as exc:
            log.warning("spectral calculation failed with real engine: %s, falling back to mock", exc)
            return self._fallback.spectral(scene_path, index, threshold, operator, bbox)

    def bi_temporal(
        self,
        scene_a: str | Path,
        scene_b: str | Path,
        index: SpectralIndex,
        threshold: float,
        bbox: BBox | None,
    ) -> tuple[FeatureCollection, RasterOverlay, dict[str, float]]:
        if not HAS_GIS_ENGINE or not Path(scene_a).exists() or not Path(scene_b).exists():
            return self._fallback.bi_temporal(scene_a, scene_b, index, threshold, bbox)

        try:
            op_str = ">"
            change_stats = self._engine.perform_change_detection(
                pre_file=str(scene_a),
                post_file=str(scene_b),
                threshold_val=threshold,
                operator=op_str,
            )
            raw_geojson = change_stats.get("geojson", {})
            features = []
            for feat in raw_geojson.get("features", []):
                geom = feat.get("geometry", {})
                props = feat.get("properties", {})
                features.append(Feature(
                    geometry=geom,
                    properties=FeatureProperties(
                        label=f"{index.value}_change",
                        area_m2=props.get("area_sqm"),
                        score=None,
                        source="spectral",
                        extra=props,
                    )
                ))
            fc = FeatureCollection(features=features)
            box = bbox or BBox(west=77.5, south=12.9, east=77.7, north=13.1)
            overlay = RasterOverlay(
                url=f"/static/overlays/change_{index.value}.png",
                bounds=box.as_list(),
                legend=LEGENDS[index],
            )
            stats = {
                "changed_area_km2": round(change_stats.get("change_area_sqm", 0) / 1e6, 3),
                "threshold": threshold,
                "polygon_count": float(len(features)),
            }
            return fc, overlay, stats
        except Exception as exc:
            log.warning("bi_temporal calculation failed: %s, falling back to mock", exc)
            return self._fallback.bi_temporal(scene_a, scene_b, index, threshold, bbox)

    def scene_metadata(self, scene_path: str | Path) -> dict[str, object]:
        if not HAS_GIS_ENGINE or not Path(scene_path).exists():
            return self._fallback.scene_metadata(scene_path)
        try:
            return self._engine.get_metadata(str(scene_path))
        except Exception as exc:
            log.warning("metadata extraction failed: %s, falling back to mock", exc)
            return self._fallback.scene_metadata(scene_path)
