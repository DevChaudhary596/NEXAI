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
from typing import Any

from app.core.config import get_settings
from app.core.exceptions import UnsupportedSceneError
from app.core.schemas import (
    ConversationTurn, FeatureCollection, QueryRequest, QueryResponse, RasterOverlay,
    RoutingDecision, Timings, ToolAction, Provenance, Uncertainty,
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
    """Trim to last 3 turns and tightly compact each turn's text length.
    
    Prevents exhausting Groq's Tokens Per Minute (TPM) quota during multi-turn chats
    or after generating long reports. Keeps essential context without carrying
    thousands of past response tokens.
    """
    trimmed = history[-max_turns:] if max_turns > 0 else []
    cleaned: list[dict[str, str]] = []
    for t in trimmed:
        role = "user" if t.role == "user" else "assistant"
        raw_text = (t.content or "").strip()
        # Cap user turn at 300 chars, assistant at 400 chars
        limit = 300 if role == "user" else 400
        if len(raw_text) > limit:
            raw_text = raw_text[:limit].rsplit(" ", 1)[0] + "..."
        if raw_text:
            cleaned.append({"role": role, "content": raw_text})
    return cleaned


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


def _get_scene_or_roi_crop(scene: Path, roi: Any) -> Path | None:
    """If scene exists and an ROI is specified, crop the image to the ROI
    so the VLM answers about the user's selected area rather than the full scene.
    Falls back to uncropped scene if crop fails or rasterio is absent."""
    if not scene or not scene.exists():
        return None
    if roi is None or not hasattr(roi, "bbox") or roi.bbox is None:
        return scene

    bbox = roi.bbox
    try:
        from PIL import Image
        import numpy as np
        import rasterio
        from rasterio.windows import from_bounds
        from rasterio.warp import transform_bounds

        crop_dir = scene.parent.parent / "crops"
        crop_dir.mkdir(parents=True, exist_ok=True)
        crop_hash = f"{scene.stem}_{abs(hash((bbox.west, bbox.south, bbox.east, bbox.north))) % 100000}.jpg"
        crop_path = crop_dir / crop_hash
        if crop_path.exists():
            return crop_path

        with rasterio.open(str(scene)) as src:
            if src.crs and not src.crs.is_geographic:
                try:
                    left, bottom, right, top = transform_bounds(
                        "EPSG:4326", src.crs, bbox.west, bbox.south, bbox.east, bbox.north
                    )
                except Exception:
                    left, bottom, right, top = bbox.west, bbox.south, bbox.east, bbox.north
            else:
                left, bottom, right, top = bbox.west, bbox.south, bbox.east, bbox.north

            window = from_bounds(left, bottom, right, top, transform=src.transform)
            window = window.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
            if window.width > 2 and window.height > 2:
                if src.count >= 3:
                    arr = src.read([1, 2, 3], window=window)
                else:
                    arr = np.repeat(src.read(1, window=window)[np.newaxis, :, :], 3, axis=0)

                if arr.dtype == np.uint16:
                    arr = (arr / 256).astype(np.uint8)
                elif arr.dtype in (np.float32, np.float64):
                    arr = np.clip(arr * 255 if arr.max() <= 1.0 else arr, 0, 255).astype(np.uint8)
                arr = np.transpose(arr, (1, 2, 0))
                im = Image.fromarray(arr)
                im.save(crop_path, quality=90)
                return crop_path
    except Exception as exc:
        log.warning("ROI crop for VLM failed: %s, using full scene", exc)

    return scene


def _summarise(
    tool_call, stats: dict[str, float], fc: FeatureCollection, has_roi: bool = False,
    resolution_m: float | None = None,
) -> str:
    """Deterministic factual context handed to the VLM for phrasing.

    The numbers are computed here, never generated. The VLM only turns them
    into prose - so a hallucinated count cannot reach the user.
    """
    action = tool_call.action
    scope = "within the drawn Region of Interest (ROI)" if has_roi else "across the full scene"
    if action == ToolAction.DETECTION:
        scores = [f.properties.score for f in fc.features if f.properties.score]
        avg = sum(scores) / len(scores) if scores else 0.0
        high_conf = sum(1 for s in scores if s >= 0.5)
        low_conf = len(scores) - high_conf
        caveat = _resolution_caveat(tool_call.target, resolution_m) if fc.count == 0 else ""

        target_label = "objects" if tool_call.target == "all" else tool_call.target.replace("_", " ")

        class_counts = {}
        for f in fc.features:
            lbl = (f.properties.label or tool_call.target).replace("_", " ")
            class_counts[lbl] = class_counts.get(lbl, 0) + 1

        breakdown_str = ""
        if len(class_counts) > 1:
            breakdown_str = " Breakdown: " + ", ".join(f"{cnt} {k}(s)" for k, cnt in class_counts.items()) + "."
        elif len(class_counts) == 1:
            k, cnt = next(iter(class_counts.items()))
            breakdown_str = f" All classified as {k}."

        parts = [
            f"The detector identified {fc.count} total instance(s) of '{target_label}' {scope}.{breakdown_str}",
            f"Mean detection confidence: {avg:.2f}.",
        ]
        if fc.count > 0 and scores:
            min_score = min(scores)
            max_score = max(scores)
            parts.append(f"Confidence range: {min_score:.2f} – {max_score:.2f}.")
            if high_conf > 0:
                parts.append(f"{high_conf} detection(s) above 0.50 confidence (high certainty), {low_conf} marginal.")
        if caveat:
            parts.append(caveat)
        return " ".join(parts)
    if action == ToolAction.SEGMENTATION:
        area = sum(f.properties.area_m2 or 0 for f in fc.features)
        caveat = _resolution_caveat(tool_call.target, resolution_m) if fc.count == 0 else ""
        target_label = tool_call.target.replace("_", " ")
        return (
            f"Segmented {fc.count} '{target_label}' region(s) {scope}, "
            f"total area {area / 1e6:.2f} km² ({area:,.0f} m²).{caveat}"
        )
    if action == ToolAction.SPECTRAL:
        key = "changed_area_km2" if tool_call.bi_temporal else "area_km2"
        return (
            f"{tool_call.index.value.upper()} thresholded at "
            f"{tool_call.operator.value} {tool_call.threshold}: "
            f"{stats.get(key, 0.0):.2f} km² across {fc.count} region(s) {scope}."
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

    is_general_scene = not req.scene_id or req.scene_id.lower() in ("general", "none", "earth")
    scene: Path | None = None
    if not is_general_scene:
        try:
            scene = resolve_scene(req.scene_id)
        except SceneNotFound:
            if decision.tool_call.action == ToolAction.GENERAL_VQA:
                scene = None
            else:
                raise

    t = time.perf_counter()
    guardrail_note: str | None = None
    fc, overlays, stats = FeatureCollection(), [], {}
    if scene is not None and scene.exists():
        try:
            with vram_scope("tool"):
                fc, overlays, stats = run_tool(decision, req, scene)
        except UnsupportedSceneError as exc:
            # Day 13: a foreseeable "this scene can't support that" case (wrong
            # band count, etc) - degrade to a graceful in-chat explanation rather
            # than the 422 app/api/routes/query.py would otherwise raise.
            log.info("graceful degrade for scene_id=%s: %s", req.scene_id, exc)
            guardrail_note = str(exc)
            fc, overlays, stats = FeatureCollection(), [], {}
    timings.tool_ms = (time.perf_counter() - t) * 1000

    context = ""
    if guardrail_note:
        context = (
            f"This scene cannot support the requested analysis ({guardrail_note}). "
            "Explain this limitation to the user in one or two plain sentences and, "
            "if obvious, what kind of scene would work instead. Do not invent numbers "
            "or claim any analysis was performed."
        )
    elif decision.tool_call.action == ToolAction.GENERAL_VQA and scene and scene.exists():
        # Scenery description / visual query: run trained detector so findings ground the VLM
        prompt_lower = req.prompt.lower()
        if any(w in prompt_lower for w in ("describe", "what do you see", "what is in", "scenery", "analyze this", "what is this", "spot")):
            try:
                cv = get_cv()
                detected_items = []
                bbox = req.roi.bbox if req.roi else None
                for target in ["plane", "ship", "storage_tank", "vehicle"]:
                    det_fc = cv.detect(scene, target, bbox, 0.35)
                    if det_fc.count > 0:
                        detected_items.append(f"{det_fc.count} {target.replace('_', ' ')}(s)")
                        for feat in det_fc.features:
                            fc.features.append(feat)
                if detected_items:
                    stats["detected_objects"] = float(len(fc.features))
                    context = f"Trained object detector identified in scene: {', '.join(detected_items)}."
            except Exception as det_err:
                log.debug("Scenery describe CV scan error: %s", det_err)
    elif decision.tool_call.action in (ToolAction.DETECTION, ToolAction.SEGMENTATION) and fc.count == 0 and scene and scene.exists():
        resolution_m = None
        try:
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
    elif scene and scene.exists() and decision.tool_call.action != ToolAction.GENERAL_VQA:
        context = _summarise(decision.tool_call, stats, fc, has_roi=bool(req.roi))
    elif scene is None or not scene.exists():
        if decision.tool_call.action != ToolAction.GENERAL_VQA:
            target_name = getattr(decision.tool_call, "target", None)
            if not target_name:
                idx = getattr(decision.tool_call, "index", None)
                target_name = getattr(idx, "value", "spectral features")
            context = f"NO_SCENE_BOUND: No satellite scene or active Region of Interest (AOI) is currently loaded to scan for '{target_name}'."
        else:
            context = ""

    history = _history_as_dicts(req.history, s.max_history_turns)
    system_prompt = build_system_prompt(decision.tool_call, req.prompt)

    t = time.perf_counter()
    vlm_image = _get_scene_or_roi_crop(scene, req.roi) if (scene and scene.exists()) else None
    target_image = vlm_image if (vlm_image and Path(vlm_image).exists()) else (scene if (scene and scene.exists()) else None)
    with vram_scope("answer"):
        answer = vlm.answer(
            req.prompt, target_image,
            context=context, history=history, system_prompt=system_prompt,
        )
    timings.answer_ms = (time.perf_counter() - t) * 1000
    timings.total_ms = (time.perf_counter() - t0) * 1000

    peak = vlm.peak_vram_gb()
    if peak and peak > s.vram_ceiling_gb:
        log.warning("peak VRAM %.2f GB exceeded ceiling %.2f GB", peak, s.vram_ceiling_gb)

    bands_used = {
        "ndvi": ["red", "near_infrared"],
        "ndwi": ["green", "near_infrared"],
        "ndbi": ["shortwave_infrared", "near_infrared"],
    }.get(getattr(getattr(decision.tool_call, "index", None), "value", ""), ["red", "green", "blue"])

    if scene and scene.exists() and req.scene_id:
        manifest = get_storage().get_scene_provenance(req.scene_id)
        provenance = Provenance(**manifest, bands_used=bands_used, analysis_method=decision.tool_call.action.value)
    else:
        provenance = Provenance(
            scene_id=req.scene_id or "general",
            sha256="0" * 64,
            source_filename="general_knowledge_base",
            ingested_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            source_type="ai_knowledge_engine",
            analysis_method=decision.tool_call.action.value,
        )
    uncertainty = None
    if decision.tool_call.action == ToolAction.DETECTION:
        count = stats.get("count", 0.0)
        spread = count ** 0.5
        uncertainty = Uncertainty(
            metric="detected_object_count", lower=max(0.0, count - spread), upper=count + spread,
            method="Poisson counting interval", caveat="This expresses count sampling variability only; it is not model-validation accuracy.",
        )

    return QueryResponse(
        answer=answer,
        routing=decision,
        geojson=fc,
        overlays=list(overlays),
        stats=stats,
        timings=timings,
        peak_vram_gb=peak,
        provenance=provenance,
        uncertainty=uncertainty,
    )
