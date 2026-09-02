from satquery.change_detection.detector import detect_change
import rasterio
import numpy as np

def test_detect_change(synthetic_index_tiff, tmp_path):
    # Create a post raster with some changes
    post_file = tmp_path / "synthetic_index_post.tif"
    
    with rasterio.open(synthetic_index_tiff) as src:
        data = src.read(1)
        meta = src.meta.copy()
        
    # Introduce change
    data[50:60, 50:60] = 0.9 # High value
    
    with rasterio.open(post_file, 'w', **meta) as dst:
        dst.write(data, 1)
        
    delta, stats, transform, crs = detect_change(synthetic_index_tiff, post_file, threshold=0.1, operator=">")
    
    assert delta.shape == data.shape
    assert stats["changed_pixels"] > 0
    
def test_detect_change_resampling(synthetic_index_tiff, tmp_path):
    # Create a post raster that is slightly offset/different resolution
    post_file = tmp_path / "synthetic_index_post_resampled.tif"
    
    with rasterio.open(synthetic_index_tiff) as src:
        data = src.read(1)
        meta = src.meta.copy()
        
    # Introduce change
    data[50:60, 50:60] = 0.9 
    
    # Modify meta to simulate a different grid (different transform, same crs)
    from rasterio.transform import from_origin
    meta["transform"] = from_origin(77.0, 28.5, 20.0, 20.0) # 20m res instead of 10m
    meta["width"] = 50
    meta["height"] = 50
    
    data_resampled = data[::2, ::2]
    
    with rasterio.open(post_file, 'w', **meta) as dst:
        dst.write(data_resampled, 1)
        
    delta, stats, transform, crs = detect_change(synthetic_index_tiff, post_file, threshold=0.1, operator=">")
    
    # Should reproject to match pre (100x100)
    assert delta.shape == (100, 100)
