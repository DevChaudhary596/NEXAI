"""Upload-related schemas. M5 owns these; M4 reads them.

Uses M1's Strict base so extra="forbid" applies uniformly.
"""
from __future__ import annotations

from pydantic import Field, model_validator

from .common import BBox, Strict


class FetchSatelliteRequest(Strict):
    """POST /api/v1/scenes/fetch-satellite request body."""

    bbox: BBox = Field(description="Area of interest, EPSG:4326.")
    target_date: str | None = Field(
        default=None,
        description=(
            "Optional ISO date (YYYY-MM-DD). When set, fetches the low-cloud "
            "Sentinel-2 pass closest to this date instead of the latest."
        ),
    )

    @model_validator(mode="after")
    def _validate_bbox_span(self) -> "FetchSatelliteRequest":
        max_span = 1.5
        if (self.bbox.east - self.bbox.west) > max_span or (self.bbox.north - self.bbox.south) > max_span:
            raise ValueError(
                f"AOI bounding box span cannot exceed {max_span} degrees (~165 km) in longitude or latitude."
            )
        return self


class SnapshotSceneRequest(Strict):
    """POST /api/v1/scenes/snapshot request body."""

    image_base64: str = Field(
        min_length=10,
        max_length=20_000_000,
        description="Base64 encoded image from live map canvas or drawn ROI (max 20MB payload).",
    )
    bounds: list[float] = Field(
        min_length=4, max_length=4,
        description="[west, south, east, north] coordinates in EPSG:4326.",
    )
    label: str | None = Field(default=None, description="Optional label for the captured scene.")
    is_roi: bool = Field(default=False, description="True if captured from a drawn bounding box.")



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
    satellite: str | None = None
    capture_date: str | None = None
    cloud_cover_pct: float | None = Field(default=None, ge=0, le=100)


class SceneListResponse(Strict):
    """Response for GET /api/v1/scenes."""

    scenes: list[SceneListItem]
    total: int
