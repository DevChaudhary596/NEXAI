"""Verifies M3's real GIS engine (app/services/gis_engine/) is actually wired
in behind app/services/gis.py's GISServiceAdapter - not just importable, but
producing correct index math, correctly-cropped polygons, and a real
georeferenced overlay PNG, end to end through the /api/v1/query API.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from app.core.config import get_settings
from app.core.schemas import BBox
from app.core.schemas.common import Comparison, SpectralIndex
from app.services.gis import GISServiceAdapter, MockGISService, get_gis


@pytest.fixture(scope="module")
def gis():
    return GISServiceAdapter()


def test_get_gis_resolves_to_the_real_adapter_not_mock():
    """Guards against a silent regression to the mock (e.g. a missing dep) -
    exactly the failure mode this whole file exists to catch."""
    svc = get_gis()
    assert isinstance(svc, GISServiceAdapter)
    assert not isinstance(svc, MockGISService)


def test_ndvi_finds_the_vegetation_patch(gis, scene_with_vegetation_and_water):
    fc, overlay, stats = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDVI, 0.5, Comparison.GT, None,
    )
    assert fc.count >= 1
    assert all(f.properties.label == "ndvi" for f in fc.features)
    assert all(f.properties.source == "spectral" for f in fc.features)
    assert stats["mean_index"] > 0.0  # background 0.2 + a strong-positive patch
    assert stats["polygon_count"] == float(fc.count)
    # The 20x20px vegetation patch is a known ~4.93 km^2 at this latitude
    # (20 * 0.001deg ~= 111m/px); loose bounds because polygonize_mask's
    # UTM-estimate area calc isn't pixel-exact.
    assert 3.0 < stats["area_km2"] < 7.0


def test_ndwi_finds_the_water_patch(gis, scene_with_vegetation_and_water):
    fc, overlay, stats = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDWI, 0.5, Comparison.GT, None,
    )
    assert fc.count >= 1
    assert overlay.legend == {"dry": "#8c510a", "moist": "#c7eae5", "water": "#01665e"}


def test_operator_direction_changes_which_pixels_qualify(gis, scene_with_vegetation_and_water):
    """Background NDVI is a flat 0.2; only the seeded patch clears 0.5. Below
    0.5 should therefore flip to "almost everything but the patch" - a much
    larger area than the GT case, proving `operator` actually reaches the
    threshold call rather than being ignored."""
    _, _, gt_stats = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDVI, 0.5, Comparison.GT, None,
    )
    _, _, lt_stats = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDVI, 0.5, Comparison.LT, None,
    )
    assert lt_stats["area_km2"] > gt_stats["area_km2"]


def test_bbox_excludes_features_outside_the_roi(gis, scene_with_vegetation_and_water):
    """Full-scene NDVI must see the seeded patch; an ROI drawn away from it
    (over the water patch's footprint instead) must not - the only way that
    holds is if the bbox is actually cropping pixels before the index math
    runs, not just clipping the output polygons afterward."""
    fc_full, _, _ = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDVI, 0.5, Comparison.GT, None,
    )
    assert fc_full.count >= 1

    away_bbox = BBox(west=77.556, south=13.016, east=77.584, north=13.044)
    fc_away, _, stats_away = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDVI, 0.5, Comparison.GT, away_bbox,
    )
    assert fc_away.count == 0
    assert stats_away["area_km2"] == 0.0


def test_overlay_png_is_written_and_georeferenced(gis, scene_with_vegetation_and_water):
    fc, overlay, _ = gis.spectral(
        scene_with_vegetation_and_water, SpectralIndex.NDVI, 0.3, Comparison.GT, None,
    )
    assert overlay.url == "/api/v1/scenes/veg_water_scene/overlays/ndvi_spectral.png"
    assert overlay.bounds == pytest.approx([77.5, 13.0, 77.6, 13.1], abs=1e-6)

    disk_path = Path(get_settings().overlays_dir) / "veg_water_scene" / "ndvi_spectral.png"
    assert disk_path.exists()
    with Image.open(disk_path) as img:
        assert img.mode == "RGBA"
        assert img.size == (100, 100)


def test_spectral_on_a_scene_without_nir_raises_clearly(gis, three_band_scene):
    with pytest.raises(ValueError, match="spectral indices need"):
        gis.spectral(three_band_scene, SpectralIndex.NDVI, 0.3, Comparison.GT, None)


def test_bi_temporal_detects_the_new_region(gis, bitemporal_scenes):
    scene_a, scene_b = bitemporal_scenes
    fc, overlay, stats = gis.bi_temporal(scene_a, scene_b, SpectralIndex.NDVI, 0.3, None)
    assert fc.count >= 1
    assert "changed_area_km2" in stats
    assert stats["changed_area_km2"] > 0.0
    assert 3.0 < stats["changed_area_km2"] < 7.0  # same 20x20px patch size as the NDVI fixture


def test_scene_metadata_reports_real_raster_properties(gis, scene_with_vegetation_and_water):
    meta = gis.scene_metadata(scene_with_vegetation_and_water)
    assert meta["band_count"] == 4
    assert meta["crs"] is not None
    assert meta["bounds"] == pytest.approx([77.5, 13.0, 77.6, 13.1], abs=1e-6)


# ── Full API round-trip ────────────────────────────────────────────────────

def test_spectral_query_roundtrips_through_the_api(scene_with_vegetation_and_water):
    """End-to-end through /api/v1/query, same shape of check backend-goru's
    test_e2e.py::test_spectral_roundtrip_emits_overlay runs for the mock -
    here against the real M3 engine, including fetching the overlay PNG back
    through the new /scenes/{id}/overlays/{name}.png route."""
    from fastapi.testclient import TestClient

    from app.core.schemas import QueryResponse
    from app.main import app

    with TestClient(app) as client:
        r = client.post("/api/v1/query", json={
            "prompt": "Show flooded areas above 0.5",
            "scene_id": "veg_water_scene",
        })
        assert r.status_code == 200
        body = QueryResponse.model_validate(r.json())
        assert body.routing.tool_call.action.value == "spectral"
        assert body.routing.tool_call.index.value == "ndwi"
        assert len(body.overlays) == 1
        assert body.overlays[0].legend

        overlay_resp = client.get(body.overlays[0].url)
        assert overlay_resp.status_code == 200
        assert overlay_resp.headers["content-type"] == "image/png"
