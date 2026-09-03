"""Upload-related schemas. M5 owns these; M4 reads them.

Uses M1's Strict base so extra="forbid" applies uniformly.
"""
from __future__ import annotations

from pydantic import Field

from .common import BBox, Strict


class FetchSatelliteRequest(Strict):
    """POST /api/v1/scenes/fetch-satellite request body."""

    bbox: BBox = Field(description="Area of interest, EPSG:4326.")


class UploadResponse(Strict):
    """Returned by POST /api/v1/upload on success."""

    scene_id: str = Field(description="Unique identifier minted by M5 on upload.")
    filename: str = Field(description="Original filename from the client.")
    size_bytes: int = Field(ge=0)
    thumbnail_url: str = Field(description="GET this to fetch the JPEG thumbnail.")
    bounds: list[float] | None = Field(
        default=None, min_length=4, max_length=4,
        description="[west, south, east, north] EPSG:4326, extracted from GeoTIFF.",
    )
    crs: str | None = Field(default=None, description="CRS string, e.g. 'EPSG:32643'.")
    resolution_m: float | None = Field(default=None, ge=0)
    band_count: int | None = Field(default=None, ge=1)
    satellite: str | None = Field(
        default=None, description="Source instrument, e.g. 'Sentinel-2 L2A'. None for a manual upload."
    )
    capture_date: str | None = Field(
        default=None, description="ISO date the imagery was captured. None for a manual upload."
    )
    cloud_cover_pct: float | None = Field(
        default=None, ge=0, le=100, description="Scene-wide cloud cover at capture. None for a manual upload."
    )


class SceneListItem(Strict):
    """One scene in the GET /api/v1/scenes listing."""

    scene_id: str
    filename: str
    size_bytes: int
    thumbnail_url: str
    uploaded_at: str
    bounds: list[float] | None = None
    crs: str | None = None


class SceneListResponse(Strict):
    """Response for GET /api/v1/scenes."""

    scenes: list[SceneListItem]
    total: int
