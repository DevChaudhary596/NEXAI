"""
Day 4 QA Unit Tests: Validation of Failure Mode Telemetry and Stress Resilience.
Ensures negative controls, malformed geometry inputs, zero-division math, and
evaluation report artifacts conform to strict quality standards.
"""

import json
import os
import sys
import pytest
import numpy as np

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIS_SRC = os.path.join(REPO_ROOT, "satquery-gis-engine", "src")
if GIS_SRC not in sys.path:
    sys.path.insert(0, GIS_SRC)

from app.models.geojson import BBox, FeatureCollection
from app.services.cv_impl import CVService
from satquery.indices.calculator import calculate_ndvi


REPORT_MD_PATH = "qa_eval/qa_evaluation_report_week1.md"
FAILURE_JSON_PATH = "qa_eval/reports/failure_modes.json"
AIRPORT_SCENE = "data/benchmark_scenes/urban/urban_01_delhi_airport_runway.tif"
TANK_SCENE = "data/benchmark_scenes/urban/urban_03_refinery_storage_tanks.tif"


@pytest.fixture(scope="module")
def failure_telemetry():
    assert os.path.exists(FAILURE_JSON_PATH), f"Missing {FAILURE_JSON_PATH}"
    with open(FAILURE_JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def test_failure_analysis_report_files_exist():
    """Verify both formal evaluation report and JSON telemetry files exist and are populated."""
    assert os.path.exists(REPORT_MD_PATH)
    assert os.path.getsize(REPORT_MD_PATH) > 1000

    assert os.path.exists(FAILURE_JSON_PATH)
    assert os.path.getsize(FAILURE_JSON_PATH) > 200


def test_negative_control_zero_false_positives():
    """Verify querying an out-of-domain target returns exactly 0 detections cleanly."""
    cv = CVService()
    res = cv.detect(AIRPORT_SCENE, target="submarine", bbox=None, confidence=0.3)
    assert isinstance(res, FeatureCollection)
    assert len(res.features) == 0


def test_malformed_bbox_resilience():
    """Verify inverted bounding box returns empty collection without crashing."""
    cv = CVService()
    inverted_bbox = BBox(1000, 1000, 200, 200)
    res = cv.detect(TANK_SCENE, target="storage tank", bbox=inverted_bbox, confidence=0.3)
    assert isinstance(res, FeatureCollection)
    assert len(res.features) == 0


def test_radiometric_zero_division_safety():
    """Verify zero-reflectance inputs produce no infinite values."""
    zeros = np.zeros((50, 50), dtype=np.float32)
    result = calculate_ndvi(zeros, zeros)
    assert not np.isinf(result).any(), "Result contains infinite values"


def test_telemetry_schema_and_experiments(failure_telemetry):
    """Verify failure modes telemetry captures all required stress test experiments."""
    experiments = failure_telemetry.get("experiments", {})
    required_experiments = {
        "negative_control",
        "malformed_roi",
        "cloud_cover_stress",
        "radiometric_zero_division",
        "router_drift",
    }
    for exp in required_experiments:
        assert exp in experiments, f"Missing required experiment telemetry: {exp}"
        assert "finding" in experiments[exp]
        assert "status" in experiments[exp]
