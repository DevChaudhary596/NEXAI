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
from app.core.exceptions import UnsupportedSceneError
from app.core.schemas import (
    ConversationTurn, FeatureCollection, QueryRequest, QueryResponse, RasterOverlay,
    RoutingDecision, Timings, ToolAction,
)
from app.services.cv import get_cv
from app.services.gis import get_gis
from app.services.router import IntentRouter
from app.services.storage import get_storage
from app.services.vlm import build_system_prompt, get_vlm, vram_scope

log = logging.getLogger(__name__)

# Day 13: rough real-world size (longest dimension, metres) per detection
# target. Used only to *caveat* a zero-count result, never to block a query -
# the detector itself already declines gracefully for untrained classes (see
# app/services/cv.py's `_require_supported_target`); this is the analogous
# guardrail for "trained class, but too small to resolve at this scene's GSD."
_MIN_DETECTABLE_SIZE_M: dict[str, float] = {
    "storage_tank": 15, "ship": 20, "plane": 15, "vehicle": 4, "building": 8,
    "bridge": 20, "harbor": 100, "roundabout": 20, "helicopter": 10, "swimming_pool": 5,
}


def _history_as_dicts(
    history: list[ConversationTurn], max_turns: int
) -> list[dict[str, str]]:
    """Trim to the last N turns server-side, regardless of what the client
    sent - the wire-level cap in the schema is a sanity ceiling, this is the
    actual VRAM/latency budget (Day 8 note in config.py)."""
    trimmed = history[-max_turns:] if max_turns > 0 else []
    return [{"role": t.role, "content": t.content} for t in trimmed]


def _resolution_caveat(target: str, resolution_m: float | None) -> str:
    """Non-empty only when a zero-count detection could plausibly be a
    resolution artifact rather than a real absence - stops the VLM's prose
    from reading as more confident than the data supports."""
    if not resolution_m:
        return ""
    min_size = _MIN_DETECTABLE_SIZE_M.get(target)
    if min_size is None or resolution_m * 2 <= min_size:
        return ""
    return (
        f" Note: at ~{resolution_m:.0f} m/pixel, a typical '{target}' "
        f"(~{min_size:.0f} m) is close to or below the detectable size here - "
        f"a zero count means none were resolvable, not necessarily that none are present."
    )


class SceneNotFound(Exception):
    """Raised when scene_id has no backing file. M5 maps this to 404."""


def resolve_scene(scene_id: str) -> Path:
    """Delegates to M5's storage layout (scenes/{id}/scene.tif from a real
    upload, falling back to the flat scenes/{id}.tif convention tests and
    fixtures use) - see app/services/storage.py's docstring: "no one touches
    the filesystem directly." Missing files are tolerated only in mock mode
    so M2-M6 can develop without real GeoTIFFs.

    Duplicating this path logic locally (the flat-only form this used to be)
    silently 404'd every real query after a real /upload, since storage.py
    actually saves nested (scenes/{id}/scene.tif) - real backends never hit
    that path, so the bug only showed up once a non-mock tool tried to open
    the file.
    """
    s = get_settings()
    try:
        return get_storage().resolve_scene(scene_id)
    except FileNotFoundError:
        if s.vlm_backend != "mock":
            raise SceneNotFound(scene_id)
        return Path(s.scenes_dir) / f"{scene_id}.tif"


def _summarise(
    tool_call, stats: dict[str, float], fc: FeatureCollection, has_roi: bool = False,
    resolution_m: float | None = None,
) -> str:
    """Deterministic factual context handed to the VLM for phrasing.

    The numbers are computed here, never generated. The VLM only turns them
    into prose - so a hallucinated count cannot reach the user.
    """
    action = tool_call.action
    scope = "within the ROI" if has_roi else "in the scene"
    if action == ToolAction.DETECTION:
        scores = [f.properties.score for f in fc.features if f.properties.score]
        avg = sum(scores) / len(scores) if scores else 0.0
        caveat = _resolution_caveat(tool_call.target, resolution_m) if fc.count == 0 else ""
        return (
            f"Detector found {fc.count} instance(s) of '{tool_call.target}' "
            f"{scope}, mean confidence {avg:.2f}.{caveat}"
        )
    if action == ToolAction.SEGMENTATION:
        area = sum(f.properties.area_m2 or 0 for f in fc.features)
        caveat = _resolution_caveat(tool_call.target, resolution_m) if fc.count == 0 else ""
        return (
            f"Segmented {fc.count} '{tool_call.target}' region(s), "
            f"total area {area / 1e6:.2f} km².{caveat}"
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
    guardrail_note: str | None = None
    try:
        with vram_scope("tool"):
            fc, overlays, stats = run_tool(decision, req, scene)
    except UnsupportedSceneError as exc:
        # Day 13: a foreseeable "this scene can't support that" case (wrong
        # band count, etc) - degrade to a graceful in-chat explanation rather
        # than the 422 app/api/routes/query.py would otherwise raise. No tool
        # ran, so there is nothing for the VLM to misreport as a real result.
        log.info("graceful degrade for scene_id=%s: %s", req.scene_id, exc)
        guardrail_note = str(exc)
        fc, overlays, stats = FeatureCollection(), [], {}
    timings.tool_ms = (time.perf_counter() - t) * 1000

    if guardrail_note:
        context = (
            f"This scene cannot support the requested analysis ({guardrail_note}). "
            "Explain this limitation to the user in one or two plain sentences and, "
            "if obvious, what kind of scene would work instead. Do not invent numbers "
            "or claim any analysis was performed."
        )
    elif decision.tool_call.action in (ToolAction.DETECTION, ToolAction.SEGMENTATION) and fc.count == 0:
        resolution_m = None
        try:
            # M3's extract_metadata reports `dataset.res` verbatim - degrees
            # for an EPSG:4326/CRS84 scene, despite the "resolution_m" key.
            # Convert with the 1deg~=111km simplification; a scene in a
            # projected (metres-native) CRS is left as-is.
            meta = get_gis().scene_metadata(scene)
            raw = meta.get("resolution_m")
            crs = str(meta.get("crs") or "")
            if raw and ("4326" in crs or "CRS84" in crs or "84" in crs or float(raw) < 0.1):
                resolution_m = float(raw) * 111_000
            elif raw:
                resolution_m = float(raw)
        except Exception as exc:
            log.debug("resolution lookup skipped for caveat: %s", exc)
        context = _summarise(decision.tool_call, stats, fc, has_roi=bool(req.roi), resolution_m=resolution_m)
    else:
        context = _summarise(decision.tool_call, stats, fc, has_roi=bool(req.roi))

    history = _history_as_dicts(req.history, s.max_history_turns)
    system_prompt = build_system_prompt(decision.tool_call, req.prompt)

    t = time.perf_counter()
    with vram_scope("answer"):
        answer = vlm.answer(
            req.prompt, scene if scene.exists() else None,
            context=context, history=history, system_prompt=system_prompt,
        )
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
