import numpy as np
from satquery.indices.calculator import calculate_ndvi, calculate_ndwi, calculate_ndbi, normalized_difference

def test_normalized_difference():
    b1 = np.array([10.0, 20.0, 0.0, 50.0])
    b2 = np.array([5.0, 20.0, 0.0, -10.0])
    
    # (b1 - b2) / (b1 + b2)
    nd = normalized_difference(b1, b2)
    
    np.testing.assert_allclose(nd[0], 5.0 / 15.0)
    assert nd[1] == 0.0
    assert np.isnan(nd[2]) # 0/0 -> NaN
    assert nd[3] == 60.0 / 40.0
    
def test_calculate_ndvi(synthetic_multispectral_tiff):
    import rasterio
    with rasterio.open(synthetic_multispectral_tiff) as src:
        red = src.read(3)
        nir = src.read(4)
        
    ndvi = calculate_ndvi(red, nir)
    
    assert ndvi.shape == (100, 100)
    assert np.isnan(ndvi[0,0]) # 0/0 nodata area
    assert ndvi[50, 50] < 0 # Water area: NIR(200) - RED(400) / NIR+RED < 0
    assert ndvi[99, 99] > 0 # Land area: NIR(3000) - RED(400) > 0
