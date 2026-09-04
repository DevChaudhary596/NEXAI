"""
Reproducible demo validation script for CVService.
Demonstrates:
Input image -> target -> number of detections -> confidence -> processing time -> output FeatureCollection
Also generates a visual overlay artifact for verification.
"""

import os
import time
import cv2
import numpy as np

from app.models.geojson import BBox
from app.services.cv_impl import CVService

DEMO_IMAGE = "data/real_satellite_airport.jpg"
OUTPUT_VIS_PATH = "demo_result_visualization.jpg"


def run_demo(target: str = "plane", confidence: float = 0.35):
    print("=" * 60)
    print("SATELLITE / AERIAL COMPUTER VISION SERVICE DEMO")
    print("=" * 60)
    print(f"Input image:          {DEMO_IMAGE}")
    print(f"Target object:        {target}")
    print(f"Confidence threshold: {confidence}")

    service = CVService()

    # 1. Warm-up tile to ensure fair benchmark
    warmup_tile = np.zeros((640, 640, 3), dtype=np.uint8)
    _ = service.detector.model(warmup_tile, device="cpu", verbose=False)

    # 2. Run real detection
    t_start = time.perf_counter()
    fc = service.detect(
        scene_path=DEMO_IMAGE,
        target=target,
        bbox=None,
        confidence=confidence
    )
    total_time_ms = (time.perf_counter() - t_start) * 1000.0

    # 3. Print metrics
    metrics = service.last_benchmark_metrics
    num_tiles = metrics.get("num_tiles", 1)
    infer_time = metrics.get("inference_time_ms", 0.0)
    pre_time = metrics.get("preprocess_time_ms", 0.0)
    post_time = metrics.get("postprocess_time_ms", 0.0)
    per_tile_infer = infer_time / max(1, num_tiles)

    print("-" * 60)
    print(f"Number of detections: {len(fc.features)}")
    print(f"Tiles processed:      {num_tiles} (SAHI 640x640)")
    print(f"Preprocessing time:   {pre_time:.2f} ms")
    print(f"Inference time:       {infer_time:.2f} ms ({per_tile_infer:.2f} ms per tile)")
    print(f"Postprocessing time:  {post_time:.2f} ms")
    print(f"Total end-to-end:     {total_time_ms:.2f} ms")
    print("-" * 60)

    # Print sample features
    for idx, feat in enumerate(fc.features[:5]):
        conf = feat.properties.get("confidence")
        cls_name = feat.properties.get("target")
        geom_type = feat.geometry.type
        print(f"  Feature {idx+1}: [{cls_name}] conf={conf} | geom={geom_type}")
    if len(fc.features) > 5:
        print(f"  ... and {len(fc.features) - 5} more detections.")

    # 4. Generate Visual Overlay
    img_bgr = cv2.imread(DEMO_IMAGE)
    vis = img_bgr.copy()

    # Draw detections
    colors = [(0, 255, 100), (0, 180, 255), (255, 100, 0), (255, 0, 200)]
    for i, feat in enumerate(fc.features):
        color = colors[i % len(colors)]
        coords = feat.geometry.coordinates[0]
        pts = np.array(coords, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(vis, [pts], isClosed=True, color=color, thickness=2)
        cv2.fillPoly(vis, [pts], color=(color[0] // 4, color[1] // 4, color[2] // 4))

        # Label
        label = f"{feat.properties.get('target')} {feat.properties.get('confidence'):.2f}"
        top_pt = pts[0][0]
        cv2.putText(vis, label, (int(top_pt[0]), max(15, int(top_pt[1]) - 5)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

    # Add header banner
    banner_text = f"Target: {target} | Detections: {len(fc.features)} | CPU Tile Latency: {per_tile_infer:.1f} ms"
    cv2.rectangle(vis, (0, 0), (vis.shape[1], 40), (20, 20, 20), -1)
    cv2.putText(vis, banner_text, (15, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)

    cv2.imwrite(OUTPUT_VIS_PATH, vis)
    print(f"\nVisualization saved to: {OUTPUT_VIS_PATH}")

    # Copy to artifact directory if available
    artifact_dir = "/Users/harshkumarjangra/.gemini/antigravity-ide/brain/8bcc0cd3-251c-445b-b9c9-ab8db3adf8f7"
    if os.path.exists(artifact_dir):
        import shutil
        shutil.copy(OUTPUT_VIS_PATH, os.path.join(artifact_dir, "demo_result_visualization.jpg"))

    return fc, metrics


if __name__ == "__main__":
    run_demo("plane", confidence=0.35)
