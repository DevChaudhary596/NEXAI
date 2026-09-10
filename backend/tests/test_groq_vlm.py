from __future__ import annotations

import os
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.vlm import GroqVLM, MockVLM, get_vlm, reset_vlm
from app.core.config import get_settings


def test_ai_status_endpoint():
    client = TestClient(app)
    resp = client.get("/api/v1/ai/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "backend" in data
    assert "active_backend_name" in data
    assert "groq_configured" in data
    assert "vision_model" in data
    assert "text_model" in data


def test_groq_vlm_initialization():
    os.environ["GROQ_API_KEY"] = "gsk_dummy_test_key_abc123"
    get_settings.cache_clear()
    reset_vlm()

    vlm = get_vlm()
    assert vlm.name == "groq"
    assert isinstance(vlm, GroqVLM)
    assert vlm.model in ("llama-3.2-11b-vision-preview", "qwen/qwen3.8-27b", "llama-3.2-90b-vision-preview")
    assert vlm.text_model in ("llama-3.3-70b-versatile", "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "llama-3.1-8b-instant")

    # Clean up
    os.environ.pop("GROQ_API_KEY", None)
    get_settings.cache_clear()
    reset_vlm()


def test_groq_vlm_answer_mocked():
    os.environ["GROQ_API_KEY"] = "gsk_dummy_test_key_abc123"
    get_settings.cache_clear()
    reset_vlm()

    vlm = GroqVLM(settings=get_settings())
    mock_choice = MagicMock()
    mock_choice.message.content = "SatQuery Intelligence Report:\n- **Analysis**: High vegetation density detected."
    mock_resp = MagicMock()
    mock_resp.choices = [mock_choice]

    with patch.object(vlm.client.chat.completions, "create", return_value=mock_resp) as mock_create:
        answer = vlm.answer(
            "What is in this region?",
            context="Detector found 5 instance(s) of 'plane' in the scene, mean confidence 0.91.",
            history=[{"role": "user", "content": "Hello"}],
            system_prompt="Scenario: Airport surveillance",
        )
        assert "SatQuery Intelligence Report" in answer
        assert mock_create.called
        call_kwargs = mock_create.call_args[1]
        assert call_kwargs["model"] in ("llama-3.3-70b-versatile", "qwen/qwen3.8-27b", "openai/gpt-oss-120b")
        # Verify context was injected
        messages = call_kwargs["messages"]
        user_msg = [m for m in messages if m["role"] == "user"][-1]
        assert "Tool findings (ground truth from trained models)" in user_msg["content"]
        assert "5 instance(s) of 'plane'" in user_msg["content"]

    # Clean up
    os.environ.pop("GROQ_API_KEY", None)
    get_settings.cache_clear()
    reset_vlm()


def test_general_query_without_scene():
    client = TestClient(app)
    resp = client.post(
        "/api/v1/query",
        json={
            "prompt": "What is the difference between NDVI and NDWI in remote sensing?",
            "scene_id": "general",
            "history": [],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data
    assert len(data["answer"]) > 0
    assert data["provenance"]["scene_id"] == "general"
