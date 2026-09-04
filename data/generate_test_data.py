"""
Utility to generate test aerial images and georeferenced GeoTIFFs for verification.
"""

import os
import cv2
import numpy as np
import rasterio
from rasterio.transform import from_origin


def create_test_aerial_scene(output_path: str, width: int = 800, height: int = 800):
    """
    Generate a realistic aerial-like scene with visual features (e.g. storage tanks, runways, water).
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img = np.full((height, width, 3), 110, dtype=np.uint8)

    # Add ground texture
    noise = np.random.normal(0, 10, (height, width, 3)).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    # Water area (dark blue)
    img[:, :200] = [120, 60, 30]

    # Concrete dock / harbor
    cv2.rectangle(img, (180, 100), (350, 700), (160, 160, 160), -1)

    # Draw storage tanks (circular structures with shadows and rims)
    tanks = [
        (450, 250, 45),
        (580, 250, 45),
        (450, 380, 45),
        (580, 380, 45),
        (450, 510, 45),
        (580, 510, 45),
    ]
    for cx, cy, r in tanks:
        # shadow
        cv2.circle(img, (cx + 6, cy + 6), r, (40, 40, 40), -1)
        # tank body
        cv2.circle(img, (cx, cy), r, (220, 220, 220), -1)
        # rim
        cv2.circle(img, (cx, cy), r, (150, 150, 150), 3)
        # tank top roof details
        cv2.circle(img, (cx, cy), r // 2, (190, 190, 190), -1)

    # Draw ship-like hull in water
    pts = np.array([[80, 200], [130, 200], [140, 420], [105, 480], [70, 420]], np.int32)
    cv2.fillPoly(img, [pts], (180, 180, 190))
    cv2.polylines(img, [pts], True, (30, 30, 40), 2)
    # deck house
    cv2.rectangle(img, (85, 260), (125, 340), (230, 230, 230), -1)

    cv2.imwrite(output_path, img)
    return output_path


def create_test_geotiff(output_path: str, width: int = 512, height: int = 512):
    """
    Create a georeferenced GeoTIFF with standard WGS84 coordinates.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    # Top-left at 77.2090 E, 28.6139 N (New Delhi coordinates), resolution 0.0001 deg/pixel
    transform = from_origin(77.2090, 28.6139, 0.0001, 0.0001)
    
    # 3 bands (RGB)
    data = np.zeros((3, height, width), dtype=np.uint8)
    # Background
    data[0, :, :] = 100
    data[1, :, :] = 130
    data[2, :, :] = 90
    
    # Draw tanks
    tanks = [(200, 200, 40), (320, 200, 40), (200, 320, 40), (320, 320, 40)]
    for cx, cy, r in tanks:
        cv2.circle(data[0], (cx, cy), r, 220, -1)
        cv2.circle(data[1], (cx, cy), r, 220, -1)
        cv2.circle(data[2], (cx, cy), r, 220, -1)

    with rasterio.open(
        output_path,
        'w',
        driver='GTiff',
        height=height,
        width=width,
        count=3,
        dtype='uint8',
        crs='+proj=latlong',
        transform=transform,
    ) as dst:
        for i in range(3):
            dst.write(data[i], i + 1)

    return output_path


if __name__ == "__main__":
    p1 = create_test_aerial_scene("data/test_aerial_scene.jpg", 1000, 1000)
    p2 = create_test_geotiff("data/test_georeferenced.tif", 512, 512)
    print("Created test images:", p1, p2)
