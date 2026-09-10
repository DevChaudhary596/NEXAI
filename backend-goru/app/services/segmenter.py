"""
Real CPU-based aerial/satellite image segmenter using FastSAM and contour extraction.
"""

import os
import time
from typing import Any, Dict, List, Optional, Tuple
import cv2
import numpy as np
from ultralytics import FastSAM
from shapely.geometry import Polygon
from shapely.validation import make_valid

from app.services.detector import RealOBBDetector


class RealSegmenter:
    """
    Lightweight CPU segmenter producing real mask/polygon contours.
    """
    def __init__(self, model_path: Optional[str] = None):
        if model_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            local_model = os.path.join(base_dir, "models", "FastSAM-s.pt")
            if os.path.exists(local_model):
                model_path = local_model
            else:
                model_path = "FastSAM-s.pt"

        self.model_path = model_path
        self._model = None

    @property
    def model(self):
        if self._model is None:
            self._model = FastSAM(self.model_path)
        return self._model

    def segment_image(
        self,
        image_np: np.ndarray,
        target: str,
        detector: RealOBBDetector,
        confidence_threshold: float = 0.35,
        tile_size: int = 640
    ) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
        """
        Segment target objects in an image array.
        Workflow:
        1. Detect target object regions using real detector
        2. For each detected object region, segment using FastSAM / contour extraction
        3. Convert binary mask to contours and valid polygons
        4. Offset back to full image coordinates
        Returns (segmented_objects, metrics).
        """
        metrics = {
            "preprocess_time_ms": 0.0,
            "inference_time_ms": 0.0,
            "postprocess_time_ms": 0.0,
            "total_time_ms": 0.0,
            "num_objects": 0
        }

        start_total = time.perf_counter()

        # Step 1: Detect target regions
        detections, det_metrics = detector.detect_image(
            image_np=image_np,
            target=target,
            confidence_threshold=confidence_threshold,
            tile_size=tile_size
        )

        if not detections:
            metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0
            return [], metrics

        img_h, img_w = image_np.shape[:2]
        segmented_results: List[Dict[str, Any]] = []

        total_infer_time = det_metrics.get("inference_time_ms", 0.0)
        total_post_time = det_metrics.get("postprocess_time_ms", 0.0)

        for det in detections:
            pts = np.array(det["coords"], dtype=np.float32)
            # Find axis-aligned bounding box around OBB with margin
            min_x = max(0, int(np.min(pts[:, 0])) - 8)
            min_y = max(0, int(np.min(pts[:, 1])) - 8)
            max_x = min(img_w, int(np.max(pts[:, 0])) + 8)
            max_y = min(img_h, int(np.max(pts[:, 1])) + 8)

            crop_w = max_x - min_x
            crop_h = max_y - min_y
            if crop_w < 4 or crop_h < 4:
                continue

            crop = image_np[min_y:max_y, min_x:max_x]

            # FastSAM segmentation on the crop region
            t_inf_start = time.perf_counter()
            # FastSAM inference
            seg_results = self.model(
                crop,
                device="cpu",
                retina_masks=True,
                verbose=False
            )
            total_infer_time += (time.perf_counter() - t_inf_start) * 1000.0

            t_post_start = time.perf_counter()
            best_contour = None
            max_area = 0.0

            if seg_results and len(seg_results) > 0 and hasattr(seg_results[0], "masks") and seg_results[0].masks is not None:
                mask_polys = seg_results[0].masks.xy
                crop_center = np.array([crop_w / 2.0, crop_h / 2.0])

                for poly in mask_polys:
                    if len(poly) >= 3:
                        poly_area = cv2.contourArea(poly.astype(np.int32))
                        # Check that contour is reasonably sized and centered
                        if 10.0 < poly_area < (crop_w * crop_h * 0.98):
                            # Distance from center
                            poly_center = np.mean(poly, axis=0)
                            dist = np.linalg.norm(poly_center - crop_center)
                            score = poly_area / (1.0 + dist)
                            if score > max_area:
                                max_area = score
                                best_contour = poly

            if best_contour is None:
                # If FastSAM produced no suitable sub-mask on small crop, fallback to OBB polygon
                contour_pts = det["coords"]
            else:
                # Convert crop coordinates back to full image coordinates
                contour_pts = []
                for pt in best_contour:
                    contour_pts.append([float(pt[0] + min_x), float(pt[1] + min_y)])

            # Validate polygon with Shapely
            if len(contour_pts) >= 3:
                poly = Polygon(contour_pts)
                if not poly.is_valid:
                    poly = make_valid(poly)
                if not poly.is_empty:
                    segmented_results.append({
                        "coords": contour_pts,
                        "confidence": det["confidence"],
                        "class_name": det["class_name"],
                        "class_id": det["class_id"]
                    })

            total_post_time += (time.perf_counter() - t_post_start) * 1000.0

        metrics["inference_time_ms"] = total_infer_time
        metrics["postprocess_time_ms"] = total_post_time
        metrics["total_time_ms"] = (time.perf_counter() - start_total) * 1000.0
        metrics["num_objects"] = len(segmented_results)

        return segmented_results, metrics
