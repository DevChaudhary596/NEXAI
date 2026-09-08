"""
Spatial cluster analysis and density hotspot detection for geospatial CV (Day 11).
Uses CPU-based DBSCAN clustering on detection centroid coordinates.
"""

from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from sklearn.cluster import DBSCAN
from app.services.cv_engine.geo import get_feature_centroid


def compute_spatial_clusters(
    features: List[Any],
    eps_meters: float = 300.0,
    min_samples: int = 3,
    is_geo_degrees: bool = True
) -> Tuple[List[Any], Dict[str, Any]]:
    """
    Perform DBSCAN clustering on detection centroids to identify spatial congestion hotspots (Day 11).

    Args:
        features: List of GeoJSON Feature objects or dicts.
        eps_meters: Neighborhood distance in meters (or pixels if not geo-degrees).
        min_samples: Minimum objects to constitute a dense cluster hotspot.
        is_geo_degrees: True if coordinates are (longitude, latitude) in EPSG:4326.

    Returns:
        (updated_features, cluster_metrics)
    """
    metrics: Dict[str, Any] = {
        "cluster_count": 0,
        "hotspot_count": 0,
        "noise_count": 0,
        "max_cluster_size": 0,
        "clusters": {}
    }

    if not features:
        return features, metrics

    # Extract centroids
    centroids = []
    for feat in features:
        cx, cy = get_feature_centroid(feat)
        centroids.append([cx, cy])

    pts = np.array(centroids, dtype=np.float64)

    if len(pts) < min_samples:
        # Not enough points for clustering
        for feat in features:
            if hasattr(feat, "properties"):
                feat.properties["cluster_id"] = None
                feat.properties["is_hotspot"] = False
            elif isinstance(feat, dict) and "properties" in feat:
                feat["properties"]["cluster_id"] = None
                feat["properties"]["is_hotspot"] = False
        metrics["noise_count"] = len(features)
        return features, metrics

    # Convert coordinates to metric space if degrees (approx 1 deg lat ~ 111,320m)
    if is_geo_degrees:
        mean_lat = float(np.mean(pts[:, 1]))
        lat_rad = np.radians(mean_lat)
        # meters per degree
        m_per_deg_lat = 111132.954 - 559.822 * np.cos(2 * lat_rad) + 1.175 * np.cos(4 * lat_rad)
        m_per_deg_lon = 111412.84 * np.cos(lat_rad) - 93.5 * np.cos(3 * lat_rad)
        if m_per_deg_lon <= 0:
            m_per_deg_lon = 111320.0 * max(0.1, np.cos(lat_rad))

        metric_pts = np.zeros_like(pts)
        metric_pts[:, 0] = pts[:, 0] * m_per_deg_lon
        metric_pts[:, 1] = pts[:, 1] * m_per_deg_lat
        db = DBSCAN(eps=eps_meters, min_samples=min_samples).fit(metric_pts)
    else:
        db = DBSCAN(eps=eps_meters, min_samples=min_samples).fit(pts)

    labels = db.labels_

    unique_clusters = set(labels) - {-1}
    cluster_counts: Dict[int, int] = {}
    for lbl in labels:
        if lbl != -1:
            cluster_counts[lbl] = cluster_counts.get(lbl, 0) + 1

    metrics["cluster_count"] = len(unique_clusters)
    metrics["hotspot_count"] = sum(cluster_counts.values())
    metrics["noise_count"] = int(np.count_nonzero(labels == -1))
    metrics["max_cluster_size"] = max(cluster_counts.values()) if cluster_counts else 0
    metrics["clusters"] = {int(k): int(v) for k, v in cluster_counts.items()}

    # Attach properties to features
    for idx, (feat, lbl) in enumerate(zip(features, labels)):
        is_hotspot = bool(lbl != -1)
        cid = int(lbl) if is_hotspot else None

        if hasattr(feat, "properties"):
            feat.properties["cluster_id"] = cid
            feat.properties["is_hotspot"] = is_hotspot
        elif isinstance(feat, dict) and "properties" in feat:
            feat["properties"]["cluster_id"] = cid
            feat["properties"]["is_hotspot"] = is_hotspot

    return features, metrics
