"""GeoJSON wire types. M2 and M3 both emit these; M4 renders them directly.

Deliberately a thin typed shell over RFC 7946 rather than a full GeoJSON
implementation - Leaflet consumes the raw dict, so over-modelling geometry
would only add conversion cost at both ends.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from .common import Strict


class FeatureProperties(Strict):
    """Per-feature attributes. M4 renders `label` in popups, styles on `score`."""

    label: str
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    area_m2: float | None = Field(default=None, ge=0.0)
    source: Literal["detection", "segmentation", "spectral"]
    extra: dict[str, Any] = Field(default_factory=dict)


class Feature(Strict):
    type: Literal["Feature"] = "Feature"
    geometry: dict[str, Any] = Field(
        description="RFC 7946 geometry, EPSG:4326. Polygon for OBB/masks, Point for centroids."
    )
    properties: FeatureProperties


class FeatureCollection(Strict):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[Feature] = Field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.features)


class RasterOverlay(Strict):
    """Georeferenced RGBA PNG produced by M3's threshold masking.

    `url` is served by M5's tile route or as a static file; `bounds` lets M4
    place it with L.imageOverlay without a second metadata round-trip.
    """

    url: str
    bounds: list[float] = Field(
        min_length=4, max_length=4, description="[west, south, east, north] EPSG:4326"
    )
    opacity: float = Field(default=0.7, ge=0.0, le=1.0)
    legend: dict[str, str] = Field(
        default_factory=dict, description="value -> hex colour, for M4's legend widget"
    )
