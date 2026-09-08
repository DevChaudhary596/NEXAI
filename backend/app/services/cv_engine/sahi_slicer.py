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


def polygon_containment(poly1_coords: List[List[float]], poly2_coords: List[List[float]]) -> float:
    """
    Compute intersection over minimum area (containment ratio).
    Detects if one detection is largely a sub-part or partial slice artifact of another.
    """
    try:
        p1 = Polygon(poly1_coords)
        p2 = Polygon(poly2_coords)
        if not p1.is_valid:
            p1 = p1.buffer(0)
        if not p2.is_valid:
            p2 = p2.buffer(0)
        if p1.is_empty or p2.is_empty:
            return 0.0
        inter = p1.intersection(p2).area
        min_area = min(p1.area, p2.area)
        if min_area <= 0:
            return 0.0
        return inter / min_area
    except Exception:
        return 0.0


def merge_obb_polygons(poly1_coords: List[List[float]], poly2_coords: List[List[float]]) -> List[List[float]]:
    """
    Merge two overlapping or boundary-split oriented bounding boxes into a cohesive
    minimum rotated rectangle that covers both parts.
    """
    try:
        p1 = Polygon(poly1_coords)
        p2 = Polygon(poly2_coords)
        if not p1.is_valid:
            p1 = p1.buffer(0)
        if not p2.is_valid:
            p2 = p2.buffer(0)
        union_poly = p1.union(p2)
        mrr = union_poly.minimum_rotated_rectangle
        coords = list(mrr.exterior.coords)[:-1]  # 4 corners
        if len(coords) == 4:
            return [[float(x), float(y)] for x, y in coords]
    except Exception:
        pass
    return poly1_coords


def nms_obb(
    detections: List[Dict[str, Any]],
    iou_threshold: float = 0.4,
    containment_threshold: float = 0.65,
    boundary_overlap_threshold: float = 0.15,
    smooth_boundaries: bool = True
) -> List[Dict[str, Any]]:
    """
    Non-Maximum Suppression (NMS) and Cross-Tile Boundary Artifact Smoothing
    for oriented bounding box detections.

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
    kept: List[Dict[str, Any]] = []

    for det in detections:
        should_keep = True

        for idx, kept_det in enumerate(kept):
            # Only compare within the same target class
            if det["class_name"] != kept_det["class_name"]:
                continue

            iou = polygon_iou(det["coords"], kept_det["coords"])
            containment = polygon_containment(det["coords"], kept_det["coords"])

            # 1. Standard IoU suppression
            if iou >= iou_threshold:
                if smooth_boundaries and iou < 0.85:
                    merged_coords = merge_obb_polygons(kept_det["coords"], det["coords"])
                    kept[idx]["coords"] = merged_coords
                    kept[idx]["confidence"] = max(kept_det["confidence"], det["confidence"])
                    kept[idx]["merged"] = True
                should_keep = False
                break

            # 2. Containment suppression (sub-box slice artifacts)
            if containment >= containment_threshold:
                if smooth_boundaries:
                    merged_coords = merge_obb_polygons(kept_det["coords"], det["coords"])
                    kept[idx]["coords"] = merged_coords
                    kept[idx]["confidence"] = max(kept_det["confidence"], det["confidence"])
                    kept[idx]["merged"] = True
                should_keep = False
                break

            # 3. Cross-tile boundary artifact smoothing (merging adjacent split slices)
            if smooth_boundaries and (iou >= boundary_overlap_threshold or containment >= 0.30):
                merged_coords = merge_obb_polygons(kept_det["coords"], det["coords"])
                kept[idx]["coords"] = merged_coords
                kept[idx]["confidence"] = max(kept_det["confidence"], det["confidence"])
                kept[idx]["merged"] = True
                should_keep = False
                break

        if should_keep:
            kept.append(dict(det))

    return kept

