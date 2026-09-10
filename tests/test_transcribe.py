"""Day 10 - /api/v1/transcribe against MockASR (default backend, no audio
libs / model download needed - same CI-safety contract as MockVLM)."""
from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.main import app


def test_transcribe_returns_mock_transcript():
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/transcribe",
            files={"file": ("clip.webm", io.BytesIO(b"not-really-audio-but-non-empty"), "audio/webm")},
        )

    assert r.status_code == 200
    body = r.json()
    assert body["backend"] == "mock"
    assert body["text"] == "how many ships are in this scene"


def test_transcribe_rejects_unsupported_extension():
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/transcribe",
            files={"file": ("clip.txt", io.BytesIO(b"hello"), "text/plain")},
        )

    assert r.status_code == 400
    assert r.json()["code"] == "invalid_file_type"


def test_transcribe_rejects_empty_file():
    with TestClient(app) as client:
        r = client.post(
            "/api/v1/transcribe",
            files={"file": ("clip.webm", io.BytesIO(b""), "audio/webm")},
        )

    assert r.status_code == 400
    assert r.json()["code"] == "empty_recording"


def test_transcribe_and_ingest_into_vlm_query(scene_with_vegetation_and_water):
    """Day 10: transcribe output drops into VLM prompt ingestion pipeline."""
    with TestClient(app) as client:
        # 1. Voice transcription
        r_audio = client.post(
            "/api/v1/transcribe",
            files={"file": ("clip.webm", io.BytesIO(b"audio-bytes"), "audio/webm")},
        )
        assert r_audio.status_code == 200
        transcript = r_audio.json()["text"]

        # 2. Feed transcript directly to /api/v1/query
        r_query = client.post(
            "/api/v1/query",
            json={"prompt": transcript, "scene_id": "veg_water_scene"},
        )
        assert r_query.status_code == 200
        data = r_query.json()
        assert data["routing"]["tool_call"]["action"] == "detection"
        assert data["answer"]
