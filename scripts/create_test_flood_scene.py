"""Generate a multi-spectral GeoTIFF with standard Sentinel-2 bands for GIS engine testing.
Bands:
- Band 2: Blue
- Band 3: Green
- Band 4: Red
- Band 8: NIR (Near-Infrared)
- Band 11: SWIR
Includes a water body (river/flood), agricultural vegetation, and zero-value nodata edges.
"""
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin

output_dir = Path("data/sample_scenes")
output_dir.mkdir(parents=True, exist_ok=True)
output_path = output_dir / "test_flood_scene.tif"

width, height = 300, 300
# 10m Ground Sample Distance (GSD) around 77.20 E, 28.50 N
transform = from_origin(77.20, 28.50, 0.0001, 0.0001)

# Initialize 8 bands (Sentinel-2 1-based indexing: 1=B1, 2=B2, 3=B3, 4=B4, 5=B5, 6=B6, 7=B7, 8=B8)
bands = np.zeros((8, height, width), dtype=np.uint16)

# Base soil / background: moderate values across all bands
bands[1] = 600   # B2 (Blue)
bands[2] = 700   # B3 (Green)
bands[3] = 800   # B4 (Red)
bands[7] = 900   # B8 (NIR)

# 1. River / Flood channel: High Green, Low NIR, Low Red
# Diagonal meandering river across rows 100 to 200
for r in range(height):
    center_c = int(80 + 40 * np.sin(r / 25.0) + r * 0.4)
    river_min = max(0, center_c - 20)
    river_max = min(width, center_c + 20)
    bands[1, r, river_min:river_max] = 1200  # Blue high
    bands[2, r, river_min:river_max] = 1400  # Green high (B3)
    bands[3, r, river_min:river_max] = 300   # Red low (B4)
    bands[7, r, river_min:river_max] = 150   # NIR very low (B8) -> (Green - NIR) / (Green + NIR) > 0.8 !

# 2. Dense Vegetation Field: High NIR, Low Red
bands[2, 20:80, 20:80] = 500   # Green
bands[3, 20:80, 20:80] = 300   # Red low
bands[7, 20:80, 20:80] = 3500  # NIR very high -> NDVI ~ (3500-300)/(3500+300) = 0.84

# 3. Nodata / black border to test division by zero (zeros across all bands)
bands[:, 0:10, :] = 0
bands[:, :, 0:10] = 0

with rasterio.open(
    output_path,
    'w',
    driver='GTiff',
    height=height,
    width=width,
    count=8,
    dtype=np.uint16,
    crs='EPSG:4326',
    transform=transform,
    nodata=0
) as dst:
    for b_idx in range(8):
        dst.write(bands[b_idx], b_idx + 1)

print(f"Created multi-band test flood scene at: {output_path}")
print(f"Dimensions: {width}x{height}, Bands: 8, CRS: EPSG:4326")
