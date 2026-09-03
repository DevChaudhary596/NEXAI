"""AOI watch & alert routes — "Monitor this AOI".

POST   /api/v1/watches                 — start watching an AOI+query.
GET    /api/v1/watches?email=          — list a user's watches.
DELETE /api/v1/watches/{watch_id}      — stop monitoring.
GET    /api/v1/alerts?email=           — list a user's alerts (all watches).
POST   /api/v1/alerts/{alert_id}/seen  — mark an alert as read.

Email-based, not account-based — see core/schemas/watches.py docstring.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query
from fastapi.responses import Response
from pydantic import TypeAdapter

from app.api.errors import ApiError
from app.core.schemas import (
    AlertListResponse, AlertResponse, CreateWatchRequest, WatchableToolCall,
    WatchListResponse, WatchResponse,
)
from app.services import watch_store

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["watches"])

_tool_call_adapter: TypeAdapter = TypeAdapter(WatchableToolCall)


def _to_watch_response(watch: watch_store.Watch) -> WatchResponse:
    return WatchResponse(
        id=watch.id,
        email=watch.email,
        label=watch.label,
        bbox={"west": watch.west, "south": watch.south, "east": watch.east, "north": watch.north},
        tool_call=_tool_call_adapter.validate_json(watch.tool_call_json),
        created_at=watch.created_at,
        last_checked_at=watch.last_checked_at,
        active=watch.active,
    )


def _to_alert_response(alert: watch_store.Alert) -> AlertResponse:
    return AlertResponse(
        id=alert.id,
        watch_id=alert.watch_id,
        created_at=alert.created_at,
        message=alert.message,
        stats_before=alert.stats_before,
        stats_after=alert.stats_after,
        seen=alert.seen,
    )


@router.post("/watches", response_model=WatchResponse, status_code=201)
def create_watch(req: CreateWatchRequest) -> WatchResponse:
    watch = watch_store.create_watch(
        email=req.email,
        label=req.label,
        west=req.bbox.west, south=req.bbox.south, east=req.bbox.east, north=req.bbox.north,
        tool_call_json=req.tool_call.model_dump_json(),
    )
    log.info("watch created: id=%s email=%s", watch.id, watch.email)
    return _to_watch_response(watch)


@router.get("/watches", response_model=WatchListResponse)
def list_watches(email: str = Query(..., description="Filter to this email's watches.")) -> WatchListResponse:
    watches = watch_store.list_watches(email=email)
    return WatchListResponse(watches=[_to_watch_response(w) for w in watches])


@router.delete("/watches/{watch_id}")
def delete_watch(watch_id: str) -> Response:
    if not watch_store.deactivate_watch(watch_id):
        raise ApiError(404, "watch_not_found", f"Watch not found: {watch_id}")
    return Response(status_code=204)


@router.get("/alerts", response_model=AlertListResponse)
def list_alerts(email: str = Query(..., description="Filter to this email's alerts.")) -> AlertListResponse:
    alerts = watch_store.list_alerts(email=email)
    return AlertListResponse(alerts=[_to_alert_response(a) for a in alerts])


@router.post("/alerts/{alert_id}/seen")
def mark_alert_seen(alert_id: str) -> Response:
    if not watch_store.mark_alert_seen(alert_id):
        raise ApiError(404, "alert_not_found", f"Alert not found: {alert_id}")
    return Response(status_code=204)
