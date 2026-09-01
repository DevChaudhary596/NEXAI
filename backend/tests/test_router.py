"""Router accuracy matrix. M1 Day 5 milestone + seed for M6's 50-query set.

Each row is (prompt, expected_action, expected_target_or_index). `None` means
"don't care". Extend this rather than writing new one-off tests - M6 reads the
same table for the QA harness.
"""
from __future__ import annotations

import pytest

from app.core.schemas import RoutingSource
from app.services.router import IntentRouter, route_by_rules

ROUTER_MATRIX: list[tuple[str, str, str | None]] = [
    # --- detection -----------------------------------------------------------
    ("How many storage tanks are in this area?", "detection", "storage_tank"),
    ("Count the ships in the harbor", "detection", "ship"),
    ("Find all aircraft on the runway", "detection", "plane"),
    ("Detect vehicles in the parking lot", "detection", "vehicle"),
    ("how many buildings are there", "detection", "building"),
    ("locate the bridges", "detection", "bridge"),
    ("Show me all swimming pools", "detection", "swimming_pool"),
    ("identify helicopters on the pad", "detection", "helicopter"),
    ("number of oil tanks visible", "detection", "storage_tank"),
    ("are there any boats docked", "detection", "ship"),
    ("list all trucks", "detection", "vehicle"),
    ("spot the roundabouts", "detection", "roundabout"),
    ("ships", "detection", "ship"),
    ("storage tanks", "detection", "storage_tank"),
    # --- segmentation --------------------------------------------------------
    ("Segment the water bodies", "segmentation", "water"),
    ("Outline the building footprints", "segmentation", "building"),
    ("Mask the vegetation canopy", "segmentation", "vegetation"),
    ("delineate the road network", "segmentation", "road"),
    ("trace the lake boundary", "segmentation", "water"),
    ("give me the exact shape of the rooftops", "segmentation", "building"),
    ("mask bare soil", "segmentation", "bare_soil"),
    # --- spectral ------------------------------------------------------------
    ("What is the extent of flooding?", "spectral", "ndwi"),
    ("Show flooded areas", "spectral", "ndwi"),
    ("Compute NDWI for this region", "spectral", "ndwi"),
    ("Which parts are waterlogged?", "spectral", "ndwi"),
    ("Analyse crop health in this field", "spectral", "ndvi"),
    ("Show vegetation with NDVI above 0.4", "spectral", "ndvi"),
    ("Which areas have NDVI below 0.2?", "spectral", "ndvi"),
    ("assess drought impact on farmland", "spectral", "ndvi"),
    ("Map the built-up area", "spectral", "ndbi"),
    ("How much urban sprawl is there?", "spectral", "ndbi"),
    ("show impervious surfaces", "spectral", "ndbi"),
    # --- general VQA ---------------------------------------------------------
    ("What is in this image?", "general_vqa", None),
    ("Describe the scene", "general_vqa", None),
    ("Explain what you see here", "general_vqa", None),
    ("Is this an industrial zone?", "general_vqa", None),
    ("summarise this satellite image", "general_vqa", None),
    ("caption this scene", "general_vqa", None),
]


@pytest.mark.parametrize("prompt,action,detail", ROUTER_MATRIX)
def test_router_matrix(prompt: str, action: str, detail: str | None):
    decision = IntentRouter(rules_only=True).route(prompt)
    call = decision.tool_call
    assert call.action.value == action, f"{prompt!r} -> {call.action.value}"
    if detail is not None:
        got = getattr(call, "target", None) or getattr(call, "index", None)
        got = getattr(got, "value", got)
        assert got == detail, f"{prompt!r} -> {got}, expected {detail}"


def test_rules_cover_the_whole_matrix():
    """Every rehearsed query must resolve deterministically. A miss here means
    that query depends on the GPU at demo time."""
    misses = [p for p, _, _ in ROUTER_MATRIX if route_by_rules(p) is None]
    assert not misses, f"{len(misses)} query(s) fell through to the VLM: {misses}"


def test_threshold_and_operator_extraction():
    d = IntentRouter(rules_only=True).route("Show vegetation with NDVI above 0.45")
    assert d.tool_call.threshold == 0.45
    assert d.tool_call.operator.value == "gt"
    d = IntentRouter(rules_only=True).route("areas where NDVI is below 0.15")
    assert d.tool_call.threshold == 0.15
    assert d.tool_call.operator.value == "lt"


@pytest.mark.parametrize("prompt", [
    "Show me the change in water extent since last year",
    "Compare vegetation before and after the drought",
    "Detect urban expansion over time",
])
def test_bi_temporal_flag(prompt: str):
    assert IntentRouter(rules_only=True).route(prompt).tool_call.bi_temporal is True


def test_counting_verb_beats_spectral_keyword():
    """'how many buildings' is a detection even though 'building' is also an
    NDBI-adjacent word. Ordering regression guard."""
    d = IntentRouter(rules_only=True).route("how many buildings are in this district")
    assert d.tool_call.action.value == "detection"


def test_segmentation_verb_beats_ndwi_keyword():
    d = IntentRouter(rules_only=True).route("segment the water")
    assert d.tool_call.action.value == "segmentation"


class _BrokenVLM:
    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        return "I think you should use the detection tool!"


class _CrashingVLM:
    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        raise RuntimeError("CUDA out of memory")


def test_unparseable_vlm_output_degrades_to_vqa():
    d = IntentRouter(_BrokenVLM()).route("zorble the quux")
    assert d.tool_call.action.value == "general_vqa"
    assert d.source is RoutingSource.FALLBACK


def test_vlm_exception_does_not_propagate():
    """An OOM in routing must not 500 the request."""
    d = IntentRouter(_CrashingVLM()).route("zorble the quux")
    assert d.tool_call.action.value == "general_vqa"
    assert d.source is RoutingSource.FALLBACK
