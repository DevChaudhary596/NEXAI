"""Member 3 Step 3: GeoJSON Polygonization Test Script
Converts raster water mask to vector GeoJSON FeatureCollection.
"""
import sys
import json
from pathlib import Path
import numpy as np
import rasterio

sys.path.insert(0, "src")
from satquery.indices.calculator import calculate_ndwi
from satquery.raster.masking import threshold
from satquery.vector.polygonizer import polygonize_mask

file_path = "../data/sample_scenes/test_flood_scene.tif"
if not Path(file_path).exists():
    file_path = "data/sample_scenes/test_flood_scene.tif"

print("=" * 60)
print("MEMBER 3 GIS ENGINE: STEP 3 POLYGONIZATION TEST")
print("=" * 60)

with rasterio.open(file_path) as src:
    green = src.read(3).astype(np.float32)
    nir = src.read(8).astype(np.float32)
    transform = src.transform
    crs = src.crs

# Compute NDWI and extract binary water mask
ndwi = calculate_ndwi(green, nir)
water_mask = threshold(ndwi, 0.0, ">")

# Run Member 3's polygonizer
output_geojson_path = "output_test.geojson"
geojson_output = polygonize_mask(
    mask_array=water_mask,
    transform=transform,
    crs=crs,
    min_area_sqm=50.0,
    output_geojson=output_geojson_path
)

features = geojson_output.get("features", [])
print(f"Total Polygons Generated: {len(features)}")
assert len(features) > 0, "Polygonizer generated 0 features!"

# Verify feature properties and coordinates
total_vector_area_m2 = 0.0
for idx, feat in enumerate(features[:5]):
    geom_type = feat["geometry"]["type"]
    props = feat["properties"]
    area_m2 = props.get("area_m2", 0.0)
    total_vector_area_m2 += area_m2
    coords = feat["geometry"]["coordinates"][0]
    sample_pt = coords[0]
    print(f"  Polygon {idx+1}: {geom_type} | Area: {area_m2:,.1f} m² ({props.get('area_hectares', 0):.2f} ha, {props.get('area_sq_km', 0):.3f} km²) | First Coord: [{sample_pt[0]:.4f}, {sample_pt[1]:.4f}]")

# Verify coordinates are in valid geographic range (e.g. lon around 77.2, lat around 28.5)
first_coord = features[0]["geometry"]["coordinates"][0][0]
assert 70.0 <= first_coord[0] <= 85.0, f"Longitude {first_coord[0]} out of expected bounds!"
assert 20.0 <= first_coord[1] <= 35.0, f"Latitude {first_coord[1]} out of expected bounds!"
print("[PASS] Coordinate Sanity Check: PASSED (Polygons properly georeferenced in EPSG:4326)")

# Check total area in km^2
vector_area_km2 = sum(f["properties"].get("area_sq_km", 0.0) for f in features)
print(f"Total Vector Area: {vector_area_km2:.3f} km²")
print(f"[PASS] Successfully saved valid GeoJSON to: {output_geojson_path}")
print("=" * 60)
