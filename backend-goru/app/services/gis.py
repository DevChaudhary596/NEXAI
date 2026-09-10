"""GIS service boundary. M3 implements against this Protocol.

M3: land a `GISService` in app/services/gis_impl.py with these three methods.
Raster math, CRS handling, and rasterio.features.shapes stay behind the
boundary; the orchestrator only ever sees FeatureCollection + RasterOverlay.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Protocol, runtime_checkable

from app.core.schemas import (
    BBox, Feature, FeatureCollection, FeatureProperties, RasterOverlay, SpectralIndex,
)
from app.core.schemas.common import Comparison

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


class MockGISService:
    """Stands in until M3 integrates on Day 7."""

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


_gis: GISServiceProtocol | None = None


def get_gis() -> GISServiceProtocol:
    global _gis
    if _gis is None:
        try:
            from app.services.gis_impl import GISService  # M3 drops this file in

            _gis = GISService()
        except ImportError:
            _gis = MockGISService()
    return _gis
