import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from pathlib import Path
from typing import Dict, Any, Tuple

def detect_change(
    pre_path: str | Path,
    post_path: str | Path,
    threshold: float = 0.0,
    operator: str = ">"
) -> Tuple[np.ndarray, Dict[str, Any], Any, Any]:
    """
    Performs bi-temporal change detection between two rasters.
    Aligns and reprojects the POST raster to the PRE raster if needed.
    
    Args:
        pre_path: Path to the pre-event GeoTIFF.
        post_path: Path to the post-event GeoTIFF.
        threshold: The threshold for delta (POST - PRE).
        operator: The threshold operator to identify significant change.
        
    Returns:
        A tuple of (delta_array, statistics_dict, pre_transform, pre_crs).
    """
    pre_path = Path(pre_path)
    post_path = Path(post_path)
    
    with rasterio.open(pre_path) as pre_src:
        pre_data = pre_src.read(1)
        pre_kwargs = pre_src.meta.copy()
        pre_transform = pre_src.transform
        pre_crs = pre_src.crs
        
    with rasterio.open(post_path) as post_src:
        if (post_src.crs != pre_crs) or (post_src.transform != pre_transform) or (post_src.shape != pre_data.shape):
            # We must align post to pre
            post_data = np.zeros_like(pre_data, dtype=post_src.dtypes[0])
            reproject(
                source=rasterio.band(post_src, 1),
                destination=post_data,
                src_transform=post_src.transform,
                src_crs=post_src.crs,
                dst_transform=pre_transform,
                dst_crs=pre_crs,
                resampling=Resampling.nearest
            )
        else:
            post_data = post_src.read(1)
            
    # Calculate delta
    pre_float = pre_data.astype(float)
    post_float = post_data.astype(float)
    
    # Handle nodata if present (simplified assumption: values exactly equal to nodata are nan)
    if pre_kwargs.get('nodata') is not None:
        pre_float[pre_float == pre_kwargs['nodata']] = np.nan
        post_float[post_float == pre_kwargs['nodata']] = np.nan
        
    delta = post_float - pre_float
    
    # Calculate mask
    valid_mask = ~np.isnan(delta)
    change_mask = np.zeros_like(delta, dtype=bool)
    
    if operator == ">":
        change_mask[valid_mask] = delta[valid_mask] > threshold
    elif operator == "<":
        change_mask[valid_mask] = delta[valid_mask] < threshold
    elif operator == ">=":
        change_mask[valid_mask] = delta[valid_mask] >= threshold
    elif operator == "<=":
        change_mask[valid_mask] = delta[valid_mask] <= threshold
    else:
        raise ValueError(f"Unsupported operator: {operator}")
        
    # Calculate simple pixel stats (we do not calculate true area here, polygonization handles that)
    changed_pixels = int(np.sum(change_mask))
    
    stats = {
        "changed_pixels": changed_pixels
    }
    
    return delta, stats, pre_transform, pre_crs
