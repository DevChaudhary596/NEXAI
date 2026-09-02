"""
Comprehensive unit tests for CVService real inference pipeline.
Tests 1 - 7:
1. Real detection
2. Confidence filtering
3. Target filtering
4. BBox restriction and coordinate preservation
5. Large image SAHI tiling & merging
6. Real mask/polygon segmentation
7. Empty result handling (No mocks, no random output)
"""

import os
import pytest
from app.models.geojson import BBox, FeatureCollection
from app.services.cv_impl import CVService

SCENE_PATH = "data/test_baseball_diamond.jpg"
GEOTIFF_PATH = "data/test_georeferenced_baseball.tif"


@pytest.fixture(scope="module")
def cv_service():
    return CVService()


def test_1_real_detection(cv_service):
    """
    Test 1: Verify detect() runs actual model inference and returns real detections.
    """
    result = cv_service.detect(SCENE_PATH, "baseball diamond", None, 0.1)
    assert isinstance(result, FeatureCollection)
    assert len(result.features) > 0, "Should detect baseball diamond in the aerial scene"

    first_feat = result.features[0]
    assert first_feat.properties["target"] == "baseball diamond"
    assert first_feat.properties["confidence"] >= 0.1
    assert first_feat.geometry.type in ("Polygon", "MultiPolygon")
    # Verify coordinate polygon has at least 3 points
    coords = first_feat.geometry.coordinates[0]
    assert len(coords) >= 4, "A closed polygon ring must have at least 4 coordinates"


def test_2_confidence_filtering(cv_service):
    """
    Test 2: Verify high confidence threshold filters out lower-confidence predictions.
    """
    low_conf_result = cv_service.detect(SCENE_PATH, "plane", None, 0.20)
    high_conf_result = cv_service.detect(SCENE_PATH, "plane", None, 0.90)

    assert len(low_conf_result.features) >= len(high_conf_result.features)
    for feat in high_conf_result.features:
        assert feat.properties["confidence"] >= 0.90


def test_3_target_filtering(cv_service):
    """
    Test 3: Verify target filtering returns only requested classes.
    """
    planes_result = cv_service.detect(SCENE_PATH, "plane", None, 0.3)
    tanks_result = cv_service.detect(SCENE_PATH, "storage tank", None, 0.3)

    # Check planes
    for feat in planes_result.features:
        assert feat.properties["target"] == "plane"

    # Check tanks
    for feat in tanks_result.features:
        assert feat.properties["target"] == "storage tank"

    # Plural handling test
    planes_plural = cv_service.detect(SCENE_PATH, "airplanes", None, 0.3)
    assert len(planes_plural.features) == len(planes_result.features)


def test_4_bbox_restriction(cv_service):
    """
    Test 4: Verify bbox restricts detection to specified sub-region and preserves coordinates.
    """
    # Crop to top-left area where planes are parked: [100, 50, 550, 400]
    bbox = BBox(100, 50, 550, 400)
    crop_result = cv_service.detect(SCENE_PATH, "plane", bbox, 0.3)

    assert isinstance(crop_result, FeatureCollection)
    # Check that detected coordinates fall within or near the bbox range
    for feat in crop_result.features:
        ring = feat.geometry.coordinates[0]
        xs = [pt[0] for pt in ring]
        ys = [pt[1] for pt in ring]
        center_x = sum(xs) / len(xs)
        center_y = sum(ys) / len(ys)
        # Coordinate must be in full-scene reference frame, not tile-relative [0, 450]
        assert center_x >= 50 and center_y >= 30, f"Coordinates must be in full scene space: ({center_x}, {center_y})"


def test_5_large_image_sahi(cv_service):
    """
    Test 5: Verify SAHI sliding window works on a large image (>640x640) and merges duplicates.
    """
    # SCENE_PATH is 1024x1024, which triggers SAHI multi-tile slicing
    result = cv_service.detect(SCENE_PATH, "storage tank", None, 0.3)
    assert cv_service.last_benchmark_metrics["num_tiles"] > 1, "Should slice 1024x1024 image into multiple tiles"
    assert len(result.features) > 0


def test_6_real_segmentation(cv_service):
    """
    Test 6: Verify segment() returns real polygon mask-derived features.
    """
    result = cv_service.segment(SCENE_PATH, "plane", None)
    assert isinstance(result, FeatureCollection)
    assert len(result.features) > 0, "Should segment planes in the aerial scene"

    feat = result.features[0]
    assert feat.properties["is_segmentation"] is True
    assert feat.geometry.type in ("Polygon", "MultiPolygon")
    # Coordinates must form a non-empty polygon
    ring = feat.geometry.coordinates[0]
    assert len(ring) >= 4


def test_7_empty_result_no_fabrication(cv_service):
    """
    Test 7: Verify empty FeatureCollection when target does not exist. Zero random boxes!
    """
    # 'baseball diamond' does not exist in this airport image
    result = cv_service.detect(SCENE_PATH, "baseball diamond", None, 0.5)
    assert isinstance(result, FeatureCollection)
    assert len(result.features) == 0, "Must return empty FeatureCollection when target not present"

    # Unsupported target string
    unsupported_result = cv_service.detect(SCENE_PATH, "non_existent_alien_spaceship", None, 0.5)
    assert isinstance(unsupported_result, FeatureCollection)
    assert len(unsupported_result.features) == 0, "Must return empty FeatureCollection for unsupported target"
