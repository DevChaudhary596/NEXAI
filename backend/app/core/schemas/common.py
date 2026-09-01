"""Shared primitives. Frozen contract - M1 owns, M2-M6 import.

Nothing in this module may change without a team-wide bump of
`CONTRACT_VERSION`. Everything else in the codebase depends on it.
"""
from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTRACT_VERSION = "0.1.0"

Lon = Annotated[float, Field(ge=-180.0, le=180.0)]
Lat = Annotated[float, Field(ge=-90.0, le=90.0)]


class Strict(BaseModel):
    """Base: reject unknown keys so a typo in one service fails loudly here."""

    model_config = ConfigDict(extra="forbid", frozen=False)


class SpectralIndex(str, Enum):
    NDVI = "ndvi"
    NDWI = "ndwi"
    NDBI = "ndbi"


class ToolAction(str, Enum):
    GENERAL_VQA = "general_vqa"
    DETECTION = "detection"
    SEGMENTATION = "segmentation"
    SPECTRAL = "spectral"


class Comparison(str, Enum):
    GT = "gt"
    LT = "lt"


class BBox(Strict):
    """Geographic bounding box, EPSG:4326, west/south/east/north."""

    west: Lon
    south: Lat
    east: Lon
    north: Lat

    @model_validator(mode="after")
    def _ordered(self) -> "BBox":
        if self.west >= self.east:
            raise ValueError(f"west ({self.west}) must be < east ({self.east})")
        if self.south >= self.north:
            raise ValueError(f"south ({self.south}) must be < north ({self.north})")
        return self

    def as_list(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]


class ROI(Strict):
    """Region of interest drawn by the user in the M4 Leaflet map.

    Always EPSG:4326 on the wire. M3 reprojects to the scene CRS internally;
    that conversion never leaks into the API contract.
    """

    type: Literal["bbox"] = "bbox"
    bbox: BBox
    crs: Literal["EPSG:4326"] = "EPSG:4326"


class SceneRef(Strict):
    """Points at an uploaded GeoTIFF. M5 mints scene_id on upload."""

    scene_id: str = Field(min_length=1, max_length=128)
    band_hint: str | None = Field(
        default=None,
        description="Optional sensor hint, e.g. 'sentinel2_l2a'. M3 auto-detects if absent.",
    )
