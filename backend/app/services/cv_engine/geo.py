"""
Geospatial transformation utilities for converting pixel coordinates to geographic coordinates.
Uses rasterio and shapely.
"""

import os
import warnings
from typing import Any, List, Optional, Tuple, Union
import numpy as np
try:
    from shapely.geometry import Polygon, MultiPolygon, GeometryCollection, shape, mapping
    from shapely.validation import make_valid
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

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
    transform: Optional[Any] = None,
    crs: Optional[Any] = None
) -> List[List[float]]:
    """
    Transform a list of [x, y] coordinates from pixel space to geographic space (WGS84).
    If transform is None, returns the coordinates directly as floats.
    If CRS is non-geographic (e.g. UTM meters), reprojects coordinates to EPSG:4326.
    """
    if transform is None:
        return [[float(pt[0]), float(pt[1])] for pt in coords]

    raw_geo = []
    xs = []
    ys = []
    for pt in coords:
        gx, gy = pixel_to_geo(pt[0], pt[1], transform)
        raw_geo.append((gx, gy))
        xs.append(gx)
        ys.append(gy)

    # Reproject to EPSG:4326 if CRS is projected (e.g. UTM meters)
    if crs is not None and HAS_RASTERIO and len(xs) > 0:
        try:
            from rasterio.warp import transform as warp_transform
            is_4326 = False
            try:
                if hasattr(crs, "to_epsg") and crs.to_epsg() == 4326:
                    is_4326 = True
                elif hasattr(crs, "is_geographic") and crs.is_geographic and abs(xs[0]) <= 180 and abs(ys[0]) <= 90:
                    is_4326 = True
            except Exception:
                pass

            if not is_4326:
                txs, tys = warp_transform(crs, "EPSG:4326", xs, ys)
                return [[float(tx), float(ty)] for tx, ty in zip(txs, tys)]
        except Exception:
            pass

    return [[float(gx), float(gy)] for gx, gy in raw_geo]


def build_geojson_polygon(
    coords: List[List[float]],
    transform: Optional[Any] = None,
    crs: Optional[Any] = None,
    simplify_tolerance: float = 0.5
) -> Tuple[str, Any]:
    """
    Build a valid GeoJSON Polygon/MultiPolygon from boundary points.
    Handles self-intersections, GeometryCollections, and CRS transforms cleanly.
    Returns (geometry_type, coordinates in WGS84).
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

    if not HAS_SHAPELY:
        if transform is not None:
            transformed = transform_polygon_to_geo(coords, transform=transform, crs=crs)
            return "Polygon", [transformed]
        return "Polygon", [coords]

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
                transformed_coords.append(transform_polygon_to_geo(ring, transform=transform, crs=crs))
            return geom_type, transformed_coords
        elif geom_type == "MultiPolygon":
            transformed_coords = []
            for poly_rings in raw_coords:
                poly_list = []
                for ring in poly_rings:
                    poly_list.append(transform_polygon_to_geo(ring, transform=transform, crs=crs))
                transformed_coords.append(poly_list)
            return geom_type, transformed_coords

    return geom_type, raw_coords


def geo_bbox_to_pixel(bbox: Any, transform: Any) -> Tuple[int, int, int, int]:
    """Invert the scene's affine transform to convert a geographic BBox
    (EPSG:4326) into pixel space (min_col, min_row, max_col, max_row).

    Uses all 4 corners so it stays correct even if transform has rotation.
    """
    if transform is None:
        if hasattr(bbox, "xmin"):
            return int(round(bbox.xmin)), int(round(bbox.ymin)), int(round(bbox.xmax)), int(round(bbox.ymax))
        elif hasattr(bbox, "west"):
            return int(round(bbox.west)), int(round(bbox.south)), int(round(bbox.east)), int(round(bbox.north))
        elif isinstance(bbox, (list, tuple)) and len(bbox) == 4:
            return int(round(bbox[0])), int(round(bbox[1])), int(round(bbox[2])), int(round(bbox[3]))
        return 0, 0, 0, 0

    inv = ~transform
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
        return 0, 0, 0, 0

    corners = [(w, s), (w, n), (e, s), (e, n)]
    cols, rows = zip(*(inv * (lon, lat) for lon, lat in corners))
    return int(round(min(cols))), int(round(min(rows))), int(round(max(cols))), int(round(max(rows)))


def get_feature_centroid(feature: Any) -> Tuple[float, float]:
    """Extract (x, y) centroid from a GeoJSON Feature or dict."""
    try:
        if hasattr(feature, "geometry"):
            coords = feature.geometry.coordinates
            gtype = feature.geometry.type
        elif isinstance(feature, dict) and "geometry" in feature:
            coords = feature["geometry"]["coordinates"]
            gtype = feature["geometry"]["type"]
        else:
            return 0.0, 0.0

        if gtype == "Polygon" and coords and len(coords[0]) > 0:
            ring = coords[0]
            xs = [pt[0] for pt in ring]
            ys = [pt[1] for pt in ring]
            return float(sum(xs) / len(xs)), float(sum(ys) / len(ys))
        elif gtype == "MultiPolygon" and coords and len(coords[0]) > 0 and len(coords[0][0]) > 0:
            ring = coords[0][0]
            xs = [pt[0] for pt in ring]
            ys = [pt[1] for pt in ring]
            return float(sum(xs) / len(xs)), float(sum(ys) / len(ys))
        elif gtype == "Point" and len(coords) >= 2:
            return float(coords[0]), float(coords[1])
    except Exception:
        pass
    return 0.0, 0.0


def filter_features_by_spatial_constraint(
    features: List[Any],
    bounds: Tuple[float, float, float, float],
    direction: str,
    is_pixel_space: bool = False
) -> List[Any]:
    """
    Filter detected features according to directional/quadrant constraints (Day 10).
    Supported direction tokens:
        - "north", "northern"
        - "south", "southern"
        - "east", "eastern"
        - "west", "western"
        - "northeast", "northwest", "southeast", "southwest"

    bounds: (min_x, min_y, max_x, max_y)
    is_pixel_space: True if Y increases downwards (image coordinates).
    """
    if not features or not direction:
        return features

    norm_dir = direction.strip().lower()
    min_x, min_y, max_x, max_y = bounds
    mid_x = (min_x + max_x) / 2.0
    mid_y = (min_y + max_y) / 2.0

    filtered = []
    for feat in features:
        cx, cy = get_feature_centroid(feat)

        # In geographic CRS: North is +Y (higher lat). In pixel coords: North is -Y (smaller row).
        is_north = (cy <= mid_y) if is_pixel_space else (cy >= mid_y)
        is_south = not is_north
        is_east = cx >= mid_x
        is_west = not is_east

        match = False
        if norm_dir in ("north", "northern"):
            match = is_north
        elif norm_dir in ("south", "southern"):
            match = is_south
        elif norm_dir in ("east", "eastern"):
            match = is_east
        elif norm_dir in ("west", "western"):
            match = is_west
        elif norm_dir in ("northeast", "north-east"):
            match = is_north and is_east
        elif norm_dir in ("northwest", "north-west"):
            match = is_north and is_west
        elif norm_dir in ("southeast", "south-east"):
            match = is_south and is_east
        elif norm_dir in ("southwest", "south-west"):
            match = is_south and is_west
        else:
            # Unrecognized direction token -> do not discard
            match = True

        if match:
            filtered.append(feat)

    return filtered

