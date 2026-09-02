import numpy as np

def normalized_difference(band1: np.ndarray, band2: np.ndarray) -> np.ndarray:
    """
    Calculates the normalized difference between two bands: (band1 - band2) / (band1 + band2).
    
    Args:
        band1: First band array.
        band2: Second band array.
        
    Returns:
        A float array containing the normalized difference. 
        Handles division by zero by setting those pixels to np.nan.
    """
    # Convert to float to avoid integer division issues and overflow
    b1 = band1.astype(float)
    b2 = band2.astype(float)
    
    # Ignore division by zero warnings, handle via where
    with np.errstate(divide='ignore', invalid='ignore'):
        denominator = b1 + b2
        numerator = b1 - b2
        index = np.where(denominator == 0, np.nan, numerator / denominator)
    
    return index

def calculate_ndvi(red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Calculates the Normalized Difference Vegetation Index (NDVI).
    NDVI = (NIR - RED) / (NIR + RED)
    
    Args:
        red: The red band (e.g., Sentinel-2 B04).
        nir: The near-infrared band (e.g., Sentinel-2 B08).
        
    Returns:
        NDVI array.
    """
    return normalized_difference(nir, red)

def calculate_ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Calculates the Normalized Difference Water Index (NDWI) using the McFeeters (1996) formulation.
    NDWI = (GREEN - NIR) / (GREEN + NIR)
    
    Args:
        green: The green band (e.g., Sentinel-2 B03).
        nir: The near-infrared band (e.g., Sentinel-2 B08).
        
    Returns:
        NDWI array.
    """
    return normalized_difference(green, nir)

def calculate_ndbi(swir: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """
    Calculates the Normalized Difference Built-up Index (NDBI).
    NDBI = (SWIR - NIR) / (SWIR + NIR)
    
    Args:
        swir: The short-wave infrared band (e.g., Sentinel-2 B11).
        nir: The near-infrared band (e.g., Sentinel-2 B08).
        
    Returns:
        NDBI array.
    """
    return normalized_difference(swir, nir)
