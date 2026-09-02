"""
Day 6 QA Unit Tests: Validation of Full 10-Slide Deck and 3-Minute Live Pitch Script.
Ensures all 10 presentation slides exist, all 6 team members have synchronized speaking
cues, and live demo trigger points conform to the strict 180-second SIH pitch format.
"""

import os
import re
import pytest

COMPLETE_DECK_PATH = "qa_eval/pitch_deck_complete_10_slides.md"
SCRIPT_PATH = "qa_eval/presentation_script_3min.md"


@pytest.fixture(scope="module")
def complete_deck_content():
    assert os.path.exists(COMPLETE_DECK_PATH), f"Missing {COMPLETE_DECK_PATH}"
    with open(COMPLETE_DECK_PATH, "r", encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def pitch_script_content():
    assert os.path.exists(SCRIPT_PATH), f"Missing {SCRIPT_PATH}"
    with open(SCRIPT_PATH, "r", encoding="utf-8") as f:
        return f.read()


def test_complete_deck_has_all_ten_slides(complete_deck_content):
    """Verify that all 10 slides exist in sequential order with appropriate headers."""
    for slide_idx in range(1, 11):
        pattern = rf"SLIDE {slide_idx}:"
        assert re.search(pattern, complete_deck_content), f"Missing SLIDE {slide_idx} in complete deck"


def test_complete_deck_key_sections(complete_deck_content):
    """Verify critical pitch components are present across the 10 slides."""
    assert "SIH26167" in complete_deck_content
    assert "ISRO" in complete_deck_content
    assert "36-Hour Engineering Execution Plan" in complete_deck_content  # Slide 8
    assert "Distributed Specialization" in complete_deck_content        # Slide 9
    assert "LIVE SYSTEM DEMONSTRATION" in complete_deck_content          # Slide 10


def test_script_timeline_breakdown_180s(pitch_script_content):
    """Verify the live presentation script is structured into acts spanning exactly 180 seconds."""
    assert "00:00 — 00:25" in pitch_script_content
    assert "00:25 — 00:55" in pitch_script_content
    assert "00:55 — 01:25" in pitch_script_content
    assert "01:25 — 01:55" in pitch_script_content
    assert "01:55 — 02:25" in pitch_script_content
    assert "02:25 — 02:50" in pitch_script_content
    assert "02:50 — 03:00" in pitch_script_content


def test_script_covers_all_six_team_members(pitch_script_content):
    """Verify speaking and demo roles are assigned to all 6 team members."""
    for member_idx in range(1, 7):
        assert f"Member {member_idx}" in pitch_script_content, f"Missing speaking role for Member {member_idx}"


def test_live_demo_cues_explicit(pitch_script_content):
    """Verify that live demonstration cues (typing prompt, Kaziranga flood, rendering) are embedded."""
    assert "Live Interface Demo" in pitch_script_content
    assert "Kaziranga" in pitch_script_content
    assert "Calculate NDWI" in pitch_script_content
    assert "Screen Action" in pitch_script_content
