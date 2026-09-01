"""Contract freeze. M1 Day 7.

These tests are the freeze: if one fails, the wire format changed and every
other member's code is affected. Bump CONTRACT_VERSION and tell the team -
do not just update the assertion.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.schemas import (
    CONTRACT_VERSION, BBox, DetectionCall, QueryRequest, QueryResponse,
    RoutingDecision, SpectralCall,
)


def test_contract_version_pinned():
    assert CONTRACT_VERSION == "0.1.0"


def test_query_request_minimal():
    r = QueryRequest(prompt="what is here", scene_id="s1")
    assert r.roi is None and r.scene_id_b is None


def test_query_request_rejects_unknown_field():
    # extra="forbid" is what catches a typo in M4's fetch body at the boundary
    # instead of silently ignoring it.
    with pytest.raises(ValidationError):
        QueryRequest(prompt="x", scene_id="s1", region={"bbox": []})


def test_bbox_ordering_enforced():
    with pytest.raises(ValidationError):
        BBox(west=10.0, south=0.0, east=5.0, north=1.0)
    with pytest.raises(ValidationError):
        BBox(west=0.0, south=10.0, east=5.0, north=1.0)


def test_bbox_range_enforced():
    with pytest.raises(ValidationError):
        BBox(west=-200.0, south=0.0, east=5.0, north=1.0)


def test_tool_call_discriminated_union_resolves():
    d = RoutingDecision(
        tool_call={"action": "detection", "target": "ship"},
        confidence=0.9, rationale="t", source="rules",
    )
    assert isinstance(d.tool_call, DetectionCall)
    assert d.tool_call.confidence == 0.25  # documented default


def test_detection_target_is_closed_vocabulary():
    with pytest.raises(ValidationError):
        DetectionCall(target="unicorn")


def test_spectral_threshold_bounds():
    with pytest.raises(ValidationError):
        SpectralCall(index="ndvi", threshold=5.0)


def test_response_json_shape_is_stable():
    """The exact key set M4 destructures. Adding a key is fine; removing or
    renaming one breaks the frontend."""
    r = QueryResponse(
        answer="a",
        routing=RoutingDecision(
            tool_call={"action": "general_vqa"}, confidence=1.0,
            rationale="r", source="rules",
        ),
    )
    payload = r.model_dump(mode="json")
    assert set(payload) == {
        "contract_version", "answer", "routing", "geojson",
        "overlays", "stats", "timings", "peak_vram_gb",
    }
    assert payload["geojson"] == {"type": "FeatureCollection", "features": []}
