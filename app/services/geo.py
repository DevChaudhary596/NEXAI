"""
Geospatial transformation utilities for converting pixel coordinates to geographic coordinates.
Uses rasterio and shapely.
"""

import os
import warnings
from typing import Any, List, Optional, Tuple, Union
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection, shape, mapping
from shapely.validation import make_valid

try:
    import rasterio
    from rasterio.transform import xy
    from rasterio.errors import NotGeoreferencedWarning
    # Filter non-georeferenced warning for standard images
    warnings.filterwarnings("ignore", category=NotGeoreferencedWarning)
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


def get_image_georeference(image_path: str) -> Tuple[Optional[Any], Optional[Any]]:
    """
    Extract affine transform and CRS from an image if it has valid georeferencing (e.g. GeoTIFF).
    Returns (transform, crs) or (None, None).
    """
    if not HAS_RASTERIO or not os.path.exists(image_path):
        return None, None

    try:
        with rasterio.open(image_path) as src:
            transform = src.transform
            crs = src.crs
            if transform is not None and crs is not None:
                if not transform.is_identity:
                    return transform, crs
    except Exception:
        pass
    return None, None


def pixel_to_geo(x: float, y: float, transform: Any) -> Tuple[float, float]:
    """
    Convert a single pixel (x, y) to geographic coordinate using affine transform.
    """
    if transform is None:
        return float(x), float(y)
    geo_x, geo_y = rasterio.transform.xy(transform, y, x, offset='center')
    return float(geo_x), float(geo_y)


def transform_polygon_to_geo(
    coords: List[List[float]],
    transform: Optional[Any] = None
) -> List[List[float]]:
    """
    Transform a list of [x, y] coordinates from pixel space to geographic space.
    If transform is None, returns the coordinates directly as floats.
    """
    if transform is None:
        return [[float(pt[0]), float(pt[1])] for pt in coords]

    geo_coords = []
    for pt in coords:
        gx, gy = pixel_to_geo(pt[0], pt[1], transform)
        geo_coords.append([gx, gy])
    return geo_coords


def build_geojson_polygon(
    coords: List[List[float]],
    transform: Optional[Any] = None,
    simplify_tolerance: float = 0.5
) -> Tuple[str, Any]:
    """
    Build a valid GeoJSON Polygon/MultiPolygon from boundary points.
    Handles self-intersections, GeometryCollections, and CRS transforms cleanly.
    Returns (geometry_type, coordinates).
    """
    # Fallback to minimal polygon if too few points
    if len(coords) < 3:
        if len(coords) == 1:
            x, y = coords[0]
            coords = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]
        elif len(coords) == 2:
            x1, y1 = coords[0]
            x2, y2 = coords[1]
            coords = [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]

    # Ensure closed ring
    if coords[0] != coords[-1]:
        coords.append(coords[0])

    poly = Polygon(coords)
    if not poly.is_valid:
        poly = make_valid(poly)

    # If make_valid produced a GeometryCollection, extract valid Polygons
    if poly.geom_type == "GeometryCollection":
        poly_candidates = [g for g in poly.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if poly_candidates:
            poly = max(poly_candidates, key=lambda g: g.area)
        else:
            poly = poly.convex_hull

    if poly.is_empty:
        poly = Polygon(coords).convex_hull

    if simplify_tolerance > 0 and poly.geom_type == "Polygon":
        poly = poly.simplify(simplify_tolerance, preserve_topology=True)

    geom_dict = mapping(poly)
    geom_type = geom_dict["type"]

    if "coordinates" in geom_dict:
        raw_coords = geom_dict["coordinates"]
    else:
        # Fallback to direct coords
        geom_type = "Polygon"
        raw_coords = [coords]

    if transform is not None:
        if geom_type == "Polygon":
            transformed_coords = []
            for ring in raw_coords:
                transformed_coords.append(transform_polygon_to_geo(ring, transform))
            return geom_type, transformed_coords
        elif geom_type == "MultiPolygon":
            transformed_coords = []
            for poly_rings in raw_coords:
                poly_list = []
                for ring in poly_rings:
                    poly_list.append(transform_polygon_to_geo(ring, transform))
                transformed_coords.append(poly_list)
            return geom_type, transformed_coords

    return geom_type, raw_coords
