"""
Day 5 QA Unit Tests: Validation of Official SIH Pitch Deck Draft (Slides 1 to 5).
Ensures all required structural slides, problem context, architectural diagrams,
comparative tables, and speaker cues conform to SIH competition criteria.
"""

import os
import re
import pytest

PITCH_DECK_PATH = "qa_eval/pitch_deck_slides_1_to_5.md"


@pytest.fixture(scope="module")
def pitch_deck_content():
    assert os.path.exists(PITCH_DECK_PATH), f"Missing pitch deck file at {PITCH_DECK_PATH}"
    with open(PITCH_DECK_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    return content


def test_pitch_deck_file_size_and_header(pitch_deck_content):
    """Verify pitch deck exists, has substantial content, and states SIH26167 problem statement."""
    assert len(pitch_deck_content) > 3000, "Pitch deck content too brief"
    assert "SIH26167" in pitch_deck_content, "Missing problem statement ID SIH26167"
    assert "ISRO" in pitch_deck_content, "Missing ISRO organization attribution"


def test_all_five_slides_present(pitch_deck_content):
    """Verify all 5 required slides are present with clear demarcations."""
    for slide_num in range(1, 6):
        pattern = rf"SLIDE {slide_num}:"
        assert re.search(pattern, pitch_deck_content), f"Missing SLIDE {slide_num} in pitch deck"


def test_architecture_mermaid_flowchart_exists(pitch_deck_content):
    """Verify Slide 4 contains a well-formed Mermaid architecture flowchart."""
    assert "```mermaid" in pitch_deck_content, "Missing Mermaid flowchart in architecture slide"
    assert "M1: Intent Router" in pitch_deck_content
    assert "M2: Real CV Engine" in pitch_deck_content
    assert "M3: satquery-gis-engine" in pitch_deck_content
    assert "M4: Next.js + Leaflet" in pitch_deck_content
    assert "M5: FastAPI Async Orchestrator" in pitch_deck_content


def test_competitive_advantage_matrix_exists(pitch_deck_content):
    """Verify Slide 5 contains a structured comparative table against generic LLMs and QGIS."""
    assert "| Feature / Metric | Generic Multimodal LLMs" in pitch_deck_content
    assert "Hallucination Risk" in pitch_deck_content
    assert "Zero Cost" in pitch_deck_content
    assert "Grounded Tool Verification" in pitch_deck_content


def test_speaker_cues_present_for_all_slides(pitch_deck_content):
    """Verify every slide has allocated speaker timing cues for team presentation rehearsals."""
    speaker_cues = re.findall(r"Speaker 30-Second Cue", pitch_deck_content)
    assert len(speaker_cues) >= 5, f"Expected at least 5 speaker cues, found {len(speaker_cues)}"
