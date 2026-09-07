# SatQuery AI (SIH26167) — 50-Query Prompt Test Matrix

**Author / Role:** Member 6 (QA Benchmarking & Pitch Deck Lead)  
**Milestone:** Week 1 Foundation Sprint (Day 2 Deliverable)  
**Machine-Readable Source:** [`qa_eval/test_matrix_50.json`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/test_matrix_50.json)

---

## 1. Executive Matrix Summary

The **50-Query Prompt Test Matrix** establishes an empirical, standardized benchmark battery to stress-test and validate all modules developed by the team (M1 Router, M2 CV, M3 GIS, M5 API).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 50-QUERY BENCHMARK DISTRIBUTION OVERVIEW                    │
├───────────────────────┬───────────────────────┬─────────────────────────────┤
│ By Intent Category    │ By Complexity Tier    │ By Benchmark Track          │
│ • Counting: 9 queries │ • Simple:   20 (40%)  │ • Urban Infra:   18 (36%)   │
│ • Detection: 6 queries│ • Moderate: 18 (36%)  │ • Disaster Mgmt: 16 (32%)   │
│ • Segmentation: 12 q  │ • Complex:  12 (24%)  │ • Agriculture:   16 (32%)   │
│ • Spectral: 12 queries│                       │                             │
│ • Change Detect: 5 q  │                       │                             │
│ • Edge Cases: 6 q     │                       │                             │
└───────────────────────┴───────────────────────┴─────────────────────────────┘
```

---

## 2. Track A: Object Counting & Detection (Queries 01–15)
*Targeting Member 2's YOLOv8n-OBB, SAHI Slicer, and Member 1's Intent Router.*

| ID | Natural Language Prompt | Complexity | Target Benchmark Scene | Expected Router | Expected Output Bounds | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q-001** | *"How many airplanes are parked on the apron at Delhi Airport?"* | Simple | `urban_01_delhi_airport_runway.tif` | `detection` | Count: $6 \pm 1$ | Count Error $\le \pm 10\%$, $\text{mAP@50} \ge 0.70$ |
| **Q-002** | *"Detect all aircraft parked along the terminal runway."* | Simple | `urban_01_delhi_airport_runway.tif` | `detection` | Count: $6 \pm 1$ | OBB polygons with valid WGS84 CRS |
| **Q-003** | *"Count the number of cargo ships docked at JNPT port berths."* | Simple | `urban_02_mumbai_jnpt_port_ships.tif` | `detection` | Count: $5 \pm 1$ | Count Error $\le \pm 1$, Precision $\ge 0.80$ |
| **Q-004** | *"Identify and locate all maritime vessels in the harbor."* | Moderate | `urban_02_mumbai_jnpt_port_ships.tif` | `detection` | Count: $5 \pm 1$ | Bounding boxes strictly within water extent |
| **Q-005** | *"How many petroleum storage tanks are in this Jamnagar refinery facility?"* | Simple | `urban_03_refinery_storage_tanks.tif` | `detection` | Count: $8 \pm 1$ | Count Error $\le \pm 1$, $\text{mAP@50} \ge 0.75$ |
| **Q-006** | *"Detect circular oil storage tanks in the industrial sector."* | Simple | `urban_03_refinery_storage_tanks.tif` | `detection` | Count: $8 \pm 1$ | Circular / tight OBB geometries returned |
| **Q-007** | *"Count all commercial building rooftops in Electronic City."* | Moderate | `urban_04_dense_building_footprints.tif` | `detection` | Count: $12 \pm 2$ | Count Error $\le \pm 2$ (dense urban) |
| **Q-008** | *"Detect building footprints across the commercial park."* | Moderate | `urban_04_dense_building_footprints.tif` | `detection` | Count: $12 \pm 2$ | Valid polygon ring coordinates |
| **Q-009** | *"Locate major bridge structures and flyovers on the highway corridor."* | Moderate | `urban_05_highway_infra_expansion.tif` | `detection` | Count: $2 \pm 1$ | Structures located along transport line |
| **Q-010** | *"Count airplanes in the southern quadrant of the airport."* | Complex | `urban_01_delhi_airport_runway.tif` | `detection` | Count: $3 \pm 1$ | Spatial ROI filtering applied strictly |
| **Q-011** | *"Count storage tanks with confidence threshold higher than 0.6."* | Moderate | `urban_03_refinery_storage_tanks.tif` | `detection` | Count: 7–8 | All returned features have $\text{conf} \ge 0.60$ |
| **Q-012** | *"Detect large container freighters exceeding 150m length."* | Complex | `urban_02_mumbai_jnpt_port_ships.tif` | `detection` | Count: 4–5 | Pixel-to-meter geometry dimension filter |
| **Q-013** | *"Are there any airplanes parked near the main runway?"* | Simple | `urban_01_delhi_airport_runway.tif` | `vqa` | Yes, 6 aircraft | Affirmative text grounded in tool count |
| **Q-014** | *"Count ships anchored in the western offshore channel."* | Complex | `urban_02_mumbai_jnpt_port_ships.tif` | `detection` | Count: 4–5 | Zero false detections on dry-dock pixels |
| **Q-015** | *"Locate aircraft and report their orientation angles."* | Complex | `urban_01_delhi_airport_runway.tif` | `detection` | Count: $6 \pm 1$ | OBB polygon vertex coordinates returned |

---

## 3. Track B: Flood & Water Segmentation (Queries 16–27)
*Targeting Member 3's NDWI Engine, Member 2's MobileSAM, and Member 5's Tile Server.*

| ID | Natural Language Prompt | Complexity | Target Benchmark Scene | Expected Router | Expected Output Bounds | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q-016** | *"Show flooded areas in Kaziranga National Park."* | Simple | `disaster_01_kaziranga_flood.tif` | `segmentation` | Coverage: $42.5\% \pm 5\%$ | $\text{IoU} \ge 0.65$ against flood mask |
| **Q-017** | *"Segment water bodies and river overflow zones."* | Simple | `disaster_01_kaziranga_flood.tif` | `segmentation` | Coverage: $42.5\% \pm 5\%$ | Closed polygon boundary without gaps |
| **Q-018** | *"Calculate NDWI and map inundated flood zones."* | Moderate | `disaster_01_kaziranga_flood.tif` | `spectral` | Area: $0.30 - 0.45\text{ km}^2$ | $\|\Delta\text{NDWI}\| \le 0.05$, transparent PNG |
| **Q-019** | *"Highlight submerged structures and waterlogged rural roads."* | Moderate | `disaster_02_assam_waterlogging.tif` | `segmentation` | Coverage: $31.0\% \pm 4\%$ | Waterlogged road vectors generated |
| **Q-020** | *"What percentage of the rural settlement area is waterlogged?"* | Moderate | `disaster_02_assam_waterlogging.tif` | `spectral` | Ratio: $28.0\% - 35.0\%$ | Numeric percent grounded in NDWI |
| **Q-021** | *"Segment coastal storm surge inundation along the Odisha shore."* | Simple | `disaster_03_coastal_surge.tif` | `segmentation` | Coverage: $55.0\% \pm 5\%$ | $\text{IoU} \ge 0.70$ on shoreline breach |
| **Q-022** | *"Calculate NDWI where index > 0.1 to delineate seawater breach."* | Moderate | `disaster_03_coastal_surge.tif` | `spectral` | Mean NDWI: $0.25 - 0.45$ | Strict thresholding with zero NaN |
| **Q-023** | *"Segment wildfire burn scar perimeter in Simlipal forest."* | Moderate | `disaster_04_forest_burn_scar.tif` | `segmentation` | Coverage: $20.0\% - 30.0\%$ | Burn scar core completely enclosed |
| **Q-024** | *"Compute NBR / vegetation loss over the forest fire zone."* | Moderate | `disaster_04_forest_burn_scar.tif` | `spectral` | $\Delta\text{NIR} \approx -0.40$ | Drop in canopy reflectance detected |
| **Q-025** | *"Detect hillside landslide scar and debris runout track."* | Moderate | `disaster_05_landslide_debris.tif` | `segmentation` | Coverage: $14.0\% - 22.0\%$ | Linear debris runout polygon mapped |
| **Q-026** | *"Calculate total flooded surface area in square kilometers."* | Complex | `disaster_01_kaziranga_flood.tif` | `spectral` | Area: $0.30 - 0.42\text{ km}^2$ | Area computed using pixel scale |
| **Q-027** | *"Segment water bodies with confidence greater than 0.85."* | Complex | `disaster_03_coastal_surge.tif` | `segmentation` | Coverage: $45.0\% - 55.0\%$ | Confidence scores tagged on features |

---

## 4. Track C: Agriculture & Crop Health (Queries 28–39)
*Targeting Member 3's Vectorized NDVI Engine and Polygonizer.*

| ID | Natural Language Prompt | Complexity | Target Benchmark Scene | Expected Router | Expected Output Bounds | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q-028** | *"What is the overall vegetation health in Punjab wheat farmland?"* | Simple | `agri_01_punjab_wheat_ndvi.tif` | `spectral` | Mean NDVI: $0.68 \pm 0.05$ | Classified as 'Healthy / High Vigor' |
| **Q-029** | *"Calculate NDVI and export false-color vegetation overlay."* | Simple | `agri_01_punjab_wheat_ndvi.tif` | `spectral` | Range: $0.20 - 0.88$ | RGBA PNG overlay with colormap |
| **Q-030** | *"Highlight stressed agricultural parcels where NDVI is below 0.4."* | Moderate | `agri_01_punjab_wheat_ndvi.tif` | `spectral` | Stressed: $2 \pm 1$ plots | Threshold isolates low-vigor parcels |
| **Q-031** | *"Assess drought impact and soil moisture stress in Marathwada."* | Simple | `agri_02_maharashtra_drought_ndwi.tif` | `spectral` | Mean NDVI: $0.22 \pm 0.04$ | Classified as 'Severe Drought Stressed' |
| **Q-032** | *"Segment crop parcel boundaries across Karnataka farmlands."* | Moderate | `agri_03_karnataka_crop_parcels.tif` | `segmentation` | Parcel Count: $9 \pm 1$ | Valid GeoJSON without intersections |
| **Q-033** | *"Calculate area in hectares for every segmented crop parcel."* | Complex | `agri_03_karnataka_crop_parcels.tif` | `segmentation` | Mean Area: $0.50 - 0.80\text{ ha}$ | `area_hectares` property in GeoJSON |
| **Q-034** | *"Measure paddy chlorophyll greenness in Gangetic plains."* | Simple | `agri_04_gangetic_paddy_vigor.tif` | `spectral` | Mean NDVI: $0.74 \pm 0.04$ | High chlorophyll response verified |
| **Q-035** | *"Segment clear-cut patches in Western Ghats forest canopy."* | Moderate | `agri_05_deforestation_canopy.tif` | `segmentation` | Patch Count: $3 \pm 1$ | Canopy clearing polygon contours |
| **Q-036** | *"How much forest canopy has been lost in cleared parcels?"* | Complex | `agri_05_deforestation_canopy.tif` | `spectral` | Loss: $24.0\% - 32.0\%$ | Grounded percentage reported |
| **Q-037** | *"Show agricultural fields with NDVI above 0.5 in green."* | Moderate | `agri_01_punjab_wheat_ndvi.tif` | `spectral` | Coverage: $60.0\% - 75.0\%$ | Colormapped high-vigor mask |
| **Q-038** | *"What is the average NDVI of paddy parcels?"* | Simple | `agri_04_gangetic_paddy_vigor.tif` | `spectral` | Mean NDVI: $0.74 \pm 0.04$ | Accurate scalar returned |
| **Q-039** | *"Find parcels experiencing severe water stress where NDWI is negative."* | Moderate | `agri_02_maharashtra_drought_ndwi.tif` | `spectral` | Stressed: $7 \pm 1$ parcels | Negative NDWI polygonized |

---

## 5. Track D: Bi-Temporal Change & Robustness Edge Cases (Queries 40–50)
*Targeting Member 3's Change Detection, Member 1's VLM Fallbacks, and System Error Resilience.*

| ID | Natural Language Prompt | Complexity | Target Benchmark Scene | Expected Router | Expected Output Bounds | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Q-040** | *"Detect flood extent change comparing pre-monsoon and post-monsoon imagery."* | Complex | `disaster_01_kaziranga_flood.tif` | `segmentation` | Delta: $+30\% \text{ to } +40\%$ | Difference mask shows newly flooded |
| **Q-041** | *"What changed in vegetation vigor between initial planting and harvest?"* | Complex | `agri_01_punjab_wheat_ndvi.tif` | `spectral` | $\Delta\text{NDVI} \approx +0.45$ | Differencing array computed cleanly |
| **Q-042** | *"Highlight newly constructed highway lanes and corridor clearing."* | Complex | `urban_05_highway_infra_expansion.tif` | `detection` | Changed: $2 \pm 1$ areas | Sprawl delta polygon generated |
| **Q-043** | *"Compare pre and post flood scenes and report total area inundated."* | Complex | `disaster_02_assam_waterlogging.tif` | `segmentation` | Delta: $0.20 - 0.30\text{ km}^2$ | Metric difference stated in response |
| **Q-044** | *"Measure canopy loss delta over the last 12 months."* | Complex | `agri_05_deforestation_canopy.tif` | `spectral` | Loss: $10.0 - 15.0\text{ ha}$ | Deforested hectares polygonized |
| **Q-045** | *"Count airplanes in scene under simulated 30% cloud cover."* | Complex | `urban_01_delhi_airport_runway.tif` | `detection` | Count: 4–6 | Graceful recall drop ($\ge 65\%$ detected) |
| **Q-046** | *"Show storage tanks in invalid bounding box [1000, 1000, 200, 200]."* | Moderate | `urban_03_refinery_storage_tanks.tif` | `detection` | Empty Collection | Clean return without 500 error |
| **Q-047** | *"What do you see in this general satellite view?"* | Simple | `urban_01_delhi_airport_runway.tif` | `vqa` | VQA Fallback | Graceful fallback to VLM scene description |
| **Q-048** | *"Detect submarines on the airport runway tarmac."* | Simple | `urban_01_delhi_airport_runway.tif` | `detection` | Count: 0 | Zero false positives returned |
| **Q-049** | *"Calculate NDVI on scene with missing NIR band."* | Complex | `urban_04_dense_building_footprints.tif` | `spectral` | Handled Gracefully | Structured HTTP error or visual fallback |
| **Q-050** | *"How many tanks and ships are located in this scene?"* | Complex | `urban_03_refinery_storage_tanks.tif` | `detection` | Tanks: 8, Ships: 0 | 8 tanks detected, 0 ships, no hallucination |

---

## 6. Integration with Day 3 Test Harness
This matrix directly feeds into Day 3's automated test harness (`qa_eval/test_harness.py`), which will:
1. Iterate sequentially through all 50 queries.
2. Dispatch each prompt to Member 5's FastAPI query endpoint `/api/v1/query`.
3. Capture latency (ms), memory RSS (MB), and response status.
4. Compare output against the numerical bounds above and compute the automated **Pass / Fail Scorecard**.
