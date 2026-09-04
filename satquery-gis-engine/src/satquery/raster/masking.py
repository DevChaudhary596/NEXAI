import numpy as np

def threshold(index_array: np.ndarray, threshold_value: float = 0.0, operator: str = ">") -> np.ndarray:
    """
    Applies a threshold to an index array to create a boolean mask.
    
    Args:
        index_array: The input index array (e.g., NDVI, NDWI).
        threshold_value: The value to threshold against.
        operator: The comparison operator (">", "<", ">=", "<=", "==").
        
    Returns:
        A boolean NumPy array representing the mask. 
        np.nan values in the input are treated as False.
    """
    # Create a mask of valid (non-NaN) pixels
    valid_mask = ~np.isnan(index_array)
    
    # Initialize the output mask as False
    result_mask = np.zeros_like(index_array, dtype=bool)
    
    # Apply operator only where valid
    if operator == ">":
        result_mask[valid_mask] = index_array[valid_mask] > threshold_value
    elif operator == "<":
        result_mask[valid_mask] = index_array[valid_mask] < threshold_value
    elif operator == ">=":
        result_mask[valid_mask] = index_array[valid_mask] >= threshold_value
    elif operator == "<=":
        result_mask[valid_mask] = index_array[valid_mask] <= threshold_value
    elif operator == "==":
        result_mask[valid_mask] = index_array[valid_mask] == threshold_value
    else:
        raise ValueError(f"Unsupported operator: {operator}")
        
    return result_mask
