"""Member 6 QA Evaluation: Automated Unit Tests for Member 3's GIS Engine.
Covers:
1. Division by zero / nodata edge cases (flat zeroes, black borders)
2. Mathematical range validation (strictly -1.0 to +1.0)
3. Vector polygonization and metric area computation
4. Spectral indices (NDVI, NDWI, NDBI)
"""
import pytest
import numpy as np
import rasterio
from pathlib import Path

from satquery.indices.calculator import calculate_ndvi, calculate_ndwi, calculate_ndbi, normalized_difference
from satquery.raster.masking import threshold
from satquery.vector.polygonizer import polygonize_mask
from satquery.services.raster_service import RasterGISService


def test_ndvi_edge_cases_zero_division():
    """Verify flat zeroes (no light, empty pixels, cloud shadows) do not crash with ZeroDivisionError."""
    red = np.array([[0, 0], [0, 0]], dtype=float)
    nir = np.array([[0, 0], [0, 0]], dtype=float)
    
    # Must not raise ZeroDivisionError
    res = calculate_ndvi(red, nir)
    assert res.shape == (2, 2)
    # 0/0 should evaluate to NaN without raising an exception
    assert np.isnan(res).all()


def test_indices_mathematical_range():
    """Verify indices output values are strictly between -1.0 and +1.0."""
    np.random.seed(42)
    b1 = np.random.uniform(10, 4000, (50, 50))
    b2 = np.random.uniform(10, 4000, (50, 50))

    for fn in [calculate_ndvi, calculate_ndwi, calculate_ndbi]:
        idx = fn(b1, b2)
        valid = idx[~np.isnan(idx)]
        assert np.all(valid >= -1.0), f"{fn.__name__} has values < -1.0"
        assert np.all(valid <= 1.0), f"{fn.__name__} has values > 1.0"


def test_polygonization_and_coordinate_integrity():
    """Verify GeoJSON polygonization creates valid geometries and positive area in m²."""
    from rasterio.transform import from_origin
    transform = from_origin(77.20, 28.50, 0.0001, 0.0001)
    
    # 50x50 mask with a 20x20 active water region in the center
    mask = np.zeros((50, 50), dtype=bool)
    mask[15:35, 15:35] = True
    
    fc = polygonize_mask(mask, transform, crs="EPSG:4326", min_area_sqm=50.0)
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1
    
    feat = fc["features"][0]
    props = feat["properties"]
    assert props["area_m2"] > 0
    assert props["area_hectares"] > 0
    assert props["area_sq_km"] > 0
    
    # Check coordinates: must lie within the bounds of the raster
    coords = feat["geometry"]["coordinates"][0]
    for pt in coords:
        assert 77.20 <= pt[0] <= 77.20 + 50 * 0.0001
        assert 28.50 - 50 * 0.0001 <= pt[1] <= 28.50


def test_raster_gis_service_full_pipeline():
    """End-to-end service test using the test flood scene."""
    test_scene = Path("data/sample_scenes/test_flood_scene.tif")
    if not test_scene.exists():
        pytest.skip("test_flood_scene.tif not found")
        
    service = RasterGISService()
    meta = service.get_metadata(str(test_scene))
    assert meta["bands"] == 8
    assert meta["crs"] == "EPSG:4326"
    
    # NDWI water detection (B3=Green, B8=NIR)
    fc = service.process_and_polygonize(
        file_path=str(test_scene),
        index_type="NDWI",
        b1_idx=3,
        b2_idx=8,
        thresh_val=0.0,
        operator=">"
    )
    assert len(fc["features"]) > 0
    total_area_km2 = sum(f["properties"]["area_sq_km"] for f in fc["features"])
    assert 0.5 < total_area_km2 < 3.0
