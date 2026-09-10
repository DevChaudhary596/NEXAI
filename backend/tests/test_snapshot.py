import base64
import io
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_create_snapshot_scene():
    img = Image.new("RGB", (128, 128), color=(40, 80, 160))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    res = client.post(
        "/api/v1/scenes/snapshot",
        json={
            "image_base64": b64,
            "bounds": [4.0, 51.9, 4.1, 52.0],
            "label": "Live Viewport Rotterdam",
            "is_roi": False,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert "scene_id" in data
    assert data["filename"] == "Live Viewport Rotterdam"
    assert data["bounds"] == [4.0, 51.9, 4.1, 52.0]
    assert data["crs"] == "EPSG:4326"
    assert data["band_count"] == 3


def test_create_snapshot_scene_drawn_roi():
    img = Image.new("RGB", (64, 64), color=(20, 140, 60))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64 = f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"

    res = client.post(
        "/api/v1/scenes/snapshot",
        json={
            "image_base64": b64,
            "bounds": [-122.38, 37.61, -122.36, 37.63],
            "is_roi": True,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert "Drawn AOI" in data["filename"]
