"""Day 8/9/12 - conversational memory, structured system prompts, and the 3
flagship scenario templates. All exercised against MockVLM/pure functions,
so this suite needs no GPU and runs in CI same as everything else here.
"""
from __future__ import annotations

from app.core.schemas.routing import DetectionCall, SpectralCall, VQACall
from app.core.schemas.common import Comparison, SpectralIndex
from app.services.vlm import (
    ANSWER_SYSTEM_PROMPT, MockVLM, build_system_prompt, select_scenario,
)


def test_select_scenario_flood_from_ndwi():
    call = SpectralCall(index=SpectralIndex.NDWI, threshold=0.5, operator=Comparison.GT)
    assert select_scenario(call, "show flooded areas") == "flood"


def test_select_scenario_agriculture_from_ndvi():
    call = SpectralCall(index=SpectralIndex.NDVI, threshold=0.3, operator=Comparison.GT)
    assert select_scenario(call, "what is the crop health here") == "agriculture"


def test_select_scenario_port_surveillance_from_ship_detection():
    call = DetectionCall(target="ship", confidence=0.3)
    assert select_scenario(call, "how many ships are docked at the port") == "port_surveillance"


def test_select_scenario_none_for_generic_vqa():
    assert select_scenario(VQACall(), "describe this image") is None


def test_build_system_prompt_always_includes_base_rules():
    call = VQACall()
    prompt = build_system_prompt(call, "describe this image")
    assert prompt == ANSWER_SYSTEM_PROMPT


def test_build_system_prompt_layers_scenario_on_top():
    call = SpectralCall(index=SpectralIndex.NDWI, threshold=0.5, operator=Comparison.GT)
    prompt = build_system_prompt(call, "flood assessment")
    assert ANSWER_SYSTEM_PROMPT in prompt
    assert "Flood Assessment" in prompt


def test_mock_vlm_answer_reflects_history_length():
    vlm = MockVLM()
    history = [
        {"role": "user", "content": "how many ships are here?"},
        {"role": "assistant", "content": "3 ships."},
    ]
    out = vlm.answer(
        "how many of those are docked near the eastern pier?",
        context="Detector found 1 instance(s) of 'ship' in the scene, mean confidence 0.80.",
        history=history,
    )
    assert "2 prior turn(s)" in out


def test_mock_vlm_answer_with_no_history_omits_the_note():
    vlm = MockVLM()
    out = vlm.answer("how many ships?", context="Detector found 3 instance(s) of 'ship'.")
    assert "prior turn(s)" not in out


def test_select_scenario_vqa_with_keywords():
    call = VQACall()
    assert select_scenario(call, "Assess flood disaster extent") == "flood"
    assert select_scenario(call, "What is the crop drought stress here?") == "agriculture"
    assert select_scenario(call, "Surveillance of vessels in the naval port") == "port_surveillance"


def test_select_scenario_segmentation_with_keywords():
    from app.core.schemas.routing import SegmentationCall
    call = SegmentationCall(target="water")
    assert select_scenario(call, "Segment the flooded zone") == "flood"
    call_veg = SegmentationCall(target="vegetation")
    assert select_scenario(call_veg, "Segment agricultural crop areas") == "agriculture"


def test_mock_vlm_answer_reflects_history_with_system_prompt():
    vlm = MockVLM()
    history = [
        {"role": "user", "content": "count ships"},
        {"role": "assistant", "content": "2 ships"},
    ]
    out = vlm.answer(
        "any near the pier?",
        context="Detector found 1 ship",
        history=history,
        system_prompt=ANSWER_SYSTEM_PROMPT,
    )
    assert "2 prior turn(s)" in out


def test_mock_vlm_general_vqa_reflects_history():
    vlm = MockVLM()
    history = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]
    out = vlm.answer("what is this scene?", history=history)
    assert "2 prior turn(s)" in out
