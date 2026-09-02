import numpy as np
from satquery.raster.masking import threshold

def test_threshold():
    arr = np.array([
        [-1.0, 0.0, 1.0],
        [np.nan, 0.5, -0.5]
    ])
    
    mask_gt_zero = threshold(arr, 0.0, ">")
    assert mask_gt_zero.tolist() == [
        [False, False, True],
        [False, True, False]
    ]
    
    mask_gte_zero = threshold(arr, 0.0, ">=")
    assert mask_gte_zero.tolist() == [
        [False, True, True],
        [False, True, False]
    ]
