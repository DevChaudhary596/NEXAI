from satquery.raster.ingestion import extract_metadata
import rasterio

def test_extract_metadata(synthetic_multispectral_tiff):
    meta = extract_metadata(synthetic_multispectral_tiff)
    
    assert meta["width"] == 100
    assert meta["height"] == 100
    assert meta["bands"] == 4
    assert meta["data_type"] == "uint16"
    assert meta["nodata"] == 0
    assert meta["resolution"]["x"] == 10.0
    assert meta["resolution"]["y"] == 10.0 # Positive due to pixel size, rasterio.res returns absolute
    assert "EPSG:32643" in meta["crs"]
    assert "left" in meta["bounds"]
