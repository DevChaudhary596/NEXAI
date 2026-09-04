import os
import glob
import csv
import cv2
import argparse
import sys

# Adjust imports to your project structure
from app.services.detector import RealOBBDetector, DOTA_CLASSES

MIN_GT_INSTANCES = 50  # Statistical significance threshold

def parse_yolo_obb_label(label_path, img_w, img_h):
    """Parse YOLO OBB format: class_id x1 y1 x2 y2 x3 y3 x4 y4 (relative). Returns absolute AABB for easy matching."""
    gt_boxes = []
    if not os.path.exists(label_path):
        return gt_boxes
    
    with open(label_path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 9:
                cls_id = int(parts[0])
                coords = [float(x) for x in parts[1:9]]
                # Absolute coordinates
                x_coords = [coords[0]*img_w, coords[2]*img_w, coords[4]*img_w, coords[6]*img_w]
                y_coords = [coords[1]*img_h, coords[3]*img_h, coords[5]*img_h, coords[7]*img_h]
                
                xmin, xmax = min(x_coords), max(x_coords)
                ymin, ymax = min(y_coords), max(y_coords)
                gt_boxes.append({
                    "class_id": cls_id,
                    "bbox": [xmin, ymin, xmax, ymax]
                })
    return gt_boxes

def compute_iou(box1, box2):
    """Compute Intersection over Union for two AABBs [xmin, ymin, xmax, ymax]"""
    x_left = max(box1[0], box2[0])
    y_top = max(box1[1], box2[1])
    x_right = min(box1[2], box2[2])
    y_bottom = min(box1[3], box2[3])

    if x_right < x_left or y_bottom < y_top:
        return 0.0

    intersection_area = (x_right - x_left) * (y_bottom - y_top)
    box1_area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2_area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    iou = intersection_area / float(box1_area + box2_area - intersection_area + 1e-6)
    return iou

def main():
    parser = argparse.ArgumentParser(
        description="Benchmark Sentinel-2 physics constraints on a YOLO-OBB dataset.",
        epilog="""
Note: To run this script correctly, you need the official DOTAv1 dataset in YOLO-OBB format.
You can acquire it by running the ultralytics downloader:
  from ultralytics.utils.downloads import download
  download('https://github.com/ultralytics/yolov5/releases/download/v1.0/DOTAv1.zip') # Or via Roboflow
  
Do NOT rely on toy datasets (e.g. 'dota8') for policy changes as they lack statistical significance.
"""
    )
    parser.add_argument('--dataset-dir', type=str, required=True, help='Path to the dataset directory containing images/val and labels/val')
    parser.add_argument('--output-csv', type=str, default='benchmark_results.csv', help='Output CSV file path')
    
    args = parser.parse_args()
    
    dataset_dir = args.dataset_dir
    img_dir = os.path.join(dataset_dir, "images", "val")
    lbl_dir = os.path.join(dataset_dir, "labels", "val")
    
    if not os.path.exists(img_dir):
        print(f"Error: Dataset not found at {img_dir}.")
        print("Please point --dataset-dir to a valid YOLO-OBB dataset containing images/val and labels/val.")
        sys.exit(1)

    # Assuming DOTA original GSD is ~1m, resize by 1/10 to simulate 10m GSD.
    GSD_SCALE_FACTOR = 0.1 
    
    # We will test all classes without filtering to see what the model actually hits.
    import app.services.detector as det
    # Temporarily clear physics block for the benchmark
    det.SENTINEL2_UNRELIABLE_CLASSES = set()

    detector = RealOBBDetector()
    
    class_stats = {cls_id: {"total_gt": 0, "hits": 0, "name": name} for cls_id, name in DOTA_CLASSES.items()}
    
    image_paths = glob.glob(os.path.join(img_dir, "*.jpg")) + glob.glob(os.path.join(img_dir, "*.png"))
    
    for img_path in image_paths:
        img = cv2.imread(img_path)
        if img is None:
            continue
        
        orig_h, orig_w = img.shape[:2]
        
        # 1. Downsample to simulate 10m GSD
        new_w = int(orig_w * GSD_SCALE_FACTOR)
        new_h = int(orig_h * GSD_SCALE_FACTOR)
        if new_w < 10 or new_h < 10:
            continue # Too small to process
            
        simulated_img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        # 2. Get Ground Truth
        filename = os.path.basename(img_path)
        lbl_path = os.path.join(lbl_dir, os.path.splitext(filename)[0] + ".txt")
        gt_boxes = parse_yolo_obb_label(lbl_path, orig_w, orig_h)
        
        # Convert GT boxes to simulated scale
        sim_gt_boxes = []
        for gt in gt_boxes:
            box = gt["bbox"]
            sim_gt_boxes.append({
                "class_id": gt["class_id"],
                "bbox": [box[0]*GSD_SCALE_FACTOR, box[1]*GSD_SCALE_FACTOR, box[2]*GSD_SCALE_FACTOR, box[3]*GSD_SCALE_FACTOR]
            })

        for gt in sim_gt_boxes:
            if gt["class_id"] in class_stats:
                class_stats[gt["class_id"]]["total_gt"] += 1
                
        if not sim_gt_boxes:
            continue
            
        # 3. Run Inference on Simulated Sentinel-2 Image
        results = detector.model(simulated_img, device="cpu", verbose=False)
        det_boxes = []
        if results and len(results) > 0 and results[0].obb is not None:
            res = results[0]
            confs = res.obb.conf.cpu().numpy()
            cls_ids = res.obb.cls.cpu().numpy().astype(int)
            obb_boxes = res.obb.xyxyxyxy.cpu().numpy()
            
            for box_corners, conf, cls_id in zip(obb_boxes, confs, cls_ids):
                if conf < 0.2:
                    continue
                xs = [pt[0] for pt in box_corners]
                ys = [pt[1] for pt in box_corners]
                det_boxes.append({
                    "class_id": cls_id,
                    "bbox": [min(xs), min(ys), max(xs), max(ys)],
                    "conf": conf
                })
                
        # 4. Match Detections to Ground Truth
        for gt in sim_gt_boxes:
            matched = False
            for d in det_boxes:
                if d["class_id"] == gt["class_id"]:
                    if compute_iou(gt["bbox"], d["bbox"]) > 0.05: 
                        matched = True
                        break
            if matched:
                class_stats[gt["class_id"]]["hits"] += 1

    # Output to CSV
    csv_path = args.output_csv
    with open(csv_path, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["Class ID", "Class Name", "Total GT Instances", "Hits (Simulated 10m)", "Hit Rate (%)", "Status"])
        
        for cls_id, stats in class_stats.items():
            total = stats["total_gt"]
            hits = stats["hits"]
            rate = (hits / total * 100) if total > 0 else 0.0
            status = "Statistically Insignificant" if total < MIN_GT_INSTANCES else "Verified"
            writer.writerow([cls_id, stats["name"], total, hits, f"{rate:.2f}", status])
            print(f"Class: {stats['name']:>18} | GT: {total:>5} | Hits: {hits:>5} | Rate: {rate:>5.1f}% | Status: {status}")
            
    print(f"\nResults saved to {csv_path}")

if __name__ == "__main__":
    main()
