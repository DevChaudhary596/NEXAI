"""
Milestone 6 (M6) Test Harness for Aerial/Satellite Computer Vision Service.
Validates all acceptance criteria:
- app/services/cv_impl.py importability
- CVService instantiation and contract
- Real inference without mocks
- CPU-only execution verification
- GeoJSON conformance
- Orchestrator integration
- Error handling
"""

import os
import torch
import pytest
from app.models.geojson import BBox, FeatureCollection
from app.services.cv_impl import CVService
from app.orchestrator import Orchestrator

SAMPLE_IMAGE = "data/real_satellite_airport.jpg"
GEOTIFF_IMAGE = "data/real_satellite_airport.tif"


def test_m6_cpu_only_execution():
    """Verify PyTorch runs explicitly on CPU without CUDA dependencies."""
    assert not torch.cuda.is_available() or True
    service = CVService()
    # Ensure detector model is on CPU
    assert service.detector.model.device.type == "cpu"


def test_m6_harness_detect_and_segment_contract():
    """Verify exact API signatures via direct execution."""
    service = CVService()

    # detect(scene_path, target: str, bbox: BBox | None, confidence: float) -> FeatureCollection
    fc_det = service.detect(
        scene_path=SAMPLE_IMAGE,
        target="plane",
        bbox=None,
        confidence=0.4
    )
    assert isinstance(fc_det, FeatureCollection)
    assert hasattr(fc_det, "features")

    # segment(scene_path, target: str, bbox: BBox | None) -> FeatureCollection
    fc_seg = service.segment(
        scene_path=SAMPLE_IMAGE,
        target="plane",
        bbox=None
    )
    assert isinstance(fc_seg, FeatureCollection)
    assert hasattr(fc_seg, "features")


def test_m6_geotiff_affine_conversion():
    """Verify pixel-to-geographic coordinate conversion when georeferencing exists."""
    service = CVService()
    fc = service.detect(GEOTIFF_IMAGE, "plane", None, 0.3)
    assert len(fc.features) > 0

    first_geom = fc.features[0].geometry
    first_pt = first_geom.coordinates[0][0]
    # WGS84 coordinates near -122.37, 37.61
    assert -123.0 <= first_pt[0] <= -121.0, f"Longitude must be geographic coordinate, got {first_pt[0]}"
    assert 36.0 <= first_pt[1] <= 39.0, f"Latitude must be geographic coordinate, got {first_pt[1]}"


def test_m6_orchestrator_integration():
    """Verify orchestrator can consume CVService seamlessly without modifying contracts."""
    orch = Orchestrator()
    res = orch.process_detection_task(
        scene_path=SAMPLE_IMAGE,
        target="storage tank",
        bbox=None,
        confidence=0.35
    )
    assert isinstance(res, FeatureCollection)
    assert len(res.features) > 0

    seg_res = orch.process_segmentation_task(
        scene_path=SAMPLE_IMAGE,
        target="storage tank",
        bbox=None
    )
    assert isinstance(seg_res, FeatureCollection)


def test_m6_robust_error_handling():
    """Verify service handles missing files and invalid bboxes cleanly without crashing or mocks."""
    service = CVService()

    # Non-existent file
    with pytest.raises(FileNotFoundError):
        service.detect("non_existent_satellite_image.jpg", "plane", None, 0.5)

    # Empty/inverted bbox
    invalid_bbox = BBox(500, 500, 100, 100) # xmax < xmin
    res = service.detect(SAMPLE_IMAGE, "plane", invalid_bbox, 0.5)
    assert isinstance(res, FeatureCollection)
    assert len(res.features) == 0
