"""Unit tests for the Sentinel-2 overpass prediction service."""
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.services.overpass import predict_sentinel2_overpasses


def test_predict_sentinel2_overpass_service():
    # San Francisco airport coordinates
    west, south, east, north = -122.40, 37.60, -122.36, 37.64
    fixed_now = datetime(2026, 9, 1, 0, 0, 0, tzinfo=timezone.utc)
    passes = predict_sentinel2_overpasses(west, south, east, north, days=14, now=fixed_now)

    assert len(passes) > 0, "Should find upcoming passes in a 14-day window"
    first = passes[0]
    assert first.satellite in ("Sentinel-2A", "Sentinel-2B")
    assert first.seconds_until > 0
    assert first.orbit_direction == "descending"
    assert first.sun_elevation_deg > 0
    assert 60.0 <= first.swath_coverage_pct <= 100.0


def test_overpass_api_endpoint():
    client = TestClient(app)
    res = client.get("/api/v1/overpass?west=-122.4&south=37.6&east=-122.3&north=37.7&days=7")
    assert res.status_code == 200
    data = res.json()
    assert "center_lon" in data
    assert "center_lat" in data
    assert "upcoming_passes" in data
    assert len(data["upcoming_passes"]) > 0
    assert data["next_pass"] is not None
    assert data["next_pass"]["satellite"] in ("Sentinel-2A", "Sentinel-2B")
