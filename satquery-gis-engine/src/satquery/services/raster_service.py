from pathlib import Path
from typing import Dict, Any, Optional
import rasterio

from satquery.raster.ingestion import extract_metadata
from satquery.indices.calculator import calculate_ndvi, calculate_ndwi, calculate_ndbi
from satquery.raster.masking import threshold
from satquery.raster.visualization import create_index_overlay, save_overlay_metadata
from satquery.vector.polygonizer import polygonize_mask
from satquery.change_detection.detector import detect_change

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
        
    def _read_bands(
        self, file_path: str, band1_idx: int, band2_idx: int, bbox: Optional[Any] = None
    ):
        with rasterio.open(file_path) as src:
            if bbox is not None:
                from rasterio.windows import from_bounds, transform as window_transform
                from rasterio.warp import transform_bounds
                
                # Normalize bbox coords [west, south, east, north]
                if hasattr(bbox, "west"):
                    w, s, e, n = bbox.west, bbox.south, bbox.east, bbox.north
                elif hasattr(bbox, "xmin"):
                    w, s, e, n = bbox.xmin, bbox.ymin, bbox.xmax, bbox.ymax
                elif isinstance(bbox, (list, tuple)) and len(bbox) == 4:
                    w, s, e, n = bbox[0], bbox[1], bbox[2], bbox[3]
                elif isinstance(bbox, dict):
                    w = bbox.get("west", bbox.get("xmin", 0))
                    s = bbox.get("south", bbox.get("ymin", 0))
                    e = bbox.get("east", bbox.get("xmax", 0))
                    n = bbox.get("north", bbox.get("ymax", 0))
                else:
                    w, s, e, n = None, None, None, None

                if w is not None:
                    # Reproject if dataset has projected CRS
                    if src.crs and not src.crs.is_geographic:
                        try:
                            left, bottom, right, top = transform_bounds("EPSG:4326", src.crs, w, s, e, n)
                        except Exception:
                            left, bottom, right, top = w, s, e, n
                    else:
                        left, bottom, right, top = w, s, e, n

                    window = from_bounds(left, bottom, right, top, transform=src.transform)
                    full_window = rasterio.windows.Window(0, 0, src.width, src.height)
                    window = window.intersection(full_window)
                    
                    if window.width > 0 and window.height > 0:
                        b1 = src.read(band1_idx, window=window)
                        b2 = src.read(band2_idx, window=window)
                        win_trans = window_transform(window, src.transform)
                        return b1, b2, win_trans, src.crs

            b1 = src.read(band1_idx)
            b2 = src.read(band2_idx)
            return b1, b2, src.transform, src.crs
            
    def calculate_index(
        self, file_path: str, index_type: str, b1_idx: int, b2_idx: int, bbox: Optional[Any] = None
    ):
        """
        Calculates a spectral index.
        E.g. index_type="NDVI", b1_idx=4(Red), b2_idx=8(NIR)
        Note: rasterio band indices are 1-based.
        """
        b1, b2, transform, crs = self._read_bands(file_path, b1_idx, b2_idx, bbox=bbox)
        
        if index_type.upper() == "NDVI":
            result = calculate_ndvi(b1, b2)
        elif index_type.upper() == "NDWI":
            result = calculate_ndwi(b1, b2)
        elif index_type.upper() == "NDBI":
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
        output_geojson: Optional[str] = None,
        bbox: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        End-to-end flow: Index -> Mask -> Polygonize.
        """
        index_arr, transform, crs = self.calculate_index(file_path, index_type, b1_idx, b2_idx, bbox=bbox)
        mask_arr = threshold(index_arr, thresh_val, operator)
        return polygonize_mask(mask_arr, transform, crs, min_area_sqm, output_geojson)
        
    def create_overlay(
        self,
        file_path: str,
        index_type: str,
        b1_idx: int,
        b2_idx: int,
        output_png: str,
        colormap: str = "viridis",
        bbox: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        End-to-end flow: Index -> PNG Overlay.
        """
        index_arr, transform, crs = self.calculate_index(file_path, index_type, b1_idx, b2_idx, bbox=bbox)
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
