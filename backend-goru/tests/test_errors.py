"""Error envelope. M1 Day 7.

ErrorResponse promises `detail: str` + `code: str` on every non-2xx. FastAPI's
defaults break that promise two different ways, so these are contract tests,
not implementation tests - M4 branches on `code` and renders `detail` verbatim.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.schemas import ErrorResponse
from app.main import app

ROI = {"bbox": {"west": 77.5, "south": 12.9, "east": 77.7, "north": 13.1}}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_missing_field_is_a_readable_sentence(client):
    """FastAPI's native 422 body is a list of dicts. M4 renders `detail` into a
    chat bubble, so it has to be a string."""
    r = client.post("/api/v1/query", json={"scene_id": "demo"})
    assert r.status_code == 422
    body = ErrorResponse.model_validate(r.json())
    assert body.code == "validation_error"
    assert isinstance(body.detail, str)
    assert "prompt" in body.detail


def test_validator_message_survives(client):
    """The BBox ordering validator's message must reach the user, not be
    swallowed into a generic 'invalid request'."""
    r = client.post("/api/v1/query", json={
        "prompt": "x", "scene_id": "demo",
        "roi": {"bbox": {"west": 99, "south": 0, "east": 1, "north": 2}}})
    body = ErrorResponse.model_validate(r.json())
    assert "west" in body.detail and "east" in body.detail


def test_unknown_key_is_rejected_with_the_key_named(client):
    """schemas use extra='forbid'; a typo in M4's payload should say which key."""
    r = client.post("/api/v1/query", json={
        "prompt": "x", "scene_id": "demo", "scene_id_c": "typo"})
    assert r.status_code == 422
    assert "scene_id_c" in ErrorResponse.model_validate(r.json()).detail


def test_every_error_carries_a_code(client):
    for payload in ({"scene_id": "demo"}, {"prompt": "x"}, {}):
        r = client.post("/api/v1/query", json=payload)
        assert r.status_code >= 400
        assert ErrorResponse.model_validate(r.json()).code


def test_unknown_route_still_uses_the_envelope(client):
    """A 404 from the router itself, not from our handler, must not leak
    FastAPI's bare {'detail': ...} shape."""
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    body = ErrorResponse.model_validate(r.json())
    assert body.code == "not_found"
