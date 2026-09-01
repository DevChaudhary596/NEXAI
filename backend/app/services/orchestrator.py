"""Sequential tool orchestration. M1 Days 6-7.

Strictly sequential on purpose: on an 8 GB card the VLM and a CV model cannot
be resident at once. Route -> free VRAM -> run the tool -> free again ->
summarise. Parallelising these is the obvious Week-2 latency win and the
obvious way to OOM the demo.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

from app.core.config import get_settings
from app.core.schemas import (
    FeatureCollection, QueryRequest, QueryResponse, RasterOverlay, RoutingDecision,
    Timings, ToolAction,
)
from app.services.cv import get_cv
from app.services.gis import get_gis
from app.services.router import IntentRouter
from app.services.vlm import get_vlm, vram_scope

log = logging.getLogger(__name__)


class SceneNotFound(Exception):
    """Raised when scene_id has no backing file. M5 maps this to 404."""


def resolve_scene(scene_id: str) -> Path:
    """M5 owns upload naming; this mirrors it. Missing files are tolerated in
    mock mode so the other five can develop without real GeoTIFFs."""
    s = get_settings()
    path = Path(s.data_dir) / "scenes" / f"{scene_id}.tif"
    # Any real backend needs a real raster; only mock tolerates a missing file
    # so M2-M6 can develop without GeoTIFFs. Checking `== "local"` here used to
    # let the mlx backend answer about a scene that was never uploaded.
    if not path.exists() and s.vlm_backend != "mock":
        raise SceneNotFound(scene_id)
    return path


def _summarise(tool_call, stats: dict[str, float], fc: FeatureCollection) -> str:
    """Deterministic factual context handed to the VLM for phrasing.

    The numbers are computed here, never generated. The VLM only turns them
    into prose - so a hallucinated count cannot reach the user.
    """
    action = tool_call.action
    if action == ToolAction.DETECTION:
        scores = [f.properties.score for f in fc.features if f.properties.score]
        avg = sum(scores) / len(scores) if scores else 0.0
        return (
            f"Detector found {fc.count} instance(s) of '{tool_call.target}' "
            f"within the ROI, mean confidence {avg:.2f}."
        )
    if action == ToolAction.SEGMENTATION:
        area = sum(f.properties.area_m2 or 0 for f in fc.features)
        return (
            f"Segmented {fc.count} '{tool_call.target}' region(s), "
            f"total area {area / 1e6:.2f} km²."
        )
    if action == ToolAction.SPECTRAL:
        key = "changed_area_km2" if tool_call.bi_temporal else "area_km2"
        return (
            f"{tool_call.index.value.upper()} thresholded at "
            f"{tool_call.operator.value} {tool_call.threshold}: "
            f"{stats.get(key, 0.0):.2f} km² across {fc.count} region(s)."
        )
    return ""


def run_tool(decision: RoutingDecision, req: QueryRequest, scene: Path):
    """Dispatch to M2 or M3. Returns (features, overlays, stats)."""
    call = decision.tool_call
    bbox = req.roi.bbox if req.roi else None
    action = call.action

    if action == ToolAction.DETECTION:
        fc = get_cv().detect(scene, call.target, bbox, call.confidence)
        return fc, [], {"count": float(fc.count)}

    if action == ToolAction.SEGMENTATION:
        fc = get_cv().segment(scene, call.target, bbox)
        area = sum(f.properties.area_m2 or 0 for f in fc.features)
        return fc, [], {"count": float(fc.count), "area_km2": round(area / 1e6, 3)}

    if action == ToolAction.SPECTRAL:
        gis = get_gis()
        if call.bi_temporal:
            if not req.scene_id_b:
                # Degrade rather than 400 - a user asking about change without
                # a second scene should still get the single-date answer.
                log.info("bi_temporal requested without scene_id_b; single-date fallback")
            else:
                fc, ov, stats = gis.bi_temporal(
                    scene, resolve_scene(req.scene_id_b), call.index, call.threshold, bbox
                )
                return fc, [ov], stats
        fc, ov, stats = gis.spectral(
            scene, call.index, call.threshold, call.operator, bbox
        )
        return fc, [ov], stats

    return FeatureCollection(), [], {}


def handle_query(req: QueryRequest) -> QueryResponse:
    s = get_settings()
    vlm = get_vlm()
    router = IntentRouter(vlm, rules_only=s.rules_only_router)
    timings = Timings()
    t0 = time.perf_counter()

    t = time.perf_counter()
    decision = router.route(req.prompt)
    timings.route_ms = (time.perf_counter() - t) * 1000

    scene = resolve_scene(req.scene_id)

    t = time.perf_counter()
    with vram_scope("tool"):
        fc, overlays, stats = run_tool(decision, req, scene)
    timings.tool_ms = (time.perf_counter() - t) * 1000

    context = _summarise(decision.tool_call, stats, fc)
    t = time.perf_counter()
    with vram_scope("answer"):
        answer = vlm.answer(req.prompt, scene if scene.exists() else None, context=context)
    timings.answer_ms = (time.perf_counter() - t) * 1000
    timings.total_ms = (time.perf_counter() - t0) * 1000

    peak = vlm.peak_vram_gb()
    if peak and peak > s.vram_ceiling_gb:
        log.warning("peak VRAM %.2f GB exceeded ceiling %.2f GB", peak, s.vram_ceiling_gb)

    return QueryResponse(
        answer=answer,
        routing=decision,
        geojson=fc,
        overlays=list(overlays),
        stats=stats,
        timings=timings,
        peak_vram_gb=peak,
    )
