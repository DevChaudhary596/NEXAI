"""CV service boundary. M2 implements against this Protocol.

M2: replace `MockCVService` with a `CVService` class exposing the same two
methods. Do not change the signatures - M1's orchestrator and M6's harness both
bind to them. Everything below the boundary (SAHI tiling, ONNX session reuse,
the pixel->CRS affine) is yours.
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Protocol, runtime_checkable

from app.core.schemas import BBox, Feature, FeatureCollection, FeatureProperties


@runtime_checkable
class CVServiceProtocol(Protocol):
    def detect(
        self, scene_path: str | Path, target: str, bbox: BBox | None, confidence: float
    ) -> FeatureCollection:
        """Oriented bounding boxes as EPSG:4326 Polygons, one Feature each.

        `properties.score` carries detector confidence; `properties.source` is
        "detection". Return an empty collection rather than raising when the
        target class yields nothing.
        """
        ...

    def segment(
        self, scene_path: str | Path, target: str, bbox: BBox | None
    ) -> FeatureCollection:
        """FastSAM masks vectorised to Polygons, EPSG:4326.
        `properties.area_m2` should be populated where the scene CRS allows it."""
        ...


def _grid_polygons(bbox: BBox, n: int, seed: int) -> list[list[list[float]]]:
    """Deterministic pseudo-detections spread across the ROI, so M4 can build
    the layer stack and M6 can write assertions before M2's code lands."""
    rng = random.Random(seed)
    w, s, e, nth = bbox.west, bbox.south, bbox.east, bbox.north
    dx, dy = (e - w) * 0.02, (nth - s) * 0.02
    polys = []
    for _ in range(n):
        cx = rng.uniform(w + dx, e - dx)
        cy = rng.uniform(s + dy, nth - dy)
        polys.append([[
            [cx - dx, cy - dy], [cx + dx, cy - dy],
            [cx + dx, cy + dy], [cx - dx, cy + dy], [cx - dx, cy - dy],
        ]])
    return polys


class MockCVService:
    """Stands in until M2 hands off on Day 7."""

    def detect(
        self, scene_path: str | Path, target: str, bbox: BBox | None, confidence: float
    ) -> FeatureCollection:
        box = bbox or BBox(west=77.5, south=12.9, east=77.7, north=13.1)
        rng = random.Random(hash((target, "detect")) & 0xFFFF)
        polys = _grid_polygons(box, rng.randint(4, 14), seed=hash(target) & 0xFFFF)
        return FeatureCollection(features=[
            Feature(
                geometry={"type": "Polygon", "coordinates": p},
                properties=FeatureProperties(
                    label=target,
                    score=round(rng.uniform(max(confidence, 0.3), 0.97), 3),
                    source="detection",
                ),
            )
            for p in polys
        ])

    def segment(
        self, scene_path: str | Path, target: str, bbox: BBox | None
    ) -> FeatureCollection:
        box = bbox or BBox(west=77.5, south=12.9, east=77.7, north=13.1)
        polys = _grid_polygons(box, 3, seed=hash((target, "seg")) & 0xFFFF)
        return FeatureCollection(features=[
            Feature(
                geometry={"type": "Polygon", "coordinates": p},
                properties=FeatureProperties(
                    label=target, score=None, area_m2=125_000.0, source="segmentation"
                ),
            )
            for p in polys
        ])


_cv: CVServiceProtocol | None = None


def get_cv() -> CVServiceProtocol:
    global _cv
    if _cv is None:
        try:
            from app.services.cv_impl import CVService  # M2 drops this file in

            _cv = CVService()
        except ImportError:
            _cv = MockCVService()
    return _cv
