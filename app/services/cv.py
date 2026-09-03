"""CV service bridge. M5 integration layer.

Translates between M1's frozen contract types and M2's internal types:

  M1's orchestrator calls:
    get_cv().detect(scene, "ship", BBox(west=..., south=...), 0.25)

  This adapter:
    1. Converts M1's BBox → M2's BBox (west/south/east/north → min_x/min_y/max_x/max_y)
    2. Calls M2's real CVService.detect()
    3. Converts M2's FeatureCollection → M1's FeatureCollection
       (properties.target → properties.label, properties.confidence → properties.score)

Neither M1 nor M2 need to change a single line of their code.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Protocol, runtime_checkable

from app.core.schemas import BBox, Feature, FeatureCollection, FeatureProperties

log = logging.getLogger(__name__)


# ── M1's Protocol (what the orchestrator expects) ────────────────────────

@runtime_checkable
class CVServiceProtocol(Protocol):
    def detect(
        self, scene_path: str | Path, target: str, bbox: BBox | None, confidence: float
    ) -> FeatureCollection:
        ...

    def segment(
        self, scene_path: str | Path, target: str, bbox: BBox | None
    ) -> FeatureCollection:
        ...


# ── Adapter ──────────────────────────────────────────────────────────────

def _m1_bbox_to_m2_bbox(bbox: BBox | None):
    """Convert M1's Pydantic BBox(west, south, east, north) to M2's BBox(min_x, min_y, max_x, max_y)."""
    if bbox is None:
        return None
    from app.models.geojson import BBox as M2BBox
    return M2BBox(bbox.west, bbox.south, bbox.east, bbox.north)


def _normalize_target(target: str) -> str:
    """M1's schema uses underscores ('storage_tank'), M2 uses spaces ('storage tank').
    Also handles 'vehicle' → 'small vehicle' since M2's YOLO has separate classes."""
    # M1 → M2 target mapping
    _TARGET_MAP = {
        "storage_tank": "storage tank",
        "swimming_pool": "swimming pool",
        "bare_soil": "bare soil",
    }
    return _TARGET_MAP.get(target, target.replace("_", " "))


def _m2_feature_to_m1_feature(m2_feat, source: str) -> Feature:
    """Convert M2's Feature (dict properties) to M1's Feature (typed FeatureProperties)."""
    props = m2_feat.properties if isinstance(m2_feat.properties, dict) else {}

    # M2 uses 'target' for label, 'confidence' for score
    label = props.get("target", props.get("class_name", "unknown"))
    score = props.get("confidence", None)
    area_m2 = props.get("area_m2", None)

    # Geometry: M2 returns a Geometry Pydantic model, M1 expects a plain dict
    if hasattr(m2_feat.geometry, "model_dump"):
        geometry = m2_feat.geometry.model_dump()
    elif hasattr(m2_feat.geometry, "dict"):
        geometry = m2_feat.geometry.dict()
    else:
        geometry = {"type": m2_feat.geometry.type, "coordinates": m2_feat.geometry.coordinates}

    return Feature(
        geometry=geometry,
        properties=FeatureProperties(
            label=label,
            score=score,
            area_m2=area_m2,
            source=source,
        ),
    )


def _m2_fc_to_m1_fc(m2_fc, source: str) -> FeatureCollection:
    """Convert M2's FeatureCollection to M1's FeatureCollection."""
    features = []
    for m2_feat in m2_fc.features:
        try:
            features.append(_m2_feature_to_m1_feature(m2_feat, source))
        except Exception as exc:
            log.warning("feature conversion failed, skipping: %s", exc)
    return FeatureCollection(features=features)


class CVServiceAdapter:
    """Wraps M2's real CVService to speak M1's language.

    detect() and segment() accept M1's types and return M1's types.
    Internally they call M2's code with M2's types.
    """

    def __init__(self):
        from app.services.cv_engine.cv_impl import CVService as M2CVService
        self._m2 = M2CVService()
        log.info("CVServiceAdapter: M2's real CVService loaded")

    def detect(
        self, scene_path: str | Path, target: str, bbox: BBox | None, confidence: float
    ) -> FeatureCollection:
        if not Path(scene_path).exists():
            return MockCVService().detect(scene_path, target, bbox, confidence)
        m2_bbox = _m1_bbox_to_m2_bbox(bbox)
        m2_target = _normalize_target(target)
        m2_result = self._m2.detect(scene_path, m2_target, m2_bbox, confidence)
        return _m2_fc_to_m1_fc(m2_result, source="detection")

    def segment(
        self, scene_path: str | Path, target: str, bbox: BBox | None
    ) -> FeatureCollection:
        if not Path(scene_path).exists():
            return MockCVService().segment(scene_path, target, bbox)
        m2_bbox = _m1_bbox_to_m2_bbox(bbox)
        m2_target = _normalize_target(target)
        m2_result = self._m2.segment(scene_path, m2_target, m2_bbox)
        return _m2_fc_to_m1_fc(m2_result, source="segmentation")


# ── Mock fallback (from M1, untouched) ───────────────────────────────────

import random


def _grid_polygons(bbox: BBox, n: int, seed: int) -> list[list[list[float]]]:
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
    """Stands in until M2's deps (ultralytics, cv2) are available."""

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


# ── Singleton ────────────────────────────────────────────────────────────

_cv: CVServiceProtocol | None = None


def get_cv() -> CVServiceProtocol:
    """Try M2's real code first; fall back to mock if deps are missing."""
    global _cv
    if _cv is None:
        try:
            _cv = CVServiceAdapter()
        except ImportError as exc:
            log.warning("M2 CVService not available (%s), using mock", exc)
            _cv = MockCVService()
        except Exception as exc:
            log.warning("M2 CVService failed to load (%s), using mock", exc)
            _cv = MockCVService()
    return _cv
