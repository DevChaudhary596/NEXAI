"""Overpass prediction API schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import Strict


class OverpassItem(Strict):
    satellite: Literal["Sentinel-2A", "Sentinel-2B"]
    pass_time_utc: str
    local_solar_time: str
    seconds_until: int
    human_until: str
    orbit_direction: Literal["descending", "ascending"]
    sun_elevation_deg: float
    swath_coverage_pct: float


class OverpassResponse(Strict):
    center_lon: float
    center_lat: float
    next_pass: OverpassItem | None = None
    upcoming_passes: list[OverpassItem] = Field(default_factory=list)
