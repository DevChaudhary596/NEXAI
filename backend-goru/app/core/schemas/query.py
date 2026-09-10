"""The /api/v1/query contract. This is the schema frozen on Day 7."""
from __future__ import annotations

from pydantic import Field, model_validator

from .common import CONTRACT_VERSION, ROI, Strict
from .geo import FeatureCollection, RasterOverlay
from .routing import RoutingDecision


class QueryRequest(Strict):
    prompt: str = Field(min_length=1, max_length=1000)
    scene_id: str = Field(min_length=1, description="Primary scene, from M5's /upload")
    roi: ROI | None = Field(
        default=None, description="M4's drawn box. Absent = whole scene."
    )
    scene_id_b: str | None = Field(
        default=None, description="Second scene for bi-temporal change detection."
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
