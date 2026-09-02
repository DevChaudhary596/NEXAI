from satquery.vector.polygonizer import polygonize_mask
from rasterio.transform import from_origin
import numpy as np
import pytest

def test_polygonize_mask():
    mask = np.zeros((10, 10), dtype=bool)
    mask[2:5, 2:5] = True
    
    transform = from_origin(0.0, 10.0, 1.0, 1.0)
    crs = "EPSG:32643"
    
    geojson = polygonize_mask(mask, transform, crs, min_area_sqm=0)
    
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 1
    
    feature = geojson["features"][0]
    assert feature["geometry"]["type"] == "Polygon"
    assert "area_m2" in feature["properties"]
    assert feature["properties"]["area_m2"] > 0
    assert feature["properties"]["area_hectares"] > 0
    assert feature["properties"]["area_sq_km"] > 0

def test_polygonize_mask_empty():
    mask = np.zeros((10, 10), dtype=bool)
    transform = from_origin(0.0, 10.0, 1.0, 1.0)
    
    geojson = polygonize_mask(mask, transform, "EPSG:32643", min_area_sqm=0)
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 0
