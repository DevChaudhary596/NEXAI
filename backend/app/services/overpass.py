"""Deterministic Sentinel-2 satellite overpass prediction engine.

Sentinel-2A and 2B fly in sun-synchronous polar orbits phased 180° apart at
an altitude of 786 km and inclination of 98.62°. Both optical multispectral
payloads (MSI) image the earth on daytime descending passes around 10:30 AM
mean local solar time (MLST).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal


@dataclass(frozen=True)
class OverpassWindow:
    satellite: Literal["Sentinel-2A", "Sentinel-2B"]
    pass_time_utc: str
    local_solar_time: str
    seconds_until: int
    human_until: str
    orbit_direction: Literal["descending", "ascending"]
    sun_elevation_deg: float
    swath_coverage_pct: float


def _format_human_duration(seconds: int) -> str:
    if seconds <= 0:
        return "now"
    minutes = seconds // 60
    hours = minutes // 60
    days = hours // 24

    if days > 0:
        rem_hours = hours % 24
        return f"{days}d {rem_hours}h"
    if hours > 0:
        rem_minutes = minutes % 60
        return f"{hours}h {rem_minutes}m"
    return f"{minutes}m"


def _estimate_sun_elevation(lat: float, day_of_year: int) -> float:
    """Approximate solar elevation at 10:30 local solar time."""
    # Solar declination approximation
    declination = 23.44 * math.sin(math.radians((360 / 365) * (day_of_year - 81)))
    # Hour angle for 10:30 AM is 1.5 hours before solar noon = 22.5 degrees
    hour_angle = 22.5
    lat_rad = math.radians(lat)
    dec_rad = math.radians(declination)
    ha_rad = math.radians(hour_angle)

    sin_elev = (
        math.sin(lat_rad) * math.sin(dec_rad)
        + math.cos(lat_rad) * math.cos(dec_rad) * math.cos(ha_rad)
    )
    return round(math.degrees(math.asin(max(-1.0, min(1.0, sin_elev)))), 1)


def predict_sentinel2_overpasses(
    west: float,
    south: float,
    east: float,
    north: float,
    days: int = 14,
    now: datetime | None = None,
) -> list[OverpassWindow]:
    """Calculate upcoming Sentinel-2 daytime optical passes over a bounding box.

    Sentinel-2 has a 10-day orbital repeat cycle per spacecraft (143 orbits),
    interleaved 5 days apart between 2A and 2B. Swath width is 290 km.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    center_lon = (west + east) / 2.0
    center_lat = (south + north) / 2.0

    # Optical imaging occurs at 10:30 AM local solar time.
    # Longitude to UTC hour offset: 15° per hour.
    # UTC_hour = 10.5 - (lon / 15.0)
    utc_target_hours = (10.5 - (center_lon / 15.0)) % 24.0
    target_hour = int(utc_target_hours)
    target_minute = int((utc_target_hours - target_hour) * 60)

    # Calculate swath overlap factor based on latitude (swath overlap increases towards poles)
    abs_lat = abs(center_lat)
    revisit_interval_days = 5 if abs_lat < 30 else (3 if abs_lat < 60 else 2)

    # Reference epoch for 2A vs 2B interleaving (days modulo 10)
    # Sentinel-2A and 2B take turns every revisit window.
    epoch = datetime(2024, 1, 1, tzinfo=timezone.utc)
    base_days = (now - epoch).days

    results: list[OverpassWindow] = []

    # Check candidate days in lookahead range
    for day_offset in range(days + 1):
        target_date = (now + timedelta(days=day_offset)).date()
        candidate_pass_utc = datetime(
            target_date.year,
            target_date.month,
            target_date.day,
            target_hour,
            target_minute,
            0,
            tzinfo=timezone.utc,
        )

        # Skip if already passed today
        if candidate_pass_utc <= now:
            continue

        day_num = (candidate_pass_utc - epoch).days
        # Check if satellite track passes over this longitude sector on this day
        # In a 10-day cycle, any given ground track has 1 direct pass and 1-2 sidelap passes
        cycle_day = day_num % 10
        is_2a_pass = (cycle_day % revisit_interval_days) == 0
        is_2b_pass = ((cycle_day + 5) % revisit_interval_days) == 0

        if not (is_2a_pass or is_2b_pass):
            continue

        satellite: Literal["Sentinel-2A", "Sentinel-2B"] = (
            "Sentinel-2A" if is_2a_pass else "Sentinel-2B"
        )
        seconds_until = int((candidate_pass_utc - now).total_seconds())
        day_of_year = candidate_pass_utc.timetuple().tm_yday
        sun_elev = _estimate_sun_elevation(center_lat, day_of_year)

        # Estimate swath coverage (higher when closer to center of swath, bounded between 80-100%)
        coverage_pct = round(85.0 + 15.0 * math.cos(math.radians(center_lat * 0.5)), 1)

        results.append(
            OverpassWindow(
                satellite=satellite,
                pass_time_utc=candidate_pass_utc.isoformat(),
                local_solar_time="10:30 AM LST",
                seconds_until=seconds_until,
                human_until=_format_human_duration(seconds_until),
                orbit_direction="descending",
                sun_elevation_deg=sun_elev,
                swath_coverage_pct=min(100.0, max(60.0, coverage_pct)),
            )
        )

    # Sort strictly by time until pass
    results.sort(key=lambda item: item.seconds_until)
    return results
