"""
Day 1 Curation Tool: Generates 15 Standardized Benchmark Satellite Scenes
across Disaster, Agriculture, and Urban tracks, and produces the master ground truth manifest.
"""

import json
import os
import cv2
import numpy as np
import rasterio
from rasterio.transform import from_origin


BENCHMARK_ROOT = "data/benchmark_scenes"
MANIFEST_PATH = "qa_eval/benchmark_manifest.json"


def ensure_dirs():
    for track in ["disaster", "agriculture", "urban"]:
        os.makedirs(os.path.join(BENCHMARK_ROOT, track), exist_ok=True)
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)


def create_geotiff(
    output_path: str,
    bands: np.ndarray,
    top_left_lon: float,
    top_left_lat: float,
    res_deg: float = 0.0001,
):
    """
    Writes a multi-band numpy array (shape: [num_bands, H, W]) to GeoTIFF with WGS84 CRS.
    """
    num_bands, height, width = bands.shape
    transform = from_origin(top_left_lon, top_left_lat, res_deg, res_deg)

    with rasterio.open(
        output_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=num_bands,
        dtype=bands.dtype.name,
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        for b in range(num_bands):
            dst.write(bands[b], b + 1)


def generate_15_benchmarks():
    ensure_dirs()
    manifest = {
        "benchmark_version": "1.0.0",
        "created_by": "Member 6 (QA Lead)",
        "total_scenes": 15,
        "tracks": ["disaster", "agriculture", "urban"],
        "scenes": []
    }

    # =========================================================================
    # TRACK 1: DISASTER MANAGEMENT (5 Scenes)
    # =========================================================================
    disaster_specs = [
        {
            "id": "disaster_01_kaziranga_flood",
            "name": "Kaziranga Flood Inundation",
            "filename": "disaster/disaster_01_kaziranga_flood.tif",
            "coords": (93.150, 26.650),
            "size": (800, 800),
            "primary_feature": "floodwater",
            "water_pct": 42.5,
            "target_counts": {"water body": 1, "flooded parcel": 3},
            "description": "Brahmaputra river overflow inundating wildlife corridors and agricultural lowlands."
        },
        {
            "id": "disaster_02_assam_waterlogging",
            "name": "Assam Rural Waterlogging",
            "filename": "disaster/disaster_02_assam_waterlogging.tif",
            "coords": (92.820, 26.310),
            "size": (800, 800),
            "primary_feature": "waterlogging",
            "water_pct": 31.0,
            "target_counts": {"waterlogged road": 2, "submerged structure": 8},
            "description": "Prolonged monsoon waterlogging covering village roads and settlement fringes."
        },
        {
            "id": "disaster_03_coastal_surge",
            "name": "Odisha Coastal Storm Surge",
            "filename": "disaster/disaster_03_coastal_surge.tif",
            "coords": (86.720, 20.310),
            "size": (800, 800),
            "primary_feature": "storm_surge",
            "water_pct": 55.0,
            "target_counts": {"breached embankment": 2, "inundated shore": 1},
            "description": "Severe cyclone storm surge breaching saline embankments along the coastline."
        },
        {
            "id": "disaster_04_forest_burn_scar",
            "name": "Simlipal Wildfire Burn Scar",
            "filename": "disaster/disaster_04_forest_burn_scar.tif",
            "coords": (86.350, 21.850),
            "size": (800, 800),
            "primary_feature": "burn_scar",
            "water_pct": 5.0,
            "target_counts": {"burn scar": 2, "unaffected forest": 3},
            "description": "Post-fire high-severity burn scar with blackened canopy and active perimeter."
        },
        {
            "id": "disaster_05_landslide_debris",
            "name": "Wayanad Hillside Landslide Debris",
            "filename": "disaster/disaster_05_landslide_debris.tif",
            "coords": (76.130, 11.580),
            "size": (800, 800),
            "primary_feature": "landslide",
            "water_pct": 8.0,
            "target_counts": {"landslide scar": 2, "blocked stream": 1},
            "description": "Catastrophic debris flow blocking river channel and stripping hillside vegetation."
        },
    ]

    for spec in disaster_specs:
        h, w = spec["size"]
        # 4 bands: B=Blue, G=Green, R=Red, NIR=Near-Infrared (for NDWI/NDVI)
        bands = np.zeros((4, h, w), dtype=np.uint8)

        # Baseline terrain background
        bands[0] = 70   # Blue
        bands[1] = 110  # Green
        bands[2] = 85   # Red
        bands[3] = 160  # NIR (Vegetation high NIR)

        # Add disaster water / damage features
        if spec["primary_feature"] in ["floodwater", "waterlogging", "storm_surge"]:
            # Flood water polygon (high Blue/Green, very low NIR)
            water_poly = np.array([[50, 100], [w - 50, 120], [w - 100, int(h * 0.6)], [100, int(h * 0.7)]], np.int32)
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, [water_poly], 255)
            
            bands[0][mask == 255] = 160  # High blue in water
            bands[1][mask == 255] = 130
            bands[2][mask == 255] = 60   # Low red
            bands[3][mask == 255] = 15   # Extremely low NIR in water (NDWI trigger)
        elif spec["primary_feature"] == "burn_scar":
            scar_poly = np.array([[150, 150], [w - 150, 180], [w - 200, h - 200], [180, h - 180]], np.int32)
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, [scar_poly], 255)
            bands[0][mask == 255] = 40
            bands[1][mask == 255] = 45
            bands[2][mask == 255] = 70
            bands[3][mask == 255] = 30
        else: # Landslide
            debris_poly = np.array([[200, 50], [450, 350], [400, h - 100], [250, h - 100]], np.int32)
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, [debris_poly], 255)
            bands[0][mask == 255] = 130
            bands[1][mask == 255] = 120
            bands[2][mask == 255] = 110
            bands[3][mask == 255] = 60

        out_path = os.path.join(BENCHMARK_ROOT, spec["filename"])
        create_geotiff(out_path, bands, spec["coords"][0], spec["coords"][1])

        # Polygon coordinates in WGS84
        top_lon, top_lat = spec["coords"]
        res = 0.0001
        poly_geo = [
            [top_lon + 50 * res, top_lat - 100 * res],
            [top_lon + (w - 50) * res, top_lat - 120 * res],
            [top_lon + (w - 100) * res, top_lat - int(h * 0.6) * res],
            [top_lon + 100 * res, top_lat - int(h * 0.7) * res],
            [top_lon + 50 * res, top_lat - 100 * res]
        ]

        manifest["scenes"].append({
            "scene_id": spec["id"],
            "track": "disaster",
            "title": spec["name"],
            "file_path": out_path,
            "crs": "EPSG:4326",
            "dimensions": {"width": w, "height": h, "bands": 4},
            "top_left_origin": [top_lon, top_lat],
            "pixel_resolution_deg": res,
            "target_counts": spec["target_counts"],
            "ground_truth_polygons": [
                {
                    "type": "Feature",
                    "properties": {"feature_class": spec["primary_feature"], "confidence": 1.0},
                    "geometry": {"type": "Polygon", "coordinates": [poly_geo]}
                }
            ],
            "spectral_expected": {"dominant_index": "NDWI", "water_coverage_pct": spec["water_pct"]},
            "sample_queries": [
                f"Show flooded areas in {spec['name']}",
                "Calculate water index and segment inundated zones",
                "Highlight areas affected by waterlogging"
            ]
        })

    # =========================================================================
    # TRACK 2: AGRICULTURE & VEGETATION (5 Scenes)
    # =========================================================================
    agri_specs = [
        {
            "id": "agri_01_punjab_wheat_ndvi",
            "name": "Punjab High-Vigor Wheat Farm",
            "filename": "agriculture/agri_01_punjab_wheat_ndvi.tif",
            "coords": (75.850, 30.900),
            "size": (800, 800),
            "mean_ndvi": 0.68,
            "target_counts": {"healthy crop parcel": 6, "stressed parcel": 2},
            "description": "Dense wheat cropland exhibiting peak chlorophyll absorption and high NIR reflectance."
        },
        {
            "id": "agri_02_maharashtra_drought_ndwi",
            "name": "Marathwada Drought Crop Stress",
            "filename": "agriculture/agri_02_maharashtra_drought_ndwi.tif",
            "coords": (76.550, 18.400),
            "size": (800, 800),
            "mean_ndvi": 0.22,
            "target_counts": {"moisture stressed parcel": 7, "fallow land": 4},
            "description": "Semi-arid agricultural zone experiencing severe soil moisture deficit."
        },
        {
            "id": "agri_03_karnataka_crop_parcels",
            "name": "Karnataka Multi-Crop Parcel Boundaries",
            "filename": "agriculture/agri_03_karnataka_crop_parcels.tif",
            "coords": (76.920, 15.150),
            "size": (800, 800),
            "mean_ndvi": 0.49,
            "target_counts": {"crop parcel": 9, "irrigation canal": 1},
            "description": "Heterogeneous farming plots with sharp boundary hedgerows and canal network."
        },
        {
            "id": "agri_04_gangetic_paddy_vigor",
            "name": "Gangetic Basin Paddy Greenness",
            "filename": "agriculture/agri_04_gangetic_paddy_vigor.tif",
            "coords": (85.120, 25.600),
            "size": (800, 800),
            "mean_ndvi": 0.74,
            "target_counts": {"paddy field": 8, "drainage channel": 2},
            "description": "Irrigated kharif rice paddy fields with uniform high-density canopy."
        },
        {
            "id": "agri_05_deforestation_canopy",
            "name": "Western Ghats Forest Clearing Patch",
            "filename": "agriculture/agri_05_deforestation_canopy.tif",
            "coords": (75.400, 13.350),
            "size": (800, 800),
            "mean_ndvi": 0.38,
            "target_counts": {"cleared patch": 3, "dense canopy": 4},
            "description": "Canopy fragmentation along ecological reserve periphery."
        },
    ]

    for spec in agri_specs:
        h, w = spec["size"]
        bands = np.zeros((4, h, w), dtype=np.uint8)

        # Base agricultural soil / vegetation
        bands[0] = 50   # Blue (chlorophyll absorbs)
        bands[1] = 120  # Green
        bands[2] = 60   # Red (chlorophyll absorbs)
        bands[3] = int(220 * spec["mean_ndvi"]) # High NIR for healthy crops

        # Draw parcel grid
        num_cells = 3
        cell_h = h // num_cells
        cell_w = w // num_cells
        polys_geo = []
        top_lon, top_lat = spec["coords"]
        res = 0.0001

        for r in range(num_cells):
            for c in range(num_cells):
                y1, y2 = r * cell_h + 10, (r + 1) * cell_h - 10
                x1, x2 = c * cell_w + 10, (c + 1) * cell_w - 10
                
                # Alternate vigor levels
                factor = 1.2 if (r + c) % 2 == 0 else 0.6
                bands[3, y1:y2, x1:x2] = np.clip(bands[3, y1:y2, x1:x2] * factor, 20, 255)

                polys_geo.append({
                    "type": "Feature",
                    "properties": {"parcel_id": f"P_{r}_{c}", "vigor_factor": round(factor, 2)},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [top_lon + x1 * res, top_lat - y1 * res],
                            [top_lon + x2 * res, top_lat - y1 * res],
                            [top_lon + x2 * res, top_lat - y2 * res],
                            [top_lon + x1 * res, top_lat - y2 * res],
                            [top_lon + x1 * res, top_lat - y1 * res],
                        ]]
                    }
                })

        out_path = os.path.join(BENCHMARK_ROOT, spec["filename"])
        create_geotiff(out_path, bands, spec["coords"][0], spec["coords"][1])

        manifest["scenes"].append({
            "scene_id": spec["id"],
            "track": "agriculture",
            "title": spec["name"],
            "file_path": out_path,
            "crs": "EPSG:4326",
            "dimensions": {"width": w, "height": h, "bands": 4},
            "top_left_origin": [top_lon, top_lat],
            "pixel_resolution_deg": res,
            "target_counts": spec["target_counts"],
            "ground_truth_polygons": polys_geo[:4],
            "spectral_expected": {"dominant_index": "NDVI", "mean_ndvi": spec["mean_ndvi"]},
            "sample_queries": [
                f"Assess vegetation health in {spec['name']}",
                "Calculate NDVI and highlight stressed agricultural parcels",
                "Segment crop field boundaries and compute greenness index"
            ]
        })

    # =========================================================================
    # TRACK 3: URBAN & STRATEGIC INFRASTRUCTURE (5 Scenes)
    # =========================================================================
    urban_specs = [
        {
            "id": "urban_01_delhi_airport_runway",
            "name": "IGI Airport Runway & Aircraft Apron",
            "filename": "urban/urban_01_delhi_airport_runway.tif",
            "coords": (77.085, 28.556),
            "size": (800, 800),
            "objects": {"plane": 6, "hangar": 2},
            "description": "Active international terminal apron with parked commercial jet aircraft."
        },
        {
            "id": "urban_02_mumbai_jnpt_port_ships",
            "name": "JNPT Port Container Ships & Berth",
            "filename": "urban/urban_02_mumbai_jnpt_port_ships.tif",
            "coords": (72.950, 18.950),
            "size": (800, 800),
            "objects": {"ship": 5, "container crane": 4},
            "description": "Deepwater container port with cargo freighters docked along quay berths."
        },
        {
            "id": "urban_03_refinery_storage_tanks",
            "name": "Jamnagar Refinery Petroleum Tank Farm",
            "filename": "urban/urban_03_refinery_storage_tanks.tif",
            "coords": (69.830, 22.350),
            "size": (800, 800),
            "objects": {"storage tank": 8, "pipeline corridor": 1},
            "description": "Industrial petrochemical complex featuring cylindrical fuel storage tanks."
        },
        {
            "id": "urban_04_dense_building_footprints",
            "name": "Bengaluru Electronic City Footprints",
            "filename": "urban/urban_04_dense_building_footprints.tif",
            "coords": (77.670, 12.840),
            "size": (800, 800),
            "objects": {"building": 12, "courtyard": 3},
            "description": "High-density tech park commercial complexes and structured building roofs."
        },
        {
            "id": "urban_05_highway_infra_expansion",
            "name": "Delhi-Mumbai Expressway Interchange",
            "filename": "urban/urban_05_highway_infra_expansion.tif",
            "coords": (76.850, 27.950),
            "size": (800, 800),
            "objects": {"bridge": 2, "overpass": 1, "toll plaza": 1},
            "description": "Major multi-lane expressway cloverleaf junction and corridor expansion."
        },
    ]

    for spec in urban_specs:
        h, w = spec["size"]
        bands = np.zeros((3, h, w), dtype=np.uint8) # RGB standard for CV detection

        # Gray asphalt/urban pavement baseline
        bands[0] = 110 # R
        bands[1] = 110 # G
        bands[2] = 115 # B

        top_lon, top_lat = spec["coords"]
        res = 0.0001
        gt_polys = []

        if "plane" in spec["objects"]:
            # Draw tarmac
            cv2.rectangle(bands[0], (100, 100), (w - 100, h - 100), 75, -1)
            cv2.rectangle(bands[1], (100, 100), (w - 100, h - 100), 75, -1)
            cv2.rectangle(bands[2], (100, 100), (w - 100, h - 100), 75, -1)
            
            # Draw 6 airplanes (fuselage + swept wings)
            plane_centers = [(200, 250), (350, 250), (500, 250), (200, 450), (350, 450), (500, 450)]
            for idx, (px, py) in enumerate(plane_centers):
                # Fuselage
                cv2.rectangle(bands[0], (px - 8, py - 35), (px + 8, py + 35), 240, -1)
                cv2.rectangle(bands[1], (px - 8, py - 35), (px + 8, py + 35), 240, -1)
                cv2.rectangle(bands[2], (px - 8, py - 35), (px + 8, py + 35), 240, -1)
                # Wings
                cv2.line(bands[0], (px - 30, py), (px + 30, py), 240, 6)
                cv2.line(bands[1], (px - 30, py), (px + 30, py), 240, 6)
                cv2.line(bands[2], (px - 30, py), (px + 30, py), 240, 6)

                gt_polys.append({
                    "type": "Feature",
                    "properties": {"target": "plane", "id": idx + 1},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [top_lon + (px - 30) * res, top_lat - (py - 35) * res],
                            [top_lon + (px + 30) * res, top_lat - (py - 35) * res],
                            [top_lon + (px + 30) * res, top_lat - (py + 35) * res],
                            [top_lon + (px - 30) * res, top_lat - (py + 35) * res],
                            [top_lon + (px - 30) * res, top_lat - (py - 35) * res],
                        ]]
                    }
                })

        elif "ship" in spec["objects"]:
            # Water background
            bands[0, :, :w//2] = 40
            bands[1, :, :w//2] = 80
            bands[2, :, :w//2] = 140
            # Dock/Quay
            cv2.rectangle(bands[0], (w//2, 0), (w, h), 160, -1)
            cv2.rectangle(bands[1], (w//2, 0), (w, h), 160, -1)
            cv2.rectangle(bands[2], (w//2, 0), (w, h), 160, -1)

            # Draw 5 ships
            ship_ys = [120, 240, 360, 480, 600]
            for idx, sy in enumerate(ship_ys):
                pts = np.array([[120, sy - 20], [300, sy - 20], [330, sy], [300, sy + 20], [120, sy + 20]], np.int32)
                for b in range(3):
                    cv2.fillPoly(bands[b], [pts], 210)
                gt_polys.append({
                    "type": "Feature",
                    "properties": {"target": "ship", "id": idx + 1},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [top_lon + 120 * res, top_lat - (sy - 20) * res],
                            [top_lon + 330 * res, top_lat - (sy - 20) * res],
                            [top_lon + 330 * res, top_lat - (sy + 20) * res],
                            [top_lon + 120 * res, top_lat - (sy + 20) * res],
                            [top_lon + 120 * res, top_lat - (sy - 20) * res],
                        ]]
                    }
                })

        elif "storage tank" in spec["objects"]:
            # Draw 8 storage tanks
            tanks = [
                (200, 200, 45), (380, 200, 45), (560, 200, 45), (200, 380, 45),
                (380, 380, 45), (560, 380, 45), (290, 560, 45), (470, 560, 45)
            ]
            for idx, (tx, ty, tr) in enumerate(tanks):
                # Shadow
                cv2.circle(bands[0], (tx + 5, ty + 5), tr, 50, -1)
                cv2.circle(bands[1], (tx + 5, ty + 5), tr, 50, -1)
                cv2.circle(bands[2], (tx + 5, ty + 5), tr, 50, -1)
                # Tank body
                cv2.circle(bands[0], (tx, ty), tr, 225, -1)
                cv2.circle(bands[1], (tx, ty), tr, 225, -1)
                cv2.circle(bands[2], (tx, ty), tr, 225, -1)
                # Tank rim
                cv2.circle(bands[0], (tx, ty), tr, 140, 3)
                cv2.circle(bands[1], (tx, ty), tr, 140, 3)
                cv2.circle(bands[2], (tx, ty), tr, 140, 3)

                gt_polys.append({
                    "type": "Feature",
                    "properties": {"target": "storage tank", "id": idx + 1, "radius_m": tr},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [top_lon + (tx - tr) * res, top_lat - (ty - tr) * res],
                            [top_lon + (tx + tr) * res, top_lat - (ty - tr) * res],
                            [top_lon + (tx + tr) * res, top_lat - (ty + tr) * res],
                            [top_lon + (tx - tr) * res, top_lat - (ty + tr) * res],
                            [top_lon + (tx - tr) * res, top_lat - (ty - tr) * res],
                        ]]
                    }
                })
        else:
            # Building footprints
            for idx, r in enumerate(range(3)):
                for c in range(4):
                    bx1, by1 = 80 + c * 160, 100 + r * 200
                    bx2, by2 = bx1 + 100, by1 + 130
                    for b in range(3):
                        cv2.rectangle(bands[b], (bx1, by1), (bx2, by2), 200, -1)
                    gt_polys.append({
                        "type": "Feature",
                        "properties": {"target": "building", "id": len(gt_polys) + 1},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [[
                                [top_lon + bx1 * res, top_lat - by1 * res],
                                [top_lon + bx2 * res, top_lat - by1 * res],
                                [top_lon + bx2 * res, top_lat - by2 * res],
                                [top_lon + bx1 * res, top_lat - by2 * res],
                                [top_lon + bx1 * res, top_lat - by1 * res],
                            ]]
                        }
                    })

        out_path = os.path.join(BENCHMARK_ROOT, spec["filename"])
        create_geotiff(out_path, bands, spec["coords"][0], spec["coords"][1])

        manifest["scenes"].append({
            "scene_id": spec["id"],
            "track": "urban",
            "title": spec["name"],
            "file_path": out_path,
            "crs": "EPSG:4326",
            "dimensions": {"width": w, "height": h, "bands": 3},
            "top_left_origin": [top_lon, top_lat],
            "pixel_resolution_deg": res,
            "target_counts": spec["objects"],
            "ground_truth_polygons": gt_polys,
            "sample_queries": [
                f"How many {list(spec['objects'].keys())[0]}s are located in {spec['name']}?",
                f"Detect and segment all {list(spec['objects'].keys())[0]}s",
                "Export GeoJSON bounding boxes for strategic assets"
            ]
        })

    # Write manifest
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[Day 1 Curation Complete] Successfully generated {len(manifest['scenes'])} benchmark scenes.")
    print(f"Master manifest written to: {MANIFEST_PATH}")
    return manifest


if __name__ == "__main__":
    generate_15_benchmarks()
