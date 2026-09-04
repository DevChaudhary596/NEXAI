# SatQuery AI - GIS/Raster Processing Engine

This repository contains the complete CPU-based Raster & GIS processing backend for the "SatQuery AI" SIH 2026 project. It handles raster ingestion, indices calculation (NDVI, NDWI, NDBI), thresholding, vector polygonization, and bi-temporal change detection.

## Architecture

The project is structured as a standard Python package with a high-level service class (`RasterGISService`) designed for easy integration with a FastAPI orchestrator.

### Features
1. **Raster Ingestion**: Extracts metadata (CRS, bounds, transform, resolution) from multispectral GeoTIFFs.
2. **Indices Calculation**: Fast, vectorized NumPy computation of NDVI, NDWI, and NDBI handling NoData and divide-by-zero safely.
3. **Thresholding & Visualization**: Masking of index rasters and conversion to lightweight, colored PNG overlays.
4. **Polygonization**: Converts raster masks into GeoJSON FeatureCollections, computing area in m², hectares, and sq km.
5. **Change Detection**: Bi-temporal analysis aligning two rasters (PRE and POST) spatially and projecting delta differences.

## Environment Setup

### Requirements
- Python >= 3.9
- System libraries: GDAL must be available (typically installed via Homebrew on Mac `brew install gdal`, or bundled via `rasterio` wheels).

### Installation

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Alternatively, to install as a package:
pip install .
```

### Verification
Run the verification script to ensure dependencies are loaded:
```bash
python scripts/verify_environment.py
```

## Input GeoTIFF Requirements

The engine expects multi-spectral GeoTIFF files. For spatial area calculations to be fully accurate without dynamic local projection estimation, the GeoTIFF should ideally be in a projected CRS (e.g., UTM EPSG:32643) rather than geographic (EPSG:4326), although both are supported.

### Sentinel-2 Band Mapping
Standard Sentinel-2 Level-2A bands:
- **B02**: Blue (10m)
- **B03**: Green (10m)
- **B04**: Red (10m)
- **B08**: NIR (10m)
- **B11**: SWIR (20m) - *Note: The engine supports ingestion of rasters with differing band resolutions by aligning/resampling via rasterio if processing disparate files.*

### Landsat 8/9 Band Mapping
- **B2**: Blue (30m)
- **B3**: Green (30m)
- **B4**: Red (30m)
- **B5**: NIR (30m)
- **B6**: SWIR 1 (30m)

## Radiometric Indices

- **NDVI (Normalized Difference Vegetation Index)**: `(NIR - RED) / (NIR + RED)`. Used for detecting healthy vegetation.
- **NDWI (Normalized Difference Water Index)**: `(GREEN - NIR) / (GREEN + NIR)`. McFeeters formulation for surface water detection.
- **NDBI (Normalized Difference Built-up Index)**: `(SWIR - NIR) / (SWIR + NIR)`. Used for highlighting urban/built-up areas.

## Thresholding, Polygonization, and Area
Masks are generated via simple boolean comparison operators (e.g. NDWI > 0.0 for water).
The polygonizer creates valid GeoJSON objects, estimating a local UTM zone if the source data is geographic to accurately calculate area.

## Change Detection
The `detect_change(pre, post, threshold)` function dynamically aligns the `POST` raster to the `PRE` raster's CRS and transform if they differ, computes the delta, and generates a change mask.

## Testing
Run tests using:
```bash
pytest
```
Synthetic memory-based GeoTIFFs are created at runtime by `conftest.py`, ensuring tests execute rapidly without requiring large external datasets.

## FastAPI Integration Instructions

The `RasterGISService` class in `src/satquery/services/raster_service.py` is the main entry point for the FastAPI orchestrator.

```python
from satquery.services.raster_service import RasterGISService

service = RasterGISService()

# 1. Get Metadata
metadata = service.get_metadata("path/to/sentinel.tif")

# 2. Polygonize an Index (e.g., NDWI > 0.0)
# Assuming Band 2 is Green, Band 4 is NIR in your stacked TIFF
geojson = service.process_and_polygonize(
    "path/to/sentinel.tif", 
    index_type="NDWI", 
    b1_idx=2, 
    b2_idx=4, 
    thresh_val=0.0
)

# 3. Create PNG Overlay
meta = service.create_overlay(
    "path/to/sentinel.tif", 
    "NDWI", 2, 4, 
    "outputs/overlays/water.png", 
    colormap="water"
)
```

### Known Limitations
- High memory usage: The engine currently reads entire bands into memory. For extremely large scenes, windowed reading (via `rasterio.windows`) should be implemented.
- Hardcoded basic color maps: The visualization module currently uses hardcoded RGB approximations for color palettes. Advanced mapping may require matplotlib.
