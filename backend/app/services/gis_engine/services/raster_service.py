from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np
import rasterio

from app.services.gis_engine.raster.ingestion import extract_metadata
from app.services.gis_engine.indices.calculator import calculate_ndvi, calculate_ndwi, calculate_ndbi
from app.services.gis_engine.raster.masking import threshold
from app.services.gis_engine.raster.visualization import create_index_overlay, save_overlay_metadata
from app.services.gis_engine.vector.polygonizer import polygonize_mask
from app.services.gis_engine.change_detection.detector import detect_change

class RasterGISService:
    """
    High-level orchestrator for the SatQuery GIS engine, designed for FastAPI integration.
    """
    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
    def get_metadata(self, file_path: str) -> Dict[str, Any]:
        """Returns structured metadata for a GeoTIFF."""
        return extract_metadata(file_path)
        
    def _read_bands(self, file_path: str, band1_idx: int, band2_idx: int):
        with rasterio.open(file_path) as src:
            b1 = src.read(band1_idx)
            b2 = src.read(band2_idx)
            return b1, b2, src.transform, src.crs
            
    def calculate_index(self, file_path: str, index_type: str, b1_idx: int, b2_idx: int):
        """
        Calculates a spectral index.
        E.g. index_type="NDVI", b1_idx=4(Red), b2_idx=8(NIR)
        Note: rasterio band indices are 1-based.
        """
        b1, b2, transform, crs = self._read_bands(file_path, b1_idx, b2_idx)
        
        if index_type.upper() == "NDVI":
            # b1=Red, b2=NIR
            result = calculate_ndvi(b1, b2)
        elif index_type.upper() == "NDWI":
            # b1=Green, b2=NIR
            result = calculate_ndwi(b1, b2)
        elif index_type.upper() == "NDBI":
            # b1=SWIR, b2=NIR
            result = calculate_ndbi(b1, b2)
        else:
            raise ValueError(f"Unknown index type: {index_type}")
            
        return result, transform, crs
        
    def process_and_polygonize(
        self, 
        file_path: str, 
        index_type: str, 
        b1_idx: int, 
        b2_idx: int,
        thresh_val: float,
        operator: str = ">",
        min_area_sqm: float = 100.0,
        output_geojson: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        End-to-end flow: Index -> Mask -> Polygonize.
        """
        index_arr, transform, crs = self.calculate_index(file_path, index_type, b1_idx, b2_idx)
        mask_arr = threshold(index_arr, thresh_val, operator)
        return polygonize_mask(mask_arr, transform, crs, min_area_sqm, output_geojson)
        
    def create_overlay(
        self,
        file_path: str,
        index_type: str,
        b1_idx: int,
        b2_idx: int,
        output_png: str,
        colormap: str = "viridis"
    ) -> Dict[str, Any]:
        """
        End-to-end flow: Index -> PNG Overlay.
        """
        index_arr, transform, crs = self.calculate_index(file_path, index_type, b1_idx, b2_idx)
        create_index_overlay(index_arr, output_png, colormap=colormap)
        
        meta = self.get_metadata(file_path)
        overlay_meta_path = str(output_png) + ".meta.json"
        save_overlay_metadata(overlay_meta_path, meta)
        
        return meta
        
    def perform_change_detection(
        self,
        pre_file: str,
        post_file: str,
        threshold_val: float = 0.1,
        operator: str = ">",
        output_geojson: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        End-to-end flow: Change Detection -> Polygonize.
        Note: Assumes inputs are already index rasters (1 band) for simplicity,
        or we could expand to compute indices on the fly.
        """
        delta, stats, pre_transform, pre_crs = detect_change(pre_file, post_file, threshold_val, operator)
        
        # We need a mask to polygonize
        valid_mask = ~np.isnan(delta)
        change_mask = threshold(delta, threshold_val, operator)
        
        geojson = polygonize_mask(change_mask, pre_transform, pre_crs, min_area_sqm=100.0, output_geojson=output_geojson)
        stats["geojson"] = geojson
        
        return stats
