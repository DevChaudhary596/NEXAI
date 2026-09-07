# SatQuery AI (SIH26167) — QA Evaluation Framework & Rubric Standards

**Author / Role:** Member 6 — QA Benchmarking & Pitch Lead  
**Milestone:** Week 1 Foundation Sprint (Day 1 Deliverable)  
**Problem Statement:** SIH26167 (ISRO) — *SatQuery AI: Vision-Language Assistant for Remote Sensing*

---

## 1. SIH Evaluation Criteria Alignment

The Smart India Hackathon (SIH) scoring is structured across four primary pillars. SatQuery AI's QA framework establishes empirical benchmarks to maximize scores in each category:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                          SIH26167 EVALUATION RUBRIC                           │
├──────────────────┬─────────────────┬───────────────────┬──────────────────────┤
│ 1. Novelty (25%) │ 2. Depth (25%)  │ 3. Impact (25%)   │ 4. Feasibility (25%) │
│   VLM + Tool     │ Multi-spectral  │ Disaster Response │ <4s End-to-End       │
│   Routing        │ SAHI + OBB      │ Kisan Agri-Health │ <4 GB RAM CPU        │
│   Zero-Cost CPU  │ Pixel-to-GeoJSON│ Strategic Infra   │ Offline / Edge Ready │
└──────────────────┴─────────────────┴───────────────────┴──────────────────────┘
```

### Pillar 1: Novelty & Differentiators (25%)
- **Natural Language Grounding:** Unlike black-box monolithic models, SatQuery AI decomposes natural language queries into deterministic CV and GIS operations. The VLM acts as an intent router rather than a numerical estimator, eliminating count hallucination.
- **Zero-GPU Footprint:** Full edge-operability on commodity CPU hardware using ONNX, MobileSAM, and SAHI patching.

### Pillar 2: Technical Depth (25%)
- **Multi-Sensor & Multi-Spectral Fusion:** Native support for 3-band RGB, 4-band Sentinel-2 (B4/B8/B3/B11 for NDVI/NDWI/NDBI), and georeferenced GeoTIFFs.
- **Oriented Bounding Box (OBB) + Patching:** Large satellite imagery ($4000 \times 4000$) sliced via SAHI into $640 \times 640$ tiles with NMS coordinate re-projection.
- **Pixel-to-Geographic Vectorization:** Real-world WGS84 (EPSG:4326) GeoJSON FeatureCollections generated via rasterio affine transforms.

### Pillar 3: Social & Strategic Impact (25%)
- **Disaster Management (NDRF / ISRO):** Rapid flood extent mapping, waterlogging detection, and coastal surge analysis.
- **Precision Agriculture:** Crop vigor assessment, drought stress zoning, and multi-temporal parcel health tracking.
- **National & Maritime Security:** Automated aircraft inventory at airports, maritime vessel surveillance at ports, and strategic petroleum/chemical storage monitoring.

### Pillar 4: Feasibility & Performance (25%)
- **Strict Latency Budget:** $< 4.0\text{ seconds}$ end-to-end response time on 8-core CPU.
- **Memory Ceiling:** $< 4.0\text{ GB RAM}$ peak consumption.
- **Contract Robustness:** 100% adherence to frozen Pydantic schemas (`CONTRACT_VERSION = "0.1.0"`).

---

## 2. Ground Truth Metric & Accuracy Thresholds

To provide objective pass/fail decisions during automated QA runs, the following acceptance tolerances are codified:

| Task Type | Core Metric | Target Acceptance Threshold | Failure Boundary |
| :--- | :--- | :--- | :--- |
| **Object Detection (OBB)** | Object Count Error | $\le \pm 10\%$ of Ground Truth | $> \pm 20\%$ Error |
| **Object Detection (OBB)** | Spatial IoU / Precision | $\text{mAP@50} \ge 0.70$ | $\text{mAP@50} < 0.50$ |
| **Zero-Shot Segmentation** | Boundary IoU | $\text{IoU} \ge 0.65$ | $\text{IoU} < 0.45$ |
| **Spectral Index Math** | Mean Index Variance | $|\Delta \text{NDVI}\| \le 0.05$ | $|\Delta \text{NDVI}\| > 0.10$ |
| **Affine Coordinate Map** | BBox Longitude/Latitude | Within scene spatial extent bounds | Coordinates out of extent |
| **System Latency** | End-to-End Query Time | $\le 4.0\text{s}$ per scene | $> 6.0\text{s}$ |
| **Memory Consumption** | Resident Set Size (RSS) | $\le 3.5\text{ GB}$ | $> 5.0\text{ GB}$ |

---

## 3. Benchmark Dataset Structure (15 Benchmark Scenes)

The benchmark repository is partitioned into 3 balanced tracks (5 scenes each) with paired GeoTIFFs, ground-truth object counts, and verified polygon boundaries:

```
data/benchmark_scenes/
├── disaster/
│   ├── disaster_01_kaziranga_flood.tif       (Flood extent & water expansion)
│   ├── disaster_02_assam_waterlogging.tif     (Urban waterlogging & submerged structures)
│   ├── disaster_03_coastal_surge.tif          (Coastal cyclone surge & shoreline breach)
│   ├── disaster_04_forest_burn_scar.tif       (Forest wildfire burn scar & canopy loss)
│   └── disaster_05_landslide_debris.tif       (Valley blockage & debris flow)
├── agriculture/
│   ├── agri_01_punjab_wheat_ndvi.tif          (High vs low vigor wheat plots)
│   ├── agri_02_maharashtra_drought_ndwi.tif   (Drought-stressed crop parcels)
│   ├── agri_03_karnataka_crop_parcels.tif     (Multi-field parcel boundary segmentation)
│   ├── agri_04_gangetic_paddy_vigor.tif       (Paddy chlorophyll & crop canopy index)
│   └── agri_05_deforestation_canopy.tif       (Forest canopy thinning & clear-cutting)
└── urban/
    ├── urban_01_delhi_airport_runway.tif      (Aircraft OBB detection & apron counting)
    ├── urban_02_mumbai_jnpt_port_ships.tif    (Oriented maritime vessels & docks)
    ├── urban_03_refinery_storage_tanks.tif    (Circular fuel storage tank farms)
    ├── urban_04_dense_building_footprints.tif (Urban residential & commercial footprints)
    └── urban_05_highway_infra_expansion.tif   (Highway corridor & linear infrastructure)
```

---

## 4. QA Sign-Off Protocol for Builds

Every code commit across all team members (M1 to M5) must pass the automated Day 1 validation suite:
1. **Contract Invariance:** Method signatures and Pydantic types match `CONTRACT_VERSION = "0.1.0"`.
2. **Deterministic Reproducibility:** Repeated runs on benchmark scenes must yield identical GeoJSON feature counts.
3. **No Unhandled Exceptions:** Any corrupted raster, malformed bounding box, or out-of-bounds coordinate must return an empty FeatureCollection or structured HTTP 422 error, never an unhandled 500 crash.
