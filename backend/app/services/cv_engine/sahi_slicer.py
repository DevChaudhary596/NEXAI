"""
SAHI-style sliding window slicing and merging for large satellite/aerial imagery.
"""

from typing import List, Tuple, Dict, Any
import numpy as np
from shapely.geometry import Polygon


def calculate_slice_regions(
    width: int,
    height: int,
    slice_size: int = 640,
    overlap_ratio: float = 0.2
) -> List[Tuple[int, int, int, int]]:
    """
    Compute slicing tile windows (xmin, ymin, xmax, ymax) across an image.
    Ensures complete coverage including edges.
    """
    if width <= slice_size and height <= slice_size:
        return [(0, 0, width, height)]

    step = int(slice_size * (1.0 - overlap_ratio))
    if step <= 0:
        step = slice_size

    x_starts = list(range(0, width - slice_size + 1, step))
    if not x_starts or x_starts[-1] + slice_size < width:
        x_starts.append(max(0, width - slice_size))
    # Deduplicate and sort
    x_starts = sorted(list(set(x_starts)))

    y_starts = list(range(0, height - slice_size + 1, step))
    if not y_starts or y_starts[-1] + slice_size < height:
        y_starts.append(max(0, height - slice_size))
    y_starts = sorted(list(set(y_starts)))

    slices = []
    for ys in y_starts:
        for xs in x_starts:
            xe = min(width, xs + slice_size)
            ye = min(height, ys + slice_size)
            slices.append((xs, ys, xe, ye))

    return slices


def polygon_iou(poly1_coords: List[List[float]], poly2_coords: List[List[float]]) -> float:
    """
    Compute Intersection over Union (IoU) between two 4-corner polygons.
    """
    try:
        p1 = Polygon(poly1_coords)
        p2 = Polygon(poly2_coords)
        if not p1.is_valid or not p2.is_valid:
            p1 = p1.buffer(0)
            p2 = p2.buffer(0)
        if not p1.is_valid or not p2.is_valid or p1.is_empty or p2.is_empty:
            return 0.0
        intersection_area = p1.intersection(p2).area
        union_area = p1.union(p2).area
        if union_area <= 0:
            return 0.0
        return intersection_area / union_area
    except Exception:
        return 0.0


def nms_obb(
    detections: List[Dict[str, Any]],
    iou_threshold: float = 0.4
) -> List[Dict[str, Any]]:
    """
    Non-Maximum Suppression (NMS) for oriented bounding box detections.
    Each detection dict contains:
        - "coords": 4-corner [[x, y], ...] in image coordinates
        - "confidence": float
        - "class_name": str
        - "class_id": int
    """
    if not detections:
        return []

    # Sort descending by confidence
    detections = sorted(detections, key=lambda d: d["confidence"], reverse=True)
    kept = []

    for det in detections:
        should_keep = True
        for kept_det in kept:
            # Only suppress within same target class
            if det["class_name"] == kept_det["class_name"]:
                iou = polygon_iou(det["coords"], kept_det["coords"])
                if iou >= iou_threshold:
                    should_keep = False
                    break
        if should_keep:
            kept.append(det)

    return kept
