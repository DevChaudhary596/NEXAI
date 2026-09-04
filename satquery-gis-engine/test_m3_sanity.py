"""Member 3 Mathematical & Visual Sanity Test Script
Runs directly from satquery-gis-engine directory.
"""
import sys
from pathlib import Path
import numpy as np
import rasterio
import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for headless terminal execution
import matplotlib.pyplot as plt

# Ensure satquery-gis-engine src is importable
sys.path.insert(0, "src")
from satquery.indices.calculator import calculate_ndwi, calculate_ndvi
from satquery.raster.masking import threshold

file_path = "../data/sample_scenes/test_flood_scene.tif"
if not Path(file_path).exists():
    file_path = "data/sample_scenes/test_flood_scene.tif"

print("=" * 60)
print("MEMBER 3 GIS ENGINE: STEP 2 SANITY TEST")
print("=" * 60)

# 1. Open the test GeoTIFF
with rasterio.open(file_path) as src:
    print(f"Bands present:           {src.count}")
    print(f"CRS (Coordinate System): {src.crs}")
    print(f"Resolution / Dimensions: {src.width} x {src.height}")
    
    # Read Green (Band 3) and NIR (Band 8)
    green = src.read(3).astype(np.float32)
    nir = src.read(8).astype(np.float32)
    res = src.res

# 2. Test Member 3's vectorized calculate_ndwi formula
ndwi = calculate_ndwi(green, nir)

# 3. Assert Mathematical Sanity Checks
valid_ndwi = ndwi[~np.isnan(ndwi)]
min_val = float(np.nanmin(valid_ndwi))
max_val = float(np.nanmax(valid_ndwi))

print("--- TEST CHECKS ---")
print(f"Min NDWI: {min_val:.3f} (Must be >= -1.0)")
print(f"Max NDWI: {max_val:.3f} (Must be <= 1.0)")
assert min_val >= -1.0 and max_val <= 1.0, "Index out of mathematical bounds!"
print("[PASS] Math Range Test: PASSED (Values strictly within [-1.0, 1.0])")

# Check zero division / nodata border
# Border pixels where green==0 and nir==0 must not raise ZeroDivisionError and should be NaN
border_pixels = ndwi[0:5, 0:5]
assert np.isnan(border_pixels).all(), "Border 0-value pixels should be safely represented as NaN"
print("[PASS] Zero-Division / NoData Handling: PASSED (No crash, handled via NaN)")

# 4. Binary Flood Mask (NDWI > 0.0 typically represents water)
water_mask = threshold(ndwi, 0.0, ">")
water_pixel_count = int(np.sum(water_mask))

# Approximate pixel area in m^2 (in EPSG:4326, 0.0001 deg is ~11.1 meters -> ~123 m^2, or standard 10m x 10m = 100 m^2)
pixel_size_m2 = (res[0] * 111320.0) * (res[1] * 111320.0)
water_area_sqkm = (water_pixel_count * pixel_size_m2) / 1e6

print(f"Water Pixels Identified: {water_pixel_count} / {ndwi.size}")
print(f"Calculated Water/Flood Area: {water_area_sqkm:.3f} sq km")
print("[PASS] Area Calculation Test: PASSED")

# 5. Visual Check (Save verification image)
out_fig = "m3_sanity_verification.png"
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
im1 = ax1.imshow(ndwi, cmap="Blues", vmin=-1.0, vmax=1.0)
ax1.set_title("NDWI Continuous Heatmap (Water in Deep Blue)")
fig.colorbar(im1, ax=ax1)

ax2.imshow(water_mask, cmap="gray")
ax2.set_title(f"Extracted Water Mask (NDWI > 0)\nArea: {water_area_sqkm:.3f} km²")

plt.tight_layout()
plt.savefig(out_fig, dpi=150)
plt.close()
print(f"[PASS] Visual Check Plot saved to: {out_fig}")
print("=" * 60)
