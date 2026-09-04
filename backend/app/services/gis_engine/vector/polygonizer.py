import rasterio
from rasterio.features import shapes
import geopandas as gpd
from shapely.geometry import shape, Polygon
import numpy as np
from pathlib import Path
from typing import Dict, Any, Optional

def polygonize_mask(
    mask_array: np.ndarray, 
    transform, 
    crs, 
    min_area_sqm: float = 0.0,
    output_geojson: Optional[str | Path] = None
) -> Dict[str, Any]:
    """
    Converts a boolean raster mask into a GeoJSON FeatureCollection.
    
    Args:
        mask_array: Boolean numpy array (True for regions of interest).
        transform: Rasterio affine transform mapping pixel coordinates to spatial.
        crs: Coordinate reference system of the raster.
        min_area_sqm: Minimum polygon area in square meters to retain (filters noise).
        output_geojson: Optional path to save the resulting GeoJSON.
        
    Returns:
        A dictionary representation of the GeoJSON FeatureCollection.
    """
    # Ensure mask is boolean or uint8
    mask_array = mask_array.astype(np.uint8)
    
    # Extract geometries
    results = (
        {"properties": {"class": "region"}, "geometry": s}
        for i, (s, value) in enumerate(
            shapes(mask_array, mask=(mask_array == 1), transform=transform)
        )
    )
    
    # Create GeoDataFrame
    geoms = list(results)
    if not geoms:
        # Return empty feature collection if no mask
        fc = {"type": "FeatureCollection", "features": []}
        if output_geojson:
            with open(output_geojson, 'w') as f:
                import json
                json.dump(fc, f)
        return fc

    gdf = gpd.GeoDataFrame.from_features(geoms, crs=crs)
    
    # Make geometries valid and simplify slightly to reduce points
    gdf["geometry"] = gdf["geometry"].make_valid()
    gdf["geometry"] = gdf["geometry"].simplify(tolerance=0.0) # minimal simplify, mostly cleans up
    
    # Reproject to an equal area projection to calculate area if geographic
    # We use a standard World Equidistant Cylindrical or local UTM for precise area
    # But a simple way is EPSG:6933 (Cylindrical Equal Area) or using Geopandas estimated local CRS
    
    # Safest way to get accurate area in meters is to use projected CRS
    if gdf.crs.is_geographic:
        # Estimate a local projected CRS
        projected_gdf = gdf.to_crs(gdf.estimate_utm_crs())
    else:
        projected_gdf = gdf
        
    # Calculate areas
    areas_m2 = projected_gdf.area
    
    # Filter by minimum area
    if min_area_sqm > 0:
        mask_area = areas_m2 >= min_area_sqm
        gdf = gdf[mask_area]
        areas_m2 = areas_m2[mask_area]
        
    # Assign properties
    gdf["area_m2"] = areas_m2.values
    gdf["area_hectares"] = gdf["area_m2"] / 10000.0
    gdf["area_sq_km"] = gdf["area_m2"] / 1000000.0

    # Output GeoJSON is always WGS84 lon/lat regardless of the source raster's
    # CRS (callers may pass a projected CRS, e.g. Sentinel-2's per-UTM-zone
    # tiles) - GeoJSON's implicit CRS is WGS84 and every downstream consumer
    # (the frontend map, _geojson_to_feature_collection) assumes it.
    if not gdf.crs.is_geographic:
        gdf = gdf.to_crs("EPSG:4326")

    # Export to dict (GeoJSON)
    geojson_dict = gdf.__geo_interface__
    
    if output_geojson:
        gdf.to_file(output_geojson, driver="GeoJSON")
        
    return geojson_dict
