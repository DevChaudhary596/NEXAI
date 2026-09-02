import numpy as np
from PIL import Image
from pathlib import Path
from typing import Tuple, Dict, Any, Optional
import json

def create_index_overlay(
    index_array: np.ndarray, 
    output_path: str | Path, 
    colormap: str = "viridis",
    vmin: float = -1.0,
    vmax: float = 1.0,
    nodata_mask: Optional[np.ndarray] = None
) -> None:
    """
    Creates an 8-bit RGBA PNG overlay from a continuous index array.
    Transparent where nodata or NaN.
    
    Args:
        index_array: The continuous raster data (e.g., NDVI).
        output_path: Where to save the resulting .png file.
        colormap: Basic colormap ('viridis', 'water', 'binary').
        vmin: Minimum value for normalization.
        vmax: Maximum value for normalization.
        nodata_mask: Boolean mask of nodata pixels (True = nodata).
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Handle NaNs and nodata
    is_nan = np.isnan(index_array)
    if nodata_mask is None:
        nodata_mask = is_nan
    else:
        nodata_mask = nodata_mask | is_nan
        
    # Normalize to 0-255
    normalized = np.clip((index_array - vmin) / (vmax - vmin), 0, 1)
    scaled = (normalized * 255).astype(np.uint8)
    
    # Create RGBA arrays
    rgba = np.zeros((*index_array.shape, 4), dtype=np.uint8)
    
    # Basic colormaps (can be expanded later, for now we map manually or use matplotlib if we add it to requirements, but PIL is required)
    if colormap == "water":
        # Blue gradient
        rgba[..., 2] = scaled  # B
        rgba[..., 1] = scaled // 2 # G
        rgba[..., 0] = 0 # R
    elif colormap == "binary":
        # White for positive, black for negative, but since it's just scaled...
        rgba[..., 0] = scaled
        rgba[..., 1] = scaled
        rgba[..., 2] = scaled
    else: # default "viridis" approximation
        # simple viridis approximation: purple -> blue -> green -> yellow
        rgba[..., 0] = np.clip(scaled * 1.5 - 128, 0, 255).astype(np.uint8)
        rgba[..., 1] = scaled
        rgba[..., 2] = np.clip(255 - scaled * 1.5, 0, 255).astype(np.uint8)
        
    # Alpha channel: opaque for valid pixels, transparent for nodata
    rgba[..., 3] = np.where(nodata_mask, 0, 255)
    
    img = Image.fromarray(rgba, mode="RGBA")
    img.save(output_path, format="PNG")
    
def save_overlay_metadata(output_path: str | Path, metadata: Dict[str, Any]) -> None:
    """
    Saves the geospatial metadata alongside the PNG overlay so the frontend can position it.
    
    Args:
        output_path: Path to the JSON file to save.
        metadata: The metadata dictionary.
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(metadata, f, indent=2)
