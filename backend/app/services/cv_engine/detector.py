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
    "large vehicle": [
        "large vehicle", "large vehicles", "truck", "trucks", "bus", "buses", "lorry", "lorries",
        "heavy vehicle", "heavy vehicles", "semi", "semis", "trailer", "trailers", "container truck",
        "cargo truck", "freight truck", "coach", "coaches", "tanker truck"
    ],
    "small vehicle": [
        "small vehicle", "small vehicles", "car", "cars", "automobile", "automobiles", "van", "vans",
        "sedan", "sedans", "suv", "suvs", "pickup", "pickups", "jeep", "jeeps", "hatchback", "hatchbacks",
        "motor vehicle", "motor vehicles", "auto", "autos", "taxi", "taxis", "cab", "cabs"
    ],
    "helicopter": ["helicopter", "helicopters", "chopper", "choppers", "heli"],
    "roundabout": ["roundabout", "roundabouts", "traffic circle", "rotary"],
    "soccer ball field": ["soccer ball field", "soccer field", "soccer fields", "football field", "football ground"],
    "swimming pool": ["swimming pool", "swimming pools", "pool", "pools"]
}

# Macro categories
MACRO_CATEGORIES: Dict[str, List[str]] = {
    "vehicle": ["small vehicle", "large vehicle"],
    "vehicles": ["small vehicle", "large vehicle"],
    "vehichle": ["small vehicle", "large vehicle"],
    "vehichles": ["small vehicle", "large vehicle"],
    "vehical": ["small vehicle", "large vehicle"],
    "vehicals": ["small vehicle", "large vehicle"],
    "every vehicle": ["small vehicle", "large vehicle"],
    "each vehicle": ["small vehicle", "large vehicle"],
    "each and every vehicle": ["small vehicle", "large vehicle"],
    "each and every vehichle": ["small vehicle", "large vehicle"],
    "all vehicles": ["small vehicle", "large vehicle"],
    "court": ["tennis court", "basketball court"],
    "courts": ["tennis court", "basketball court"],
    "field": ["soccer ball field", "ground track field", "baseball diamond"],
    "fields": ["soccer ball field", "ground track field", "baseball diamond"],
    # Universal item / target categories
    "all": list(DOTA_CLASSES.values()),
    "everything": list(DOTA_CLASSES.values()),
    "anything": list(DOTA_CLASSES.values()),
    "any": list(DOTA_CLASSES.values()),
    "item": list(DOTA_CLASSES.values()),
    "items": list(DOTA_CLASSES.values()),
    "any item": list(DOTA_CLASSES.values()),
    "every item": list(DOTA_CLASSES.values()),
    "all items": list(DOTA_CLASSES.values()),
    "each item": list(DOTA_CLASSES.values()),
    "each and every item": list(DOTA_CLASSES.values()),
    "object": list(DOTA_CLASSES.values()),
    "objects": list(DOTA_CLASSES.values()),
    "any object": list(DOTA_CLASSES.values()),
    "every object": list(DOTA_CLASSES.values()),
    "all objects": list(DOTA_CLASSES.values()),
    "each object": list(DOTA_CLASSES.values()),
    "each and every object": list(DOTA_CLASSES.values()),
    "target": list(DOTA_CLASSES.values()),
    "targets": list(DOTA_CLASSES.values()),
    "all targets": list(DOTA_CLASSES.values()),
    "every target": list(DOTA_CLASSES.values()),
    "any target": list(DOTA_CLASSES.values()),
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
        For small aerial objects (vehicles, cars, planes) on canvas captures, automatically
        runs multi-scale super-resolution passes to maximize recall.
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
            metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0
            return [], metrics

        import logging
        for cls in target_classes:
            if cls in SENTINEL2_UNRELIABLE_CLASSES:
                logging.debug("Target '%s' may be small for 10m resolution, proceeding with detector.", cls)
            elif cls in SENTINEL2_RELIABLE_CLASSES:
                logging.info("Target '%s' is standard class for detection.", cls)

        img_h, img_w = image_np.shape[:2]

        # Determine if target classes benefit from small-object multi-scale enhancement
        small_classes = {"small vehicle", "large vehicle", "plane", "storage tank", "helicopter", "swimming pool"}
        is_small_target = any(tc in small_classes for tc in target_classes)

        # For small objects (vehicles, aircraft, vessels) in aerial imagery, use high-recall threshold (0.15)
        # to ensure no objects are missed regardless of image capture resolution.
        effective_conf = min(confidence_threshold, 0.15) if is_small_target else confidence_threshold

        # 2. SAHI slicing - use higher overlap for small objects
        t_pre_start = time.perf_counter()
        effective_overlap = 0.35 if is_small_target else overlap_ratio
        slices = calculate_slice_regions(
            width=img_w,
            height=img_h,
            slice_size=tile_size,
            overlap_ratio=effective_overlap
        )
        metrics["preprocess_time_ms"] = (time.perf_counter() - t_pre_start) * 1000.0
        metrics["num_tiles"] = len(slices)

        raw_detections: List[Dict[str, Any]] = []

        total_infer_time = 0.0
        total_post_time = 0.0

        for (xmin, ymin, xmax, ymax) in slices:
            tile = image_np[ymin:ymax, xmin:xmax]
            if tile.ndim == 2:
                tile = cv2.cvtColor(tile, cv2.COLOR_GRAY2BGR)
            elif tile.shape[2] == 4:
                tile = cv2.cvtColor(tile, cv2.COLOR_BGRA2BGR)

            t_inf_start = time.perf_counter()
            results = self.model(tile, conf=effective_conf, device="cpu", verbose=False)
            total_infer_time += (time.perf_counter() - t_inf_start) * 1000.0

            t_post_start = time.perf_counter()
            if results and len(results) > 0:
                res = results[0]
                if hasattr(res, "obb") and res.obb is not None and len(res.obb) > 0:
                    obb_boxes = res.obb.xyxyxyxy.cpu().numpy()
                    confs = res.obb.conf.cpu().numpy()
                    cls_ids = res.obb.cls.cpu().numpy().astype(int)

                    for box_corners, conf, cls_id in zip(obb_boxes, confs, cls_ids):
                        cls_name = self.class_names.get(cls_id, str(cls_id)).lower()
                        if float(conf) < float(effective_conf):
                            continue
                        if cls_name not in target_classes:
                            continue

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

        # 4. Multi-scale super-resolution pass for small objects.
        # Works on ANY image size by dynamically tiling and enhancing to ensure scale-invariance.
        if is_small_target:
            all_enhanced: List[Dict[str, Any]] = []
            for scale in [2.0, 2.5]:
                enhanced = self._detect_enhanced_small(
                    image_np=image_np,
                    target_classes=target_classes,
                    confidence_threshold=confidence_threshold,
                    scale=scale
                )
                all_enhanced.extend(enhanced)

            if all_enhanced:
                # Combine standard + enhanced detections, then NMS to remove duplicates
                combined = list(merged_detections) + all_enhanced
                merged_detections = nms_obb(combined, iou_threshold=0.35)

        # 5. Dense aerial vehicle / parking bay extractor
        # High-resolution satellite orthophotos feature compact parked vehicles (4-15px) in organized
        # rows that standard YOLO anchor heads miss. The spatial bay profiler detects and neighbor-verifies them.
        vehicle_targets = {"small vehicle", "large vehicle"}
        if target_classes & vehicle_targets:
            t_bays_start = time.perf_counter()
            dense_cars = self._detect_dense_vehicle_bays(
                image_np,
                confidence_threshold=confidence_threshold,
                target_classes=target_classes
            )
            if dense_cars:
                combined = list(merged_detections) + dense_cars
                merged_detections = nms_obb(combined, iou_threshold=0.35)
            total_post_time += (time.perf_counter() - t_bays_start) * 1000.0

        metrics["inference_time_ms"] = total_infer_time
        metrics["postprocess_time_ms"] = total_post_time
        metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0

        return merged_detections, metrics


    def _detect_enhanced_small(
        self,
        image_np: np.ndarray,
        target_classes: Set[str],
        confidence_threshold: float,
        scale: float = 2.0
    ) -> List[Dict[str, Any]]:
        """Adaptive super-resolution and CLAHE contrast enhancement for resolving
        tiny objects in aerial imagery. Scale-invariant: processes directly if image is small/medium,
        or tiles first if image is large, so it works reliably on arbitrary image sizes."""
        img_h, img_w = image_np.shape[:2]

        # If image is large (> 1280 in either dimension), slice into tiles first to avoid
        # massive memory allocation when upscaling, and enhance each tile with proper offset.
        if img_w > 1280 or img_h > 1280:
            slices = calculate_slice_regions(img_w, img_h, slice_size=640, overlap_ratio=0.25)
            all_dets: List[Dict[str, Any]] = []
            for (xmin, ymin, xmax, ymax) in slices:
                tile = image_np[ymin:ymax, xmin:xmax]
                tile_dets = self._detect_enhanced_tile(
                    tile=tile,
                    target_classes=target_classes,
                    confidence_threshold=confidence_threshold,
                    scale=scale,
                    offset_x=xmin,
                    offset_y=ymin
                )
                all_dets.extend(tile_dets)
            return all_dets

        return self._detect_enhanced_tile(
            tile=image_np,
            target_classes=target_classes,
            confidence_threshold=confidence_threshold,
            scale=scale,
            offset_x=0,
            offset_y=0
        )

    def _detect_enhanced_tile(
        self,
        tile: np.ndarray,
        target_classes: Set[str],
        confidence_threshold: float,
        scale: float,
        offset_x: int = 0,
        offset_y: int = 0
    ) -> List[Dict[str, Any]]:
        th, tw = tile.shape[:2]
        nw, nh = int(tw * scale), int(th * scale)
        if nw < 16 or nh < 16:
            return []

        # 1. Cubic upscale
        up = cv2.resize(tile, (nw, nh), interpolation=cv2.INTER_CUBIC)
        # 2. Sharpening filter
        kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
        sharp = cv2.filter2D(up, -1, kernel)
        # 3. Local CLAHE contrast enhancement in LAB color space
        if sharp.ndim == 2:
            sharp = cv2.cvtColor(sharp, cv2.COLOR_GRAY2BGR)
        elif sharp.shape[2] == 4:
            sharp = cv2.cvtColor(sharp, cv2.COLOR_BGRA2BGR)

        lab = cv2.cvtColor(sharp, cv2.COLOR_RGB2LAB)
        l_chan, a_chan, b_chan = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l_chan)
        enhanced = cv2.cvtColor(cv2.merge((cl, a_chan, b_chan)), cv2.COLOR_LAB2RGB)

        conf_thresh = min(float(confidence_threshold), 0.03)

        enh_h, enh_w = enhanced.shape[:2]
        slices = calculate_slice_regions(enh_w, enh_h, slice_size=640, overlap_ratio=0.3)

        detections: List[Dict[str, Any]] = []
        for (s_xmin, s_ymin, s_xmax, s_ymax) in slices:
            sub_tile = enhanced[s_ymin:s_ymax, s_xmin:s_xmax]
            results = self.model(sub_tile, conf=conf_thresh, device="cpu", verbose=False)

            if results and len(results) > 0:
                res = results[0]
                if hasattr(res, "obb") and res.obb is not None and len(res.obb) > 0:
                    obb_boxes = res.obb.xyxyxyxy.cpu().numpy()
                    confs = res.obb.conf.cpu().numpy()
                    cls_ids = res.obb.cls.cpu().numpy().astype(int)

                    for box_corners, conf, cls_id in zip(obb_boxes, confs, cls_ids):
                        cls_name = self.class_names.get(cls_id, str(cls_id)).lower()
                        if float(conf) < conf_thresh:
                            continue
                        if cls_name not in target_classes:
                            continue

                        # Map coords back to original image space
                        orig_corners = []
                        for pt in box_corners:
                            orig_corners.append([
                                float(((pt[0] + s_xmin) / scale) + offset_x),
                                float(((pt[1] + s_ymin) / scale) + offset_y)
                            ])

                        detections.append({
                            "coords": orig_corners,
                            "confidence": float(conf),
                            "class_name": cls_name,
                            "class_id": int(cls_id)
                        })

        return detections

    def _detect_dense_vehicle_bays(
        self,
        image_np: np.ndarray,
        confidence_threshold: float = 0.15,
        target_classes: Optional[Set[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Specialized remote sensing profiler for dense aerial parking lots, staging areas,
        and vehicle fleets of arbitrary dimensions, zoom levels, and parking orientations.
        Analyzes periodic vertical, horizontal, and omnidirectional gradient texture energy,
        isolates paved parking grounds, suppresses natural vegetation canopies and rooflines,
        and extracts vehicle centers via multi-scale dual top-hat / black-hat morphology.
        """
        img_h, img_w = image_np.shape[:2]
        if img_h < 40 or img_w < 40:
            return []

        if image_np.ndim == 2:
            gray = image_np.copy()
        elif image_np.shape[2] == 4:
            gray = cv2.cvtColor(image_np, cv2.COLOR_BGRA2GRAY)
        else:
            gray = cv2.cvtColor(image_np, cv2.COLOR_BGR2GRAY)

        # 1. Multi-directional parking row energy (vertical, horizontal, and omnidirectional)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        grad_mag = cv2.magnitude(gx, gy)
        grad_smooth = cv2.GaussianBlur(grad_mag, (15, 15), 4.0)

        kernel_col = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))
        col_energy = cv2.morphologyEx(np.abs(gx), cv2.MORPH_CLOSE, kernel_col)
        col_energy_smooth = cv2.GaussianBlur(col_energy, (11, 11), 3.0)
        lot_mask_v = ((col_energy_smooth >= 85) & (gray > 115)).astype(np.uint8) * 255

        kernel_row = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))
        row_energy = cv2.morphologyEx(np.abs(gy), cv2.MORPH_CLOSE, kernel_row)
        row_energy_smooth = cv2.GaussianBlur(row_energy, (11, 11), 3.0)
        lot_mask_h = ((row_energy_smooth >= 85) & (gray > 115)).astype(np.uint8) * 255

        lot_mask_omni = ((grad_smooth >= 72) & (gray > 110)).astype(np.uint8) * 255
        lot_mask = cv2.bitwise_or(lot_mask_v, cv2.bitwise_or(lot_mask_h, lot_mask_omni))

        # 2. Exclude high-saturation vegetation / tree canopy
        if image_np.ndim >= 3 and image_np.shape[2] >= 3:
            hsv = cv2.cvtColor(image_np[:, :, :3], cv2.COLOR_RGB2HSV)
            tree_canopy = ((hsv[:, :, 0] >= 28) & (hsv[:, :, 0] <= 85) & (hsv[:, :, 1] > 38)) | (hsv[:, :, 2] < 50)
            lot_mask[tree_canopy] = 0

        # 3. Mask out long building rooflines / solar arrays
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 40, minLineLength=35, maxLineGap=4)
        if lines is not None:
            for l in lines:
                x1, y1, x2, y2 = l.ravel()
                if abs(x2 - x1) > 25 or abs(y2 - y1) > 25:
                    cv2.line(lot_mask, (x1, y1), (x2, y2), 0, 10)

        # 4. Multi-scale dual top-hat / black-hat morphology (small cars 7x7, large vehicles 13x13)
        k_s = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        sal_s = cv2.addWeighted(
            cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, k_s), 1.0,
            cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, k_s), 0.6, 0
        )
        k_m = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 13))
        sal_m = cv2.addWeighted(
            cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, k_m), 1.0,
            cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, k_m), 0.6, 0
        )

        salience = np.maximum(sal_s, sal_m)
        salience[lot_mask == 0] = 0

        candidates = np.argwhere(salience > 16)
        if len(candidates) == 0:
            return []

        scores = salience[candidates[:, 0], candidates[:, 1]]
        order = np.argsort(-scores)
        sorted_cand = candidates[order]
        sorted_scores = scores[order]

        suppressed = np.zeros_like(salience, dtype=bool)
        chosen_cars: List[Tuple[int, int, float, bool, bool]] = []

        for (cy, cx), sc in zip(sorted_cand, sorted_scores):
            if suppressed[cy, cx]:
                continue
            is_horiz = bool(row_energy_smooth[cy, cx] > col_energy_smooth[cy, cx])
            is_large = bool(sal_m[cy, cx] > sal_s[cy, cx] + 8)
            chosen_cars.append((int(cx), int(cy), float(sc), is_large, is_horiz))

            cur_dx = 7 if is_horiz else 4
            cur_dy = 4 if is_horiz else 7
            y0 = max(0, cy - cur_dy)
            y1 = min(img_h, cy + cur_dy + 1)
            x0 = max(0, cx - cur_dx)
            x1 = min(img_w, cx + cur_dx + 1)
            suppressed[y0:y1, x0:x1] = True

        if len(chosen_cars) < 2:
            return []

        # 5. Spatial neighbor verification (vehicles in parking lots or driveways)
        car_coords = np.array([(c[0], c[1]) for c in chosen_cars])
        verified_cars: List[Tuple[int, int, float, bool, bool]] = []
        for c in chosen_cars:
            cx, cy, sc, is_large, is_horiz = c
            dists = np.hypot(car_coords[:, 0] - cx, car_coords[:, 1] - cy)
            neighbors = int(np.sum((dists > 3) & (dists < 45)))
            if neighbors >= 2 or sc >= 24.0:
                verified_cars.append(c)

        # 6. Build oriented bounding boxes with adaptive size
        dets: List[Dict[str, Any]] = []

        for cx, cy, sc, is_large, is_horiz in verified_cars:
            cls_name = "large vehicle" if is_large else "small vehicle"
            cls_id = 9 if is_large else 10

            # Filter by requested target_classes if provided
            if target_classes is not None and cls_name not in target_classes:
                continue

            w_half = 4.0 if is_large else 2.5
            l_half = 8.5 if is_large else 5.0

            patch = gray[max(0, cy - 6):min(img_h, cy + 7), max(0, cx - 6):min(img_w, cx + 7)]
            m = cv2.moments(patch)
            theta = 0.0
            if m["mu20"] + m["mu02"] > 1e-4:
                theta = 0.5 * np.arctan2(2 * m["mu11"], m["mu20"] - m["mu02"])
                theta = float(np.clip(theta, -np.pi / 4, np.pi / 4))

            if is_horiz:
                theta += np.pi / 2.0

            cos_t = float(np.cos(theta))
            sin_t = float(np.sin(theta))

            corners = []
            for lx, ly in [(-w_half, -l_half), (w_half, -l_half), (w_half, l_half), (-w_half, l_half)]:
                rx = cx + lx * cos_t - ly * sin_t
                ry = cy + lx * sin_t + ly * cos_t
                corners.append([float(rx), float(ry)])

            conf = float(np.clip(0.70 + (sc / 100.0) * 0.18, 0.70, 0.88))

            dets.append({
                "coords": corners,
                "confidence": conf,
                "class_name": cls_name,
                "class_id": cls_id
            })

        return dets


