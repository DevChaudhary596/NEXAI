# SatQuery AI — Agent & Team Progress Audit Till Date
**Last Updated**: September 2026  
**Project**: SatQuery AI (SIH 2024 / Geospatial Intelligence & Natural Language Satellite Analysis)  
**Repository**: `DevChaudhary596/satquery-ai` (upstream `NEXAI`)

---

## 1. Executive Summary & Architecture Overview

SatQuery AI enables natural language querying over multi-spectral satellite imagery (Sentinel-2, Landsat, GeoTIFFs) combined with high-resolution aerial object detection (YOLOv8-OBB with SAHI tiling).

### Hardware & Resource Allocation Rules
* **Member 1 (VLM Lead & System Architect)**: **Sole GPU Owner** (Kaggle dual-T4 cloud for fine-tuning/quantization + local RTX 4060 8GB runtime). Target: $< 5\text{ GB}$ VRAM, $< 4\text{s}$ latency.
* **Members 2 through 6**: **100% CPU / Standard RAM / Browser runtime** (Zero GPU dependency).
* **Member 4**: Frontend & GitHub Repository Maintainer / Gatekeeper.

---

## 2. Comprehensive Member-by-Member Status (Week 1 & Week 2)

| Member | Domain & Role | Week 1 Status | Week 2 Status (Days 8–14) | Current Repository Status |
| :--- | :--- | :--- | :--- | :--- |
| **Member 1** | System Architect & VLM Lead | **Complete** (Base VLM service, Intent router, Orchestrator pipeline) | **Implemented on personal fork** (Multi-turn memory, JSON metric schema, 3 demo prompts, Whisper voice input, latency tuning, guardrails) | ⚠️ **PENDING PR**: Work is on M1's fork/repo (`NEXAI`); has **not** yet been PR'd or merged into `satquery-ai`. |
| **Member 2** | Geospatial CV Engineer | **Complete** (YOLOv8n-OBB, SAHI sliding slicer, geo-affine conversion, Sentinel-2 physics gate) | **Complete & Verified (Days 8–14)** (SAHI boundary artifact smoothing, calibrated confidence thresholds, spatial quadrant pruning, DBSCAN hotspot clustering, 3 golden demo caches, rule-based pruning, benchmark test suite) | ✅ **COMPLETE & 100% TESTED**: Accidental `week 2/` propulsion simulator deleted. Full 19/19 CV tests passing. |
| **Member 3** | Raster & GIS Data Engineer | **Complete** (Deterministic NumPy/Rasterio GIS engine: NDVI, NDWI, SCL cloud masking, water/vegetation thresholding, bi-temporal differential change, GeoJSON polygonizer) | **In Progress / Validated** (Pure math validation, test suite 100% passing, composite generator & Douglas-Peucker simplification ready) | ✅ **MERGED & VERIFIED**: `satquery-gis-engine/` fully operational with zero ML hallucination. |
| **Member 4** | Frontend & Map UI Engineer | **Complete** (Next.js 16, TypeScript, Leaflet map with ROI drawer, Scene uploader, dynamic GeoJSON overlays, Chat sidebar) | **Merged (PR #9)** (Layer opacity controls, bi-temporal swipe tool, AOI watches & alerts, live Sentinel-2 panel, Cesium 3D view) | ✅ **MERGED & VERIFIED**: Frontend interactive UI fully synchronized on `main`. |
| **Member 5** | Backend API & Data Pipeline | **Complete** (FastAPI backend, `/api/v1/query`, `/api/v1/upload`, `/api/v1/tiles`, task queue, storage adapter) | **Merged (PR #9 & goru-gis-wiring)** (GIS engine adapter wiring, schema validations, AOI watches endpoints, tile server) | ✅ **MERGED & VERIFIED**: API architecture in place; session cache and export endpoints pending M1/M3 handoff. |
| **Member 6** | QA, Evaluation & Pitch Lead | **Complete** (Streamlit harness, E2E ROI pipeline integration tests, latency profiling, ground-truth verification) | **Active** (Master task sheet, comprehensive README hub, router confidence discrimination, 119/119 tests passing prior to schema update) | ✅ **ACTIVE**: Ready to benchmark M1's latency and M3's demo scenes once merged. |

---

## 3. Deep Dive: Audit of Member 1 (VLM Lead)

### Claimed Deliverables:
- **Day 8**: Multi-turn conversational memory (follow-ups work without re-sending the image crop).
- **Day 9 & 12**: Structured schema outputs (`area_impacted_km2`, `object_density`, `risk_level`) + 3 flagship demo system prompts (Flood, Agriculture, Port Surveillance).
- **Day 10**: Voice query pipeline (mic button integration, Whisper transcription handoff).
- **Day 11**: `max_new_tokens` tuned down for $< 4\text{s}$ latency target + latency profiling script.
- **Day 13**: Graceful fallbacks when a GeoTIFF lacks requisite bands instead of erroring out.
- **Day 14**: VRAM audit script for the $< 5\text{ GB}$ ceiling.

### Repository Audit Findings:
* **Current State in `DevChaudhary596/satquery-ai`**: **NOT PRESENT**.
* Searching `backend/app/services/vlm.py`, `backend/app/services/orchestrator.py`, and `frontend/` reveals no voice handling, no conversation session memory, and `max_new_tokens` remains at the Week 1 default of 384.
* **Explanation**: Member 1 confirmed: *"Pushed + merged on my repo, will move it into NEXAI/PR it there next."*
* **Conclusion**: Member 1's code is completed on their independent fork, but the repository is currently waiting for Member 1 to submit a Pull Request to merge these changes into `satquery-ai/main`.

---

## 4. Deep Dive: Audit & Resolution of Member 2 (Geospatial CV Engineer)

### Incident & Resolution:
1. **The Issue**: PR #10 previously merged an accidental sci-fi "Anti-Gravity Propulsion Engine" simulator inside `week 2/`.
2. **Resolution Applied**:
   * Removed the accidental `week 2/` directory from the repository.
   * Built the complete, real Geospatial Computer Vision suite in `backend/app/services/cv_engine/` across Days 8 to 14:
     * **Day 8**: Cross-Tile SAHI Boundary Artifact Smoothing (`sahi_slicer.py`): OBB containment and boundary edge merging for split slice artifacts.
     * **Day 9**: Multi-Class Calibrated Confidence Thresholds (`detector.py`): Optimal class sensitivities (`ship: 0.35`, `plane: 0.40`, `large vehicle: 0.45`, `harbor: 0.25`).
     * **Day 10**: Spatial Filtering & Positional Query Pruning (`geo.py`): Quadrant partitioning (`north`, `south`, `east`, `west`, etc.).
     * **Day 11**: CPU DBSCAN Spatial Density Hotspot Analysis (`spatial_cluster.py`): Automatic cluster ID assignment and hotspot tagging.
     * **Day 12**: Pre-computed Offline Demo Detection Caches (`data/demo_scenes/detections/`): Created valid GeoJSON caches for Kerala Flood, Punjab Agriculture, and Visakhapatnam Port.
     * **Day 13**: Rule-Based False-Positive Pruning (`detector.py`): Vessel aspect-ratio bounds ($1.8 \le \text{ratio} \le 16.0$), pixel area limits ($> 25\text{ px}^2$), and cloud mask rejection.
     * **Day 14**: Frozen Public API (`cv_engine/__init__.py`) and CPU Benchmark Suite (`tests/test_m2_week2.py`).
3. **Verification**: Full 19/19 tests passing across `tests/test_m2_week2.py`, `tests/test_real_cv.py`, and `tests/test_cv_contract.py`.

---

## 5. Immediate Action Plan & Next Steps

1. **Member 1 (VLM Lead)**:
   * Open PR from personal fork (`NEXAI` / M1 branch) into `DevChaudhary596/satquery-ai:main`.
   * Ensure `backend/app/services/vlm.py`, `orchestrator.py`, and voice ingestion endpoints are included.
2. **Member 2 (CV Engineer)**:
   * Revert or discard the sci-fi `week 2/` propulsion simulation directory.
   * Execute the real Week 2 Geospatial CV tasks starting with Day 8 (SAHI tile smoothing) and Day 9 (Multi-class threshold tuning) in `backend/app/services/cv_engine/`.
3. **Member 4 (Frontend / Repo Maintainer)**:
   * Clean up PR #10 artifacts on `main`.
   * Review and merge Member 1's upcoming VLM PR.
   * Connect Member 1's voice transcription endpoint to the frontend mic button.
4. **Member 5 (Backend API)**:
   * Ensure backend dependencies are clean (e.g. resolve `email-validator` requirement in Pydantic schema for watches).
   * Provide the in-memory session cache endpoint for Member 1's multi-turn dialogue.
5. **Member 6 (QA & Benchmarking)**:
   * Run latency profiling on Member 1's model once merged.
   * Validate accuracy and coordinate alignment across the 3 demo scenes.
