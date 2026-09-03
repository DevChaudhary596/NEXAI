"""Background loop that re-checks each active watch for a new Sentinel-2
pass and raises an alert when the AI's own numbers moved meaningfully.

Deliberately deterministic: this calls `run_tool()` directly (bypassing the
NL router and the VLM entirely) so a scheduled check always re-runs the
*same* detection/segmentation/spectral call the watch was created with, and
the alert message is built from the returned stats — never generated text —
matching the orchestrator's own "numbers are computed here, never generated"
principle for interactive queries.

No email/Slack sending is wired up yet — that needs credentials only the
user can provide (an SMTP account, SendGrid/Resend key, or a Slack webhook
URL). Alerts are persisted and served over the API instead; wiring actual
delivery is a `send_alert()` call to add once those credentials exist,
not a redesign of anything here.
"""
from __future__ import annotations

import asyncio
import logging

from pydantic import TypeAdapter

from app.core.config import get_settings
from app.core.schemas import QueryRequest
from app.core.schemas.common import ToolAction
from app.core.schemas.routing import RoutingDecision, RoutingSource, ToolCall
from app.services import satellite_fetch, watch_store
from app.services.orchestrator import run_tool
from app.services.storage import get_storage

log = logging.getLogger(__name__)

_tool_call_adapter: TypeAdapter = TypeAdapter(ToolCall)

# Ignore stat swings smaller than this fraction of the previous value (or
# this absolute amount for a previous value of 0) — Sentinel-2 pixel noise
# and slightly different look angles between passes produce small nonzero
# deltas even when nothing real changed on the ground.
_RELATIVE_CHANGE_THRESHOLD = 0.10
_ABSOLUTE_CHANGE_FLOOR = 0.5


def _is_meaningful_change(old_value: float, new_value: float) -> bool:
    delta = abs(new_value - old_value)
    if old_value == 0:
        return delta >= _ABSOLUTE_CHANGE_FLOOR
    return delta / abs(old_value) >= _RELATIVE_CHANGE_THRESHOLD


def _diff_message(tool_call, old_stats: dict[str, float], new_stats: dict[str, float]) -> str | None:
    """Deterministic, numbers-first alert text. None if nothing meaningful
    changed."""
    changed = {
        key: (old_stats.get(key, 0.0), new_value)
        for key, new_value in new_stats.items()
        if _is_meaningful_change(old_stats.get(key, 0.0), new_value)
    }
    if not changed:
        return None

    if tool_call.action == ToolAction.DETECTION:
        old_count, new_count = changed.get("count", (0, 0))
        direction = "new" if new_count > old_count else "fewer"
        return (
            f"{abs(int(new_count) - int(old_count))} {direction} '{tool_call.target}' "
            f"detected (was {int(old_count)}, now {int(new_count)})."
        )
    if tool_call.action == ToolAction.SEGMENTATION:
        old_area, new_area = changed.get("area_km2", (0, 0))
        return (
            f"'{tool_call.target}' area now {new_area:.2f} km² "
            f"(was {old_area:.2f} km², {new_area - old_area:+.2f} km²)."
        )
    if tool_call.action == ToolAction.SPECTRAL:
        key = "changed_area_km2" if getattr(tool_call, "bi_temporal", False) else "area_km2"
        old_area, new_area = changed.get(key, (0, 0))
        return (
            f"{tool_call.index.value.upper()} {tool_call.operator.value} {tool_call.threshold}: "
            f"{new_area:.2f} km² (was {old_area:.2f} km², {new_area - old_area:+.2f} km²)."
        )
    return None


async def check_watch(watch: watch_store.Watch) -> None:
    tool_call = _tool_call_adapter.validate_json(watch.tool_call_json)

    try:
        item = await satellite_fetch.find_latest_scene(
            watch.west, watch.south, watch.east, watch.north
        )
    except satellite_fetch.NoImageryFoundError:
        log.info("watch %s: no imagery available this check", watch.id)
        watch_store.mark_checked(watch.id, item_id=watch.last_item_id)
        return

    if item["id"] == watch.last_item_id:
        watch_store.mark_checked(watch.id, item_id=item["id"])
        return

    data = await asyncio.to_thread(
        satellite_fetch.crop_scene_to_geotiff, item, watch.west, watch.south, watch.east, watch.north
    )

    storage = get_storage()
    scene_id = storage.mint_scene_id()
    scene_path = storage.save_scene(scene_id, data, satellite_fetch.scene_label(item))

    decision = RoutingDecision(
        tool_call=tool_call, confidence=1.0,
        rationale="scheduled watch re-check", source=RoutingSource.RULES,
    )
    # run_tool() only reads req.roi, but QueryRequest.prompt requires >=1 char.
    req = QueryRequest(prompt="(scheduled watch check)", scene_id=scene_id, roi=None)
    _, _, new_stats = await asyncio.to_thread(run_tool, decision, req, scene_path)

    is_baseline = watch.last_item_id is None
    if not is_baseline:
        message = _diff_message(tool_call, watch.last_stats, new_stats)
        if message:
            watch_store.create_alert(watch.id, message, watch.last_stats, new_stats)
            log.info("watch %s: ALERT — %s", watch.id, message)

    watch_store.mark_checked(watch.id, item_id=item["id"], stats=new_stats)


async def run_scheduler_loop() -> None:
    """Runs forever as a background task started from the FastAPI lifespan.
    Wakes every minute; each watch's own `watch_check_interval_minutes` gates
    whether it's actually due, so this doesn't hammer the STAC API."""
    settings = get_settings()
    log.info(
        "watch scheduler started (per-watch check interval: %sm)",
        settings.watch_check_interval_minutes,
    )
    while True:
        try:
            due = watch_store.get_due_watches(settings.watch_check_interval_minutes)
            for watch in due:
                try:
                    await check_watch(watch)
                except Exception:
                    log.exception("watch check failed for %s", watch.id)
        except Exception:
            log.exception("watch scheduler loop error")
        await asyncio.sleep(60)
