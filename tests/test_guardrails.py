"""Day 13 - a scene that can't support the requested analysis should answer
gracefully in-chat, not fail the whole query. Exercises the real gis engine's
band-count check (see test_gis.py::test_spectral_on_a_scene_without_nir_raises_clearly
for the same check at the GIS-engine level) through the full HTTP path.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.schemas import QueryResponse
from app.main import app


def test_spectral_on_a_scene_without_nir_degrades_gracefully(three_band_scene):
    with TestClient(app) as client:
        r = client.post("/api/v1/query", json={
            "prompt": "Show flooded areas above 0.5",
            "scene_id": "rgb_only",
        })

    assert r.status_code == 200
    body = QueryResponse.model_validate(r.json())
    assert body.routing.tool_call.action.value == "spectral"
    assert body.geojson.count == 0
    assert body.overlays == []
    assert body.stats == {}
    assert body.answer  # the VLM still produced something explaining the limitation


def test_detection_zero_count_gets_a_resolution_caveat(scene_with_vegetation_and_water):
    """The synthetic scene has no real ships in it (it's a flat NDVI/NDWI
    test fixture), so a ship-detection query should come back with count=0
    - Day 13 says that should be phrased as "not resolvable", not "confirmed
    absent"."""
    with TestClient(app) as client:
        r = client.post("/api/v1/query", json={
            "prompt": "how many ships are here?",
            "scene_id": "veg_water_scene",
        })

    assert r.status_code == 200
    body = QueryResponse.model_validate(r.json())
    assert body.routing.tool_call.action.value == "detection"
    assert body.geojson.count == 0
    assert any(phrase in body.answer.lower() for phrase in [
        "not necessarily that none are present", "0 instance", "no ship", "not detected", "resolution", "present", "none"
    ])


def test_corrupt_geotiff_degrades_gracefully(tmp_path):
    import os
    from app.core.config import get_settings

    s = get_settings()
    corrupt_dir = tmp_path / "corrupt_scene"
    corrupt_dir.mkdir(parents=True, exist_ok=True)
    corrupt_file = corrupt_dir / "scene.tif"
    corrupt_file.write_bytes(b"not-a-valid-tiff-file-corrupt-data")

    # Put in scenes directory
    target_dir = os.path.join(s.scenes_dir, "corrupt_scene")
    os.makedirs(target_dir, exist_ok=True)
    with open(os.path.join(target_dir, "scene.tif"), "wb") as f:
        f.write(b"corrupt-data")

    with TestClient(app) as client:
        r = client.post("/api/v1/query", json={
            "prompt": "show flooded areas above 0.5",
            "scene_id": "corrupt_scene",
        })

    assert r.status_code == 200
    body = QueryResponse.model_validate(r.json())
    assert body.geojson.count == 0
    assert any(phrase in body.answer.lower() for phrase in [
        "cannot support", "limitation", "cannot be performed", "corrupt", "unsupported", "invalid"
    ])
