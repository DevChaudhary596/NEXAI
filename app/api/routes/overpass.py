"""Sentinel-2 satellite overpass prediction API."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.schemas import OverpassItem, OverpassResponse
from app.services.overpass import predict_sentinel2_overpasses

router = APIRouter(prefix="/api/v1", tags=["overpass"])


@router.get("/overpass", response_model=OverpassResponse)
def get_upcoming_overpasses(
    west: float = Query(..., ge=-180.0, le=180.0, description="Bounding box west longitude"),
    south: float = Query(..., ge=-90.0, le=90.0, description="Bounding box south latitude"),
    east: float = Query(..., ge=-180.0, le=180.0, description="Bounding box east longitude"),
    north: float = Query(..., ge=-90.0, le=90.0, description="Bounding box north latitude"),
    days: int = Query(default=14, ge=1, le=30, description="Days to look ahead"),
) -> OverpassResponse:
    center_lon = round((west + east) / 2.0, 5)
    center_lat = round((south + north) / 2.0, 5)

    passes = predict_sentinel2_overpasses(west=west, south=south, east=east, north=north, days=days)
    items = [
        OverpassItem(
            satellite=p.satellite,
            pass_time_utc=p.pass_time_utc,
            local_solar_time=p.local_solar_time,
            seconds_until=p.seconds_until,
            human_until=p.human_until,
            orbit_direction=p.orbit_direction,
            sun_elevation_deg=p.sun_elevation_deg,
            swath_coverage_pct=p.swath_coverage_pct,
        )
        for p in passes
    ]

    return OverpassResponse(
        center_lon=center_lon,
        center_lat=center_lat,
        next_pass=items[0] if items else None,
        upcoming_passes=items,
    )
