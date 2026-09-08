"""The /api/v1/query contract. This is the schema frozen on Day 7.

Day 8 adds `history` as an additive, optional field - old clients that never
send it keep working unchanged, so no CONTRACT_VERSION bump."""
from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from .common import CONTRACT_VERSION, ROI, Strict
from .geo import FeatureCollection, RasterOverlay
from .routing import RoutingDecision


class ConversationTurn(Strict):
    """One prior turn in the chat. Text-only, deliberately - re-attaching the
    image on every turn is what Day 8 exists to avoid, and the VLM backends
    only ever bind the image to the *current* turn (see vlm.py's `_build`/`_run`).
    """

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class QueryRequest(Strict):
    prompt: str = Field(min_length=1, max_length=1000)
    scene_id: str = Field(min_length=1, description="Primary scene, from M5's /upload")
    roi: ROI | None = Field(
        default=None, description="M4's drawn box. Absent = whole scene."
    )
    scene_id_b: str | None = Field(
        default=None, description="Second scene for bi-temporal change detection."
    )
    history: list[ConversationTurn] = Field(
        default_factory=list,
        max_length=20,
        description=(
            "Prior turns, oldest first, for follow-up questions ('how many of "
            "those ships are docked near the eastern pier?'). The server also "
            "trims this to `max_history_turns` - the wire cap here is just a "
            "sanity ceiling against an unbounded payload."
        ),
    )


class Timings(Strict):
    """Per-stage milliseconds. M6 charts these; the Week-2 target is <4s total."""

    route_ms: float = 0.0
    tool_ms: float = 0.0
    answer_ms: float = 0.0
    total_ms: float = 0.0


class QueryResponse(Strict):
    contract_version: str = CONTRACT_VERSION
    answer: str = Field(description="Markdown. M4 renders this in the chat panel.")
    routing: RoutingDecision
    geojson: FeatureCollection = Field(default_factory=FeatureCollection)
    overlays: list[RasterOverlay] = Field(default_factory=list)
    stats: dict[str, float] = Field(
        default_factory=dict,
        description="Tool-specific scalars, e.g. {'count': 12, 'area_km2': 3.4}",
    )
    timings: Timings = Field(default_factory=Timings)
    peak_vram_gb: float | None = Field(
        default=None, description="Recorded on CUDA hosts; the <5 GB ceiling is a hard gate."
    )


class ErrorResponse(Strict):
    """Every non-2xx from /api/v1/* uses this shape. M4 shows `detail` verbatim."""

    detail: str
    code: str = Field(description="Stable machine-readable slug, e.g. 'scene_not_found'")
