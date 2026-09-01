"""
Test 8: API Contract Introspection Test.
Verifies that CVService has the EXACT method names, parameter order, types, and return types required.
"""

import inspect
from typing import get_type_hints
import pytest

from app.models.geojson import BBox, FeatureCollection
from app.services.cv_impl import CVService


def test_cv_service_class_exists():
    assert inspect.isclass(CVService), "CVService must be a class"


def test_cv_service_detect_signature():
    assert hasattr(CVService, "detect"), "CVService must have a detect method"
    sig = inspect.signature(CVService.detect)
    param_names = list(sig.parameters.keys())

    # Exact expected parameter order: self, scene_path, target, bbox, confidence
    expected_names = ["self", "scene_path", "target", "bbox", "confidence"]
    assert param_names == expected_names, f"detect() parameters mismatch. Expected {expected_names}, got {param_names}"

    hints = get_type_hints(CVService.detect)
    # Check target is str
    assert hints.get("target") == str, f"target must be str, got {hints.get('target')}"
    # Check confidence is float
    assert hints.get("confidence") == float, f"confidence must be float, got {hints.get('confidence')}"
    # Check return type is FeatureCollection
    assert hints.get("return") == FeatureCollection, f"detect return type must be FeatureCollection, got {hints.get('return')}"


def test_cv_service_segment_signature():
    assert hasattr(CVService, "segment"), "CVService must have a segment method"
    sig = inspect.signature(CVService.segment)
    param_names = list(sig.parameters.keys())

    # Exact expected parameter order: self, scene_path, target, bbox
    expected_names = ["self", "scene_path", "target", "bbox"]
    assert param_names == expected_names, f"segment() parameters mismatch. Expected {expected_names}, got {param_names}"

    hints = get_type_hints(CVService.segment)
    assert hints.get("target") == str, f"target must be str, got {hints.get('target')}"
    assert hints.get("return") == FeatureCollection, f"segment return type must be FeatureCollection, got {hints.get('return')}"
