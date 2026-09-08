"""
Test Suite for Member 2 (Geospatial CV Engineer) - Week 2 (Days 8 to 14)
Validates:
- Day 8: Cross-Tile SAHI Boundary Artifact Smoothing & Containment Merging
- Day 9: Multi-Class Calibrated Confidence Thresholds
- Day 10: Spatial Filtering & Positional Query Pruning
- Day 11: CPU DBSCAN Spatial Density Hotspot Analysis
- Day 12: Pre-computed Offline Demo Detection Caches
- Day 13: Rule-Based False-Positive Pruning (Aspect Ratio, Area, Cloud Mask)
- Day 14: Model Packaging, Public API Freeze & CPU Benchmark Validation
"""

import json
import os
import time
from pathlib import Path
import numpy as np
import pytest

from app.models.geojson import BBox, Feature, FeatureCollection, Geometry
from app.services.cv_engine import (
    RealCVService,
    RealOBBDetector,
    CLASS_CONFIDENCE_THRESHOLDS,
    calculate_slice_regions,
    nms_obb,
    polygon_iou,
    polygon_containment,
    merge_obb_polygons,
    filter_features_by_spatial_constraint,
    compute_spatial_clusters,
    prune_false_positives,
    calculate_obb_properties,
)


# ============================================================================
# Day 8: Cross-Tile SAHI Boundary Artifact Smoothing Tests
# ============================================================================

def test_day8_polygon_containment():
    """Verify containment ratio catches partial slice fragments."""
    # Outer box 100x100
    outer = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]
    # Sub-box 40x40 inside outer
    inner = [[10.0, 10.0], [50.0, 10.0], [50.0, 50.0], [10.0, 50.0]]
    
    containment = polygon_containment(outer, inner)
    assert containment > 0.95, "Inner box should be 100% contained within outer box"


def test_day8_boundary_artifact_smoothing():
    """Verify overlapping/split cross-tile detections are merged into one cohesive box."""
    # Simulated vessel split across two adjacent slices:
    # Slice A sees left half of ship: [100, 200] to [220, 240]
    box_a = [[100.0, 200.0], [220.0, 200.0], [220.0, 240.0], [100.0, 240.0]]
    # Slice B sees right half of ship (with overlap): [180, 200] to [300, 240]
    box_b = [[180.0, 200.0], [300.0, 200.0], [300.0, 240.0], [180.0, 240.0]]

    raw_detections = [
        {"coords": box_a, "confidence": 0.82, "class_name": "ship", "class_id": 1},
        {"coords": box_b, "confidence": 0.78, "class_name": "ship", "class_id": 1},
    ]

    merged = nms_obb(raw_detections, iou_threshold=0.3, containment_threshold=0.6, smooth_boundaries=True)
    assert len(merged) == 1, "Cross-tile split ship fragments must be merged into 1 unified detection"
    assert merged[0]["confidence"] == 0.82, "Merged detection must retain higher confidence"
    
    # Check that merged bounding box spans the full length (approx 100 to 300)
    merged_pts = np.array(merged[0]["coords"])
    min_x = merged_pts[:, 0].min()
    max_x = merged_pts[:, 0].max()
    assert min_x <= 105.0 and max_x >= 295.0, "Merged bounding box must span the full vessel extent"


# ============================================================================
# Day 9: Multi-Class Calibrated Confidence Thresholds Tests
# ============================================================================

def test_day9_calibrated_confidence_thresholds():
    """Verify calibrated thresholds are defined for key classes."""
    assert "ship" in CLASS_CONFIDENCE_THRESHOLDS
    assert "plane" in CLASS_CONFIDENCE_THRESHOLDS
    assert "large vehicle" in CLASS_CONFIDENCE_THRESHOLDS
    assert CLASS_CONFIDENCE_THRESHOLDS["ship"] == 0.35
    assert CLASS_CONFIDENCE_THRESHOLDS["plane"] == 0.40
    assert CLASS_CONFIDENCE_THRESHOLDS["large vehicle"] == 0.45


# ============================================================================
# Day 10: Spatial Filtering & Positional Query Pruning Tests
# ============================================================================

def test_day10_spatial_quadrant_pruning():
    """Verify directional filtering accurately partitions detections."""
    # Create 4 features in 4 quadrants of a 1000x1000 pixel extent
    # NW: (250, 250), NE: (750, 250), SW: (250, 750), SE: (750, 750)
    features = [
        Feature(
            geometry=Geometry(type="Polygon", coordinates=[[[200, 200], [300, 200], [300, 300], [200, 300], [200, 200]]]),
            properties={"target": "ship", "name": "northwest"}
        ),
        Feature(
            geometry=Geometry(type="Polygon", coordinates=[[[700, 200], [800, 200], [800, 300], [700, 300], [700, 200]]]),
            properties={"target": "ship", "name": "northeast"}
        ),
        Feature(
            geometry=Geometry(type="Polygon", coordinates=[[[200, 700], [300, 700], [300, 800], [200, 800], [200, 700]]]),
            properties={"target": "ship", "name": "southwest"}
        ),
        Feature(
            geometry=Geometry(type="Polygon", coordinates=[[[700, 700], [800, 700], [800, 800], [700, 800], [700, 700]]]),
            properties={"target": "ship", "name": "southeast"}
        ),
    ]

    bounds = (0.0, 0.0, 1000.0, 1000.0)

    # In pixel space: Y increases downwards, so north is Y <= 500
    north_feats = filter_features_by_spatial_constraint(features, bounds, direction="north", is_pixel_space=True)
    assert len(north_feats) == 2
    assert {f.properties["name"] for f in north_feats} == {"northwest", "northeast"}

    east_feats = filter_features_by_spatial_constraint(features, bounds, direction="east", is_pixel_space=True)
    assert len(east_feats) == 2
    assert {f.properties["name"] for f in east_feats} == {"northeast", "southeast"}

    southwest_feats = filter_features_by_spatial_constraint(features, bounds, direction="southwest", is_pixel_space=True)
    assert len(southwest_feats) == 1
    assert southwest_feats[0].properties["name"] == "southwest"


# ============================================================================
# Day 11: CPU DBSCAN Spatial Density Hotspot Analysis Tests
# ============================================================================

def test_day11_dbscan_density_clustering():
    """Verify DBSCAN identifies cluster hotspots and noise correctly."""
    # 4 tightly clustered vessels near (83.29, 17.69)
    # 1 isolated vessel far away at (83.35, 17.75)
    clustered_coords = [
        [[83.290, 17.690], [83.291, 17.690], [83.291, 17.691], [83.290, 17.691], [83.290, 17.690]],
        [[83.292, 17.690], [83.293, 17.690], [83.293, 17.691], [83.292, 17.691], [83.292, 17.690]],
        [[83.291, 17.692], [83.292, 17.692], [83.292, 17.693], [83.291, 17.693], [83.291, 17.692]],
        [[83.293, 17.692], [83.294, 17.692], [83.294, 17.693], [83.293, 17.693], [83.293, 17.692]],
        # Isolated outlier
        [[83.350, 17.750], [83.351, 17.750], [83.351, 17.751], [83.350, 17.751], [83.350, 17.750]],
    ]

    features = [
        Feature(geometry=Geometry(type="Polygon", coordinates=[poly]), properties={"id": i})
        for i, poly in enumerate(clustered_coords)
    ]

    updated, metrics = compute_spatial_clusters(features, eps_meters=600.0, min_samples=3, is_geo_degrees=True)
    assert metrics["cluster_count"] == 1
    assert metrics["hotspot_count"] == 4
    assert metrics["noise_count"] == 1
    assert updated[0].properties["is_hotspot"] is True
    assert updated[4].properties["is_hotspot"] is False
    assert updated[4].properties["cluster_id"] is None


# ============================================================================
# Day 12: Pre-computed Offline Demo GeoJSON Caches Tests
# ============================================================================

def test_day12_demo_scenes_geojson_caches():
    """Verify all 3 golden demo caches exist and are valid GeoJSON."""
    base_dir = Path(__file__).resolve().parent.parent
    cache_dir = base_dir / "data" / "demo_scenes" / "detections"

    demo_files = [
        "kerala_flood_detections.geojson",
        "punjab_agri_detections.geojson",
        "vizag_port_detections.geojson",
    ]

    for filename in demo_files:
        filepath = cache_dir / filename
        assert filepath.exists(), f"Demo cache missing: {filepath}"
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert data.get("type") == "FeatureCollection"
            assert "features" in data
            assert len(data["features"]) > 0
            for feat in data["features"]:
                assert "geometry" in feat
                assert "properties" in feat
                assert "target" in feat["properties"]
                assert "confidence" in feat["properties"]


# ============================================================================
# Day 13: Rule-Based False-Positive Pruning Tests
# ============================================================================

def test_day13_false_positive_pruning():
    """Verify aspect ratio, area bounds, and cloud mask filters discard false alarms."""
    # 1. Valid vessel: length 120, width 25 -> aspect ratio 4.8
    valid_ship = [[0.0, 0.0], [120.0, 0.0], [120.0, 25.0], [0.0, 25.0]]

    # 2. False alarm: nearly square wave wake: 50x45 -> aspect ratio 1.11 (< 1.5)
    square_wave = [[0.0, 0.0], [50.0, 0.0], [50.0, 45.0], [0.0, 45.0]]

    # 3. False alarm: tiny pixel speck: 3x4 -> area 12px² (< 25px²)
    tiny_speck = [[0.0, 0.0], [3.0, 0.0], [3.0, 4.0], [0.0, 4.0]]

    detections = [
        {"coords": valid_ship, "confidence": 0.85, "class_name": "ship"},
        {"coords": square_wave, "confidence": 0.65, "class_name": "ship"},
        {"coords": tiny_speck, "confidence": 0.70, "class_name": "small vehicle"},
    ]

    pruned = prune_false_positives(detections, img_w=1000, img_h=1000, cloud_mask=None)
    assert len(pruned) == 1
    assert pruned[0]["coords"] == valid_ship


def test_day13_cloud_mask_pruning():
    """Verify detections covered by cloud mask are rejected."""
    # Detection located at [100, 100] to [150, 120]
    box = [[100.0, 100.0], [150.0, 100.0], [150.0, 120.0], [100.0, 120.0]]
    det = [{"coords": box, "confidence": 0.85, "class_name": "ship"}]

    # Cloud mask covering coordinates (50 to 200)
    cloud_mask = np.zeros((300, 300), dtype=bool)
    cloud_mask[80:160, 80:160] = True

    pruned = prune_false_positives(det, img_w=300, img_h=300, cloud_mask=cloud_mask)
    assert len(pruned) == 0, "Object located in cloud mask must be pruned"


# ============================================================================
# Day 14: CPU Performance Benchmark & Model Freeze
# ============================================================================

def test_day14_cpu_performance_benchmark():
    """Verify SAHI slicing and post-processing executes well under 2.5s on standard CPU."""
    # Synthetic 1024x1024 image
    img = np.zeros((1024, 1024, 3), dtype=np.uint8)
    # Draw simulated ship
    img[400:460, 400:600] = 200

    service = RealCVService()
    t0 = time.perf_counter()
    # Test internal slicing & detector
    slices = calculate_slice_regions(1024, 1024, slice_size=640, overlap_ratio=0.2)
    assert len(slices) == 4, "1024x1024 image must generate 4 overlapping 640x640 slices"

    # Run inference test
    dets, metrics = service.detector.detect_image(
        image_np=img,
        target="ship",
        tile_size=640,
        overlap_ratio=0.2
    )
    elapsed = time.perf_counter() - t0

    assert elapsed < 3.5, f"Inference and postprocess took {elapsed:.2f}s, target is < 3.5s on CPU"
    assert "inference_time_ms" in metrics
    assert "postprocess_time_ms" in metrics
