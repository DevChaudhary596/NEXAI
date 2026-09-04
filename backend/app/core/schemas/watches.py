"""AOI monitoring / alerts schemas.

Deliberately email-based, not account-based — there is no user login system
in this app yet. A watch is "this email wants to hear about changes to this
AOI+query", nothing more. Wiring real auth later doesn't need to change this
contract, just how `email` gets populated.
"""
from __future__ import annotations

from pydantic import EmailStr, Field

from .common import BBox, Strict
from .routing import DetectionCall, SegmentationCall, SpectralCall

# VQA has no stats to diff against a previous pass, so it's excluded from
# the watchable tool-call union (unlike the general ToolCall type).
WatchableToolCall = DetectionCall | SegmentationCall | SpectralCall


class CreateWatchRequest(Strict):
    """POST /api/v1/watches request body."""

    email: EmailStr
    label: str | None = Field(default=None, max_length=120)
    bbox: BBox
    tool_call: WatchableToolCall = Field(discriminator="action")


class WatchResponse(Strict):
    id: str
    email: str
    label: str | None
    bbox: BBox
    tool_call: WatchableToolCall = Field(discriminator="action")
    created_at: str
    last_checked_at: str | None
    active: bool


class AlertResponse(Strict):
    id: str
    watch_id: str
    created_at: str
    message: str
    stats_before: dict[str, float]
    stats_after: dict[str, float]
    seen: bool


class WatchListResponse(Strict):
    watches: list[WatchResponse]


class AlertListResponse(Strict):
    alerts: list[AlertResponse]
