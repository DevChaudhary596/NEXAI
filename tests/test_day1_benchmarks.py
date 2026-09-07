"""
Day 1 QA Benchmark Validation Suite.
Validates the curation of the 15 benchmark scenes across Disaster, Agriculture, and Urban tracks.
"""

import json
import os
import pytest
import rasterio
from rasterio.transform import Affine
from app.models.geojson import FeatureCollection, BBox
from app.services.cv_impl import CVService


MANIFEST_PATH = "qa_eval/benchmark_manifest.json"


@pytest.fixture(scope="module")
def manifest():
    assert os.path.exists(MANIFEST_PATH), f"Manifest not found at {MANIFEST_PATH}"
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data


def test_manifest_structure_and_counts(manifest):
    """Verify manifest contains all required tracks and exactly 15 benchmark scenes."""
    assert manifest.get("total_scenes") == 15
    scenes = manifest.get("scenes", [])
    assert len(scenes) == 15

    tracks = {s["track"] for s in scenes}
    assert tracks == {"disaster", "agriculture", "urban"}

    track_counts = {}
    for s in scenes:
        track_counts[s["track"]] = track_counts.get(s["track"], 0) + 1

    assert track_counts["disaster"] == 5
    assert track_counts["agriculture"] == 5
    assert track_counts["urban"] == 5


def test_geotiff_integrity_and_georeferencing(manifest):
    """Verify every GeoTIFF exists, is readable, has EPSG:4326 CRS, and valid affine geotransform."""
    for scene in manifest["scenes"]:
        file_path = scene["file_path"]
        assert os.path.exists(file_path), f"Scene file missing: {file_path}"

        with rasterio.open(file_path) as src:
            assert src.crs is not None, f"CRS missing in {file_path}"
            assert src.crs.to_string() == "EPSG:4326"
            assert src.width >= 512
            assert src.height >= 512
            assert src.count in [3, 4]  # 3-band RGB or 4-band RGB+NIR
            assert isinstance(src.transform, Affine)

            # Check top-left origin coordinates match manifest
            expected_origin = scene["top_left_origin"]
            assert abs(src.transform.c - expected_origin[0]) < 1e-4
            assert abs(src.transform.f - expected_origin[1]) < 1e-4


def test_ground_truth_polygons_and_queries(manifest):
    """Verify ground truth GeoJSON polygons have valid coordinates and sample queries exist."""
    for scene in manifest["scenes"]:
        polys = scene.get("ground_truth_polygons", [])
        assert len(polys) > 0, f"No ground truth polygons for {scene['scene_id']}"

        for poly in polys:
            assert poly["type"] == "Feature"
            geom = poly["geometry"]
            assert geom["type"] == "Polygon"
            coords = geom["coordinates"][0]
            # Polygon ring must be closed
            assert coords[0] == coords[-1], "Polygon boundary must be closed"

        queries = scene.get("sample_queries", [])
        assert len(queries) >= 2, f"Expected at least 2 sample queries for {scene['scene_id']}"


def test_cv_service_on_urban_benchmarks(manifest):
    """Verify Member 2's CVService can execute detection and segmentation on urban benchmark GeoTIFFs."""
    cv = CVService()
    urban_scenes = [s for s in manifest["scenes"] if s["track"] == "urban"]
    assert len(urban_scenes) == 5

    # Test detection on Delhi Airport benchmark
    airport_scene = next(s for s in urban_scenes if "airport" in s["scene_id"])
    det_res = cv.detect(
        scene_path=airport_scene["file_path"],
        target="plane",
        bbox=None,
        confidence=0.25
    )
    assert isinstance(det_res, FeatureCollection)
    assert hasattr(det_res, "features")

    # Test segmentation on Storage Tank benchmark
    tank_scene = next(s for s in urban_scenes if "storage_tanks" in s["scene_id"])
    seg_res = cv.segment(
        scene_path=tank_scene["file_path"],
        target="storage tank",
        bbox=None
    )
    assert isinstance(seg_res, FeatureCollection)
    assert hasattr(seg_res, "features")
