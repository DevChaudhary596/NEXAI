# SatQuery AI — Frontend

**Assigned to**: Member 4 (Next.js, Leaflet, UI/UX)

Interactive Vision-Language Assistant interface for multimodal remote sensing image analysis through natural language queries.

## Features
- **Satellite Basemap**: Leaflet map with ESRI World Imagery & boundaries
- **Multi-panel layout**: Responsive 2-column layout (Satellite Map + Chat Sidebar)
- **Scene Ingestion**: Drag-and-drop GeoTIFF upload connected to backend `/api/v1/upload`
- **ROI Drawing**: Interactive bounding box selection with coordinate auto-population
- **Dynamic GeoJSON Rendering**: Detections, segmentations, and spectral index polygons with confidence scores & popups
- **Layer Controls**: Opacity sliders and visibility toggles per detection category
- **Raster Overlays & Swipe Tool**: Georeferenced RGBA overlays with split-screen before/after comparison slider
- **FastAPI Integration**: Connects to backend `/api/v1/query`, `/api/v1/tiles`, `/healthz`

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Run Locally
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
