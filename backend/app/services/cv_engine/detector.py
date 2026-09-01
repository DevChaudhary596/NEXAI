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
        confidence_threshold: float = 0.5,
        tile_size: int = 640,
        overlap_ratio: float = 0.2
    ) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
        """
        Run real CPU detection on image array using SAHI slicing and confidence filtering.
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

        # Check Sentinel-2 10m GSD feasibility
        import logging
        for cls in target_classes:
            if cls in SENTINEL2_UNRELIABLE_CLASSES:
                logging.error(f"Target '{cls}' is physically too small (<30m) for Sentinel-2 10m resolution. Bypassing inference to prevent hallucination.")
                metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0
                return [], metrics
            elif cls in SENTINEL2_RELIABLE_CLASSES:
                logging.info(f"Target '{cls}' is valid for Sentinel-2 10m/px resolution. Proceeding with inference.")



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
                        # Strict confidence filtering
                        if float(conf) < float(confidence_threshold):
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

        # 3. Merge overlapping detections across tiles with NMS
        t_nms_start = time.perf_counter()
        merged_detections = nms_obb(raw_detections, iou_threshold=0.4)
        total_post_time += (time.perf_counter() - t_nms_start) * 1000.0

        metrics["inference_time_ms"] = total_infer_time
        metrics["postprocess_time_ms"] = total_post_time
        metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0

        return merged_detections, metrics
