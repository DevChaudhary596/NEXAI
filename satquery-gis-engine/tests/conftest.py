import pytest
import numpy as np
import rasterio
from rasterio.transform import from_origin
from pathlib import Path

@pytest.fixture
def synthetic_multispectral_tiff(tmp_path):
    """Creates a synthetic 4-band GeoTIFF for testing."""
    file_path = tmp_path / "synthetic_multi.tif"
    
    transform = from_origin(77.0, 28.5, 10.0, 10.0) # approx India, 10m res
    
    # Create 4 bands: B, G, R, NIR
    shape = (100, 100)
    b1 = np.ones(shape, dtype=np.uint16) * 500
    b2 = np.ones(shape, dtype=np.uint16) * 600
    b3 = np.ones(shape, dtype=np.uint16) * 400
    b4 = np.ones(shape, dtype=np.uint16) * 3000
    
    # Introduce some water (high green, low NIR) in the middle 20x20
    b2[40:60, 40:60] = 1000
    b4[40:60, 40:60] = 200
    
    # Introduce nodata (0) on top-left corner 5x5
    b1[0:5, 0:5] = 0
    b2[0:5, 0:5] = 0
    b3[0:5, 0:5] = 0
    b4[0:5, 0:5] = 0
    
    with rasterio.open(
        file_path,
        'w',
        driver='GTiff',
        height=shape[0],
        width=shape[1],
        count=4,
        dtype=np.uint16,
        crs='EPSG:32643', # UTM zone 43N
        transform=transform,
        nodata=0
    ) as dst:
        dst.write(b1, 1)
        dst.write(b2, 2)
        dst.write(b3, 3)
        dst.write(b4, 4)
        
    return file_path
    
@pytest.fixture
def synthetic_index_tiff(tmp_path):
    """Creates a synthetic 1-band index GeoTIFF."""
    file_path = tmp_path / "synthetic_index.tif"
    transform = from_origin(77.0, 28.5, 10.0, 10.0)
    
    shape = (100, 100)
    data = np.random.uniform(-1.0, 1.0, shape).astype(np.float32)
    # Add a definite >0 block
    data[20:40, 20:40] = 0.5
    
    with rasterio.open(
        file_path, 'w', driver='GTiff',
        height=shape[0], width=shape[1], count=1, dtype=np.float32,
        crs='EPSG:32643', transform=transform
    ) as dst:
        dst.write(data, 1)
        
    return file_path
