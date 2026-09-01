"""End-to-end integration with mock tool responses. M1 Day 7 milestone."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.schemas import QueryResponse
from app.main import app

ROI = {"bbox": {"west": 77.5, "south": 12.9, "east": 77.7, "north": 13.1}}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_healthz(client):
    body = client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["contract_version"] == "0.1.0"


def test_detection_roundtrip(client):
    """Storage tanks are ~<30m at Sentinel-2's 10m/px - real CV (as of M2's
    physics-constraint work, app/services/detector.py) always blocks this
    class before inference runs, so `count > 0` is no longer a valid
    assertion for this target. This now checks that the block reaches the
    API correctly end-to-end instead - routing still resolves the query and
    the response is still well-formed, it's the detection count itself that
    the physics gate zeroes out.

    TODO(M1/M6): the seeded demo/coastal/urban/farmland scenes are synthetic
    256x256 placeholders with no real detectable content - once a real
    fixture scene exists, add a companion positive-path test using a
    SENTINEL2_RELIABLE_CLASSES target (e.g. 'ship', 'bridge') that actually
    asserts count > 0 through the full API, not just at the CVService layer.
    """
    r = client.post("/api/v1/query", json={
        "prompt": "How many storage tanks are here?", "scene_id": "demo", "roi": ROI})
    assert r.status_code == 200
    body = QueryResponse.model_validate(r.json())  # response must satisfy its own schema
    assert body.routing.tool_call.action.value == "detection"
    assert body.routing.tool_call.target == "storage_tank"
    assert body.geojson.count == 0, "storage tank is physics-blocked - a nonzero count means the gate broke"
    assert body.stats["count"] == body.geojson.count


def test_spectral_roundtrip_emits_overlay(client):
    r = client.post("/api/v1/query", json={
        "prompt": "Show flooded areas", "scene_id": "demo", "roi": ROI})
    body = QueryResponse.model_validate(r.json())
    assert body.routing.tool_call.index.value == "ndwi"
    assert len(body.overlays) == 1
    assert body.overlays[0].bounds == [77.5, 12.9, 77.7, 13.1]
    assert body.overlays[0].legend  # M4 needs a legend to render the swipe tool


def test_features_land_inside_the_roi(client):
    """Guards the pixel->CRS affine at the contract level: if M2 or M3 ships a
    transform bug, polygons drift outside the drawn box and this catches it
    before it reaches the map."""
    r = client.post("/api/v1/query", json={
        "prompt": "Count the ships", "scene_id": "demo", "roi": ROI})
    b = ROI["bbox"]
    for feat in QueryResponse.model_validate(r.json()).geojson.features:
        for ring in feat.geometry["coordinates"]:
            for x, y in ring:
                assert b["west"] <= x <= b["east"], f"lon {x} outside ROI"
                assert b["south"] <= y <= b["north"], f"lat {y} outside ROI"


def test_vqa_returns_no_geometry(client):
    r = client.post("/api/v1/query", json={"prompt": "Describe the scene", "scene_id": "demo"})
    body = QueryResponse.model_validate(r.json())
    assert body.routing.tool_call.action.value == "general_vqa"
    assert body.geojson.count == 0
    assert body.overlays == []


def test_bi_temporal_without_second_scene_degrades(client):
    """A change query with only one scene should still answer, not 400."""
    r = client.post("/api/v1/query", json={
        "prompt": "show the change in water extent", "scene_id": "demo", "roi": ROI})
    assert r.status_code == 200
    assert QueryResponse.model_validate(r.json()).routing.tool_call.bi_temporal is True


def test_bi_temporal_with_second_scene(client):
    r = client.post("/api/v1/query", json={
        "prompt": "compare vegetation before and after", "scene_id": "a",
        "scene_id_b": "b", "roi": ROI})
    body = QueryResponse.model_validate(r.json())
    assert "changed_area_km2" in body.stats


def test_route_only_endpoint_skips_tools(client):
    """M6 runs the 50-query matrix through this on a CPU box."""
    r = client.post("/api/v1/route", json={"prompt": "segment the water", "scene_id": "x"})
    assert r.status_code == 200
    assert r.json()["tool_call"]["action"] == "segmentation"


def test_malformed_request_is_422(client):
    assert client.post("/api/v1/query", json={"scene_id": "demo"}).status_code == 422
    assert client.post("/api/v1/query", json={
        "prompt": "x", "scene_id": "demo",
        "roi": {"bbox": {"west": 99, "south": 0, "east": 1, "north": 2}},
    }).status_code == 422


def test_timings_populated(client):
    r = client.post("/api/v1/query", json={"prompt": "count ships", "scene_id": "demo"})
    t = QueryResponse.model_validate(r.json()).timings
    assert t.total_ms > 0
    assert t.total_ms >= t.route_ms
