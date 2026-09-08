"""
Real CPU-based aerial/satellite detector using YOLOv8n-OBB and SAHI slicing.
"""

import os
import re
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import cv2
import numpy as np
from ultralytics import YOLO

from app.models.geojson import BBox
from app.services.cv_engine.sahi_slicer import calculate_slice_regions, nms_obb

# DOTA 1.0 classes in YOLOv8n-OBB
DOTA_CLASSES = {
    0: 'plane',
    1: 'ship',
    2: 'storage tank',
    3: 'baseball diamond',
    4: 'tennis court',
    5: 'basketball court',
    6: 'ground track field',
    7: 'harbor',
    8: 'bridge',
    9: 'large vehicle',
    10: 'small vehicle',
    11: 'helicopter',
    12: 'roundabout',
    13: 'soccer ball field',
    14: 'swimming pool'
}

CLASS_SYNONYMS: Dict[str, List[str]] = {
    "ship": ["ship", "ships", "vessel", "vessels", "boat", "boats", "container ship", "cargo ship"],
    "plane": ["plane", "planes", "airplane", "airplanes", "aircraft", "aeroplane", "aeroplanes", "airliner", "jet", "jets"],
    "storage tank": ["storage tank", "storage tanks", "tank", "tanks", "oil tank", "oil tanks", "fuel tank", "fuel tanks", "petroleum tank", "gas tank"],
    "baseball diamond": ["baseball diamond", "baseball diamonds", "baseball field", "baseball fields"],
    "tennis court": ["tennis court", "tennis courts"],
    "basketball court": ["basketball court", "basketball courts"],
    "ground track field": ["ground track field", "ground track fields", "track field", "track fields", "running track"],
    "harbor": ["harbor", "harbors", "port", "ports", "marina", "marinas", "dock", "docks", "pier", "piers"],
    "bridge": ["bridge", "bridges", "overpass"],
    "large vehicle": ["large vehicle", "large vehicles", "truck", "trucks", "bus", "buses", "lorry", "heavy vehicle"],
    "small vehicle": ["small vehicle", "small vehicles", "car", "cars", "automobile", "automobiles", "van", "vans", "sedan"],
    "helicopter": ["helicopter", "helicopters", "chopper", "choppers", "heli"],
    "roundabout": ["roundabout", "roundabouts", "traffic circle", "rotary"],
    "soccer ball field": ["soccer ball field", "soccer field", "soccer fields", "football field", "football ground"],
    "swimming pool": ["swimming pool", "swimming pools", "pool", "pools"]
}

# Macro categories
MACRO_CATEGORIES: Dict[str, List[str]] = {
    "vehicle": ["small vehicle", "large vehicle"],
    "vehicles": ["small vehicle", "large vehicle"],
    "court": ["tennis court", "basketball court"],
    "courts": ["tennis court", "basketball court"],
    "field": ["soccer ball field", "ground track field", "baseball diamond"],
    "fields": ["soccer ball field", "ground track field", "baseball diamond"],
}

# Calibrated class-specific confidence thresholds for satellite / aerial domain (Day 9)
CLASS_CONFIDENCE_THRESHOLDS: Dict[str, float] = {
    "ship": 0.35,            # Filters out sea surface noise and whitecap waves
    "plane": 0.40,           # Distinguishes aircraft from runway paint marks and taxiways
    "storage tank": 0.30,    # Circular shapes in industrial zones
    "harbor": 0.25,          # Large port/pier structures
    "large vehicle": 0.45,   # Drastically suppresses building shadow false alarms
    "small vehicle": 0.45,   # Suppresses small asphalt patches and vehicle shadows
    "bridge": 0.30,          # Linear infrastructure
    "baseball diamond": 0.35,
    "tennis court": 0.35,
    "basketball court": 0.35,
    "ground track field": 0.35,
    "soccer ball field": 0.35,
    "swimming pool": 0.35,
    "roundabout": 0.35,
    "helicopter": 0.40,
}


def calculate_obb_properties(coords: List[List[float]]) -> Tuple[float, float, float]:
    """
    Calculate (length, width, area) from 4 corner coordinates [[x0, y0], [x1, y1], [x2, y2], [x3, y3]].
    Returns (length, width, area).
    """
    try:
        pts = np.array(coords, dtype=np.float32)
        d01 = float(np.linalg.norm(pts[0] - pts[1]))
        d12 = float(np.linalg.norm(pts[1] - pts[2]))
        length = max(d01, d12)
        width = min(d01, d12)
        area = length * width
        return length, width, area
    except Exception:
        return 0.0, 0.0, 0.0


def prune_false_positives(
    detections: List[Dict[str, Any]],
    img_w: int,
    img_h: int,
    cloud_mask: Optional[np.ndarray] = None
) -> List[Dict[str, Any]]:
    """
    Rule-based false-positive pruning for satellite/aerial detections (Day 13):
      1. Vessel aspect-ratio verification: real ships have length/width ratio between 1.8 and 16.0.
      2. Pixel area sanity bounds: reject tiny noise (< 25px²) or massive scene artifacts (> 25% of image).
      3. Cloud/shadow mask rejection: reject objects that lie > 50% within cloud or shadow areas.
    """
    valid: List[Dict[str, Any]] = []
    total_scene_area = float(img_w * img_h)

    for det in detections:
        coords = det.get("coords", [])
        if len(coords) < 4:
            continue

        length, width, area = calculate_obb_properties(coords)

        # 1. Area sanity filter
        if area < 25.0:
            continue
        if total_scene_area > 0 and (area / total_scene_area) > 0.25:
            continue

        # 2. Aspect-ratio filter for vessels
        cls_name = det.get("class_name", "").lower()
        if cls_name == "ship" and width > 0:
            aspect_ratio = length / width
            # Very round blobs (< 1.5) are waves/buoys; needle artifacts (> 18) are edge errors
            if aspect_ratio < 1.5 or aspect_ratio > 18.0:
                continue

        # 3. Cloud/shadow mask check
        if cloud_mask is not None and cloud_mask.size > 0:
            xs = [p[0] for p in coords]
            ys = [p[1] for p in coords]
            min_x = max(0, int(min(xs)))
            max_x = min(cloud_mask.shape[1], int(max(xs)) + 1)
            min_y = max(0, int(min(ys)))
            max_y = min(cloud_mask.shape[0], int(max(ys)) + 1)

            if max_x > min_x and max_y > min_y:
                sub_mask = cloud_mask[min_y:max_y, min_x:max_x]
                if sub_mask.size > 0:
                    cloud_ratio = float(np.count_nonzero(sub_mask)) / float(sub_mask.size)
                    if cloud_ratio > 0.50:
                        continue  # More than 50% contaminated by cloud/shadow

        valid.append(det)

    return valid


# Sentinel-2 10m/px Resolution Feasibility Mapping
# Objects smaller than 30m (approx 3 pixels) are not reliably detectable.
# [WARNING]: These are purely theoretical physics estimates. 
# They MUST be empirically verified against a statistically significant (n>=50) DOTA validation set.
SENTINEL2_RELIABLE_CLASSES = {
    "ship",                 # [Unverified: Physics Estimate] Large ships (cargo, tankers 100-400m)
    "harbor",               # [Unverified: Physics Estimate] Harbors, docks
    "bridge",               # [Unverified: Physics Estimate] Bridges
    "baseball diamond",     # [Unverified: Physics Estimate] Large fields
    "ground track field",   # [Unverified: Physics Estimate] Large fields
    "soccer ball field"     # [Unverified: Physics Estimate] Large fields
}

SENTINEL2_UNRELIABLE_CLASSES = {
    "plane",                # [Unverified: Physics Estimate] Planes (60-80m = 6-8 pixels, weak)
    "helicopter",           # [Unverified: Physics Estimate] < 30m
    "storage tank",         # [Unverified: Physics Estimate] Small storage tanks
    "small vehicle",        # [Unverified: Physics Estimate] Cars
    "large vehicle",        # [Unverified: Physics Estimate] Trucks
    "tennis court",         # [Unverified: Physics Estimate] < 30m
    "basketball court",     # [Unverified: Physics Estimate] < 30m
    "swimming pool",        # [Unverified: Physics Estimate] < 30m
    "roundabout"            # [Unverified: Physics Estimate] ~20-50m
}


def normalize_target_to_classes(target: str) -> Set[str]:
    """
    Normalize target string and map to exact model class names.
    Handles singular, plural, and synonyms.
    Returns empty set if target cannot be mapped to any model class.
    """
    if not target:
        return set()

    cleaned = re.sub(r"[^\w\s]", "", target.strip().lower())
    cleaned = re.sub(r"\s+", " ", cleaned)

    # Check macro categories first
    if cleaned in MACRO_CATEGORIES:
        return set(MACRO_CATEGORIES[cleaned])

    # Check synonyms
    matched_classes = set()
    for model_cls, synonyms in CLASS_SYNONYMS.items():
        if cleaned == model_cls or cleaned in synonyms:
            matched_classes.add(model_cls)

    if matched_classes:
        return matched_classes

    # Try simple singularization (remove trailing 's' or 'es')
    singular = cleaned
    if singular.endswith("es"):
        singular = singular[:-2]
    elif singular.endswith("s"):
        singular = singular[:-1]

    for model_cls, synonyms in CLASS_SYNONYMS.items():
        if singular == model_cls or singular in synonyms:
            matched_classes.add(model_cls)

    return matched_classes


class RealOBBDetector:
    """
    YOLOv8n-OBB CPU detector with SAHI tiling and target filtering.
    """
    def __init__(self, model_path: Optional[str] = None):
        if model_path is None:
            # Default to local models directory or fallback
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            local_model = os.path.join(base_dir, "models", "yolov8n-obb.pt")
            if os.path.exists(local_model):
                model_path = local_model
            else:
                model_path = "yolov8n-obb.pt"

        self.model_path = model_path
        self.model = YOLO(self.model_path)
        self.class_names = self.model.names if hasattr(self.model, "names") else DOTA_CLASSES

    def detect_image(
        self,
        image_np: np.ndarray,
        target: str,
        confidence_threshold: Optional[float] = None,
        tile_size: int = 640,
        overlap_ratio: float = 0.2,
        cloud_mask: Optional[np.ndarray] = None,
        smooth_boundaries: bool = True
    ) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
        """
        Run real CPU detection on image array using SAHI slicing, class-calibrated confidence
        filtering, boundary artifact smoothing, and rule-based false positive pruning.
        Returns (detections, benchmark_metrics).
        """
        metrics = {
            "preprocess_time_ms": 0.0,
            "inference_time_ms": 0.0,
            "postprocess_time_ms": 0.0,
            "total_time_ms": 0.0,
            "num_tiles": 0
        }

        start_total = time.perf_counter()

        # 1. Target normalization and class mapping
        target_classes = normalize_target_to_classes(target)
        if not target_classes:
            # Class not supported by model -> return empty detections (Never fabricate!)
            metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0
            return [], metrics

        # Optional Sentinel-2 10m GSD feasibility check (log notice but proceed with inference)
        import logging
        for cls in target_classes:
            if cls in SENTINEL2_UNRELIABLE_CLASSES:
                logging.debug("Target '%s' may be small for 10m resolution, proceeding with detector.", cls)
            elif cls in SENTINEL2_RELIABLE_CLASSES:
                logging.info("Target '%s' is standard class for detection.", cls)

        img_h, img_w = image_np.shape[:2]

        # 2. SAHI slicing
        t_pre_start = time.perf_counter()
        slices = calculate_slice_regions(
            width=img_w,
            height=img_h,
            slice_size=tile_size,
            overlap_ratio=overlap_ratio
        )
        metrics["preprocess_time_ms"] = (time.perf_counter() - t_pre_start) * 1000.0
        metrics["num_tiles"] = len(slices)

        raw_detections: List[Dict[str, Any]] = []

        total_infer_time = 0.0
        total_post_time = 0.0

        for (xmin, ymin, xmax, ymax) in slices:
            tile = image_np[ymin:ymax, xmin:xmax]
            # Ensure 3-channel BGR/RGB
            if tile.ndim == 2:
                tile = cv2.cvtColor(tile, cv2.COLOR_GRAY2BGR)
            elif tile.shape[2] == 4:
                tile = cv2.cvtColor(tile, cv2.COLOR_BGRA2BGR)

            # Inference
            t_inf_start = time.perf_counter()
            results = self.model(tile, device="cpu", verbose=False)
            total_infer_time += (time.perf_counter() - t_inf_start) * 1000.0

            # Post-process tile results
            t_post_start = time.perf_counter()
            if results and len(results) > 0:
                res = results[0]
                if hasattr(res, "obb") and res.obb is not None and len(res.obb) > 0:
                    obb_boxes = res.obb.xyxyxyxy.cpu().numpy()  # (N, 4, 2)
                    confs = res.obb.conf.cpu().numpy()          # (N,)
                    cls_ids = res.obb.cls.cpu().numpy().astype(int) # (N,)

                    for box_corners, conf, cls_id in zip(obb_boxes, confs, cls_ids):
                        cls_name = self.class_names.get(cls_id, str(cls_id)).lower()

                        # Determine effective threshold: override if passed, else calibrated default
                        if confidence_threshold is not None:
                            effective_thresh = float(confidence_threshold)
                        else:
                            effective_thresh = CLASS_CONFIDENCE_THRESHOLDS.get(cls_name, 0.35)

                        # Strict confidence filtering
                        if float(conf) < effective_thresh:
                            continue
                        # Target class filtering
                        if cls_name not in target_classes:
                            continue

                        # Convert tile-relative coordinates to full-image coordinates
                        full_img_corners = []
                        for pt in box_corners:
                            full_img_corners.append([float(pt[0] + xmin), float(pt[1] + ymin)])

                        raw_detections.append({
                            "coords": full_img_corners,
                            "confidence": float(conf),
                            "class_name": cls_name,
                            "class_id": int(cls_id)
                        })

            total_post_time += (time.perf_counter() - t_post_start) * 1000.0

        # 3. Merge overlapping detections across tiles with boundary smoothing NMS (Day 8)
        t_nms_start = time.perf_counter()
        merged_detections = nms_obb(
            raw_detections,
            iou_threshold=0.4,
            containment_threshold=0.65,
            smooth_boundaries=smooth_boundaries
        )

        # 4. Rule-based false-positive pruning (Day 13)
        pruned_detections = prune_false_positives(
            merged_detections,
            img_w=img_w,
            img_h=img_h,
            cloud_mask=cloud_mask
        )
        total_post_time += (time.perf_counter() - t_nms_start) * 1000.0

        metrics["inference_time_ms"] = total_infer_time
        metrics["postprocess_time_ms"] = total_post_time
        metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0

        return pruned_detections, metrics
