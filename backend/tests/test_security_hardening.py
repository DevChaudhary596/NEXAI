from __future__ import annotations

import base64
import os
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.schemas.upload import FetchSatelliteRequest, SnapshotSceneRequest
from app.main import app
from app.services.storage import get_storage, validate_safe_identifier


def test_validate_safe_identifier_rejects_traversal():
    with pytest.raises(ValueError, match="illegal characters or path traversal"):
        validate_safe_identifier("../../etc/passwd")

    with pytest.raises(ValueError, match="illegal characters or path traversal"):
        validate_safe_identifier("scene/123")

    with pytest.raises(ValueError, match="illegal characters or path traversal"):
        validate_safe_identifier("..\\windows\\system32")

    with pytest.raises(ValueError, match="illegal characters or path traversal"):
        validate_safe_identifier("")

    # Safe identifiers must pass
    assert validate_safe_identifier("valid-scene_123") == "valid-scene_123"
    assert validate_safe_identifier("scene_20260912") == "scene_20260912"


def test_storage_path_traversal_prevention():
    storage = get_storage()

    with pytest.raises(ValueError):
        storage.resolve_scene("../../secret")

    with pytest.raises(ValueError):
        storage.delete_scene("../traversal_target")

    with pytest.raises(ValueError):
        storage.get_thumbnail_path("../../secret")

    with pytest.raises(ValueError):
        storage.save_overlay("../../scene", "overlay", b"fake")

    with pytest.raises(ValueError):
        storage.resolve_overlay("valid_scene", "../../bad_name")


def test_delete_scene_api_rejects_traversal_input():
    client = TestClient(app)
    resp = client.delete("/api/v1/scenes/..%2F..%2Fevil")
    assert resp.status_code in (400, 404)
    if resp.status_code == 400:
        assert resp.json()["code"] == "invalid_scene_id"


def test_fetch_satellite_rejects_excessive_bbox_span():
    # Attempt a 5-degree wide bounding box (~550 km)
    with pytest.raises(ValueError, match="AOI bounding box span cannot exceed"):
        FetchSatelliteRequest(
            bbox={"west": 10.0, "south": 10.0, "east": 15.1, "north": 11.0}
        )


def test_snapshot_rejects_excessive_byte_payload():
    client = TestClient(app)
    # Generate ~16MB base64 string
    oversized_data = b"X" * (16 * 1024 * 1024)
    oversized_b64 = base64.b64encode(oversized_data).decode("utf-8")

    resp = client.post(
        "/api/v1/scenes/snapshot",
        json={
            "image_base64": oversized_b64,
            "bounds": [10.0, 10.0, 10.1, 10.1],
        },
    )
    # Should be rejected with 413 payload_too_large or 422
    assert resp.status_code in (413, 422)


def test_production_guards_on_ai_config():
    client = TestClient(app)
    os.environ["SATQUERY_ENVIRONMENT"] = "production"
    get_settings.cache_clear()

    try:
        resp = client.post(
            "/api/v1/ai/groq-key",
            json={"api_key": "gsk_fake_production_key_12345"},
        )
        assert resp.status_code == 403
        assert resp.json()["code"] == "configuration_locked"

        del_resp = client.delete("/api/v1/ai/groq-key")
        assert del_resp.status_code == 403
        assert del_resp.json()["code"] == "configuration_locked"
    finally:
        os.environ["SATQUERY_ENVIRONMENT"] = "development"
        get_settings.cache_clear()
