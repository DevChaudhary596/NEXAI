# SATQUERY-AI

## Project Architecture & Structure

```
satquery-ai/
├── backend/                  <-- Member 5 (FastAPI, routing, server)
│   └── app/
│       ├── api/routes/
│       ├── core/schemas/     <-- Shared Pydantic contracts
│       └── services/
│           ├── vlm.py        <-- Member 1 injects code here
│           ├── cv.py         <-- Member 2 injects code here
│           └── gis.py        <-- Member 3 injects code here
├── frontend/                 <-- Member 4 (Next.js, UI, Mapbox/Leaflet)
├── qa_eval/                  <-- Member 6 (Streamlit test harness, benchmarks)
└── data/sample_scenes/       <-- Shared sample GeoTIFFs & ground truth
```

---

## Team Roles & Responsibilities

| Role | Member | Responsibilities / Focus Area |
| :--- | :--- | :--- |
| **Member 1** | VLM Specialist | Injects Vision-Language Model code in `backend/app/services/vlm.py` |
| **Member 2** | CV Specialist | Injects Computer Vision (YOLO/SAHI) code in `backend/app/services/cv.py` |
| **Member 3** | GIS Specialist | Injects GIS & spectral calculation code in `backend/app/services/gis.py` |
| **Member 4** | Frontend & Repo Maintainer | Next.js, UI, Mapbox/Leaflet (`frontend/`), Reviews & merges PRs |
| **Member 5** | Backend Lead | FastAPI, routing, server architecture (`backend/app/api/routes/`) |
| **Member 6** | QA & Evaluation | Streamlit test harness & benchmarks (`qa_eval/`) |

---

## Git Workflow & Contribution Guidelines

### 1. Branch Rules
- **No direct commits to `main` or `dev`**.
- All development must happen on designated feature branches.

### 2. Branch Naming Conventions
- `feat/m1-vlm-router` (Member 1)
- `feat/m2-yolo-sahi` (Member 2)
- `feat/m3-spectral-calc` (Member 3)
- `feat/m4-roi-draw` (Member 4)
- `feat/m5-upload-api` (Member 5)
- `feat/m6-qa-harness` (Member 6)

### 3. Merge Gate
- **Only Member 4 (Repo Maintainer)** reviews and merges pull requests into the `dev` branch at the end of each working day.
