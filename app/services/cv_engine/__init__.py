"""
SatQuery AI - Geospatial CV Engine (Member 2 Package)
Optimized for 100% CPU / Zero GPU runtime with YOLOv8n-OBB, SAHI sliding slicing,
class-calibrated confidence tuning, boundary artifact smoothing, and DBSCAN clustering.
"""

from app.services.cv_engine.detector import (
    RealOBBDetector,
    CLASS_CONFIDENCE_THRESHOLDS,
    prune_false_positives,
    calculate_obb_properties,
)
from app.services.cv_engine.sahi_slicer import (
    calculate_slice_regions,
    nms_obb,
    polygon_iou,
    polygon_containment,
    merge_obb_polygons,
)
from app.services.cv_engine.geo import (
    get_image_georeference,
    build_geojson_polygon,
    geo_bbox_to_pixel,
    filter_features_by_spatial_constraint,
    get_feature_centroid,
)
from app.services.cv_engine.spatial_cluster import (
    compute_spatial_clusters,
)
from app.services.cv_engine.cv_impl import (
    RealCVService,
    load_image_and_georef,
)

__all__ = [
    "RealCVService",
    "RealOBBDetector",
    "CLASS_CONFIDENCE_THRESHOLDS",
    "calculate_slice_regions",
    "nms_obb",
    "polygon_iou",
    "polygon_containment",
    "merge_obb_polygons",
    "filter_features_by_spatial_constraint",
    "get_feature_centroid",
    "compute_spatial_clusters",
    "prune_false_positives",
    "calculate_obb_properties",
    "load_image_and_georef",
]
