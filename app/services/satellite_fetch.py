"""Live satellite imagery fetch — the "no GeoTIFF required" path.

Queries AWS Earth Search (Element84's free, keyless STAC API) for the most
recent, low-cloud Sentinel-2 scene covering a given AOI, then reads just
that AOI's pixels out of four of the scene's public single-band
Cloud-Optimized GeoTIFFs via HTTP range requests (rasterio/GDAL do this
natively — no need to download the full ~1GB source tiles). The result is
written out as an ordinary local 4-band GeoTIFF and handed to the same
storage.save_scene() path a manual upload uses, so every downstream feature
(tiling, detection, segmentation, spectral, chat) works on it unchanged.

Bands are Blue/Green/Red/NIR, in that order, matching gis.py's
`_BLUE, _GREEN, _RED, _NIR = 1, 2, 3, 4` — this is what makes NDVI/NDWI
possible at all; a true-color-only (3-band) crop has no NIR to compute
them from. tile_renderer.py and storage.py's thumbnail generator both know
to read bands [3, 2, 1] as R/G/B for *display* of a 4+-band scene.

Free tier tradeoff worth knowing: Sentinel-2 is 10m/pixel. That's enough
for land-cover segmentation, NDVI/water/built-up spectral analysis, and
large-structure outlines, but too coarse for fine object detection
(individual buildings, ships, planes) — that needs a higher-resolution
premium source (Planet ~3m, Maxar ~30cm), which is a separate, paid
integration, not something this free path can also provide.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
import numpy as np
import rasterio
from rasterio.transform import Affine
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds as window_from_bounds

log = logging.getLogger(__name__)

STAC_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"
COLLECTION = "sentinel-2-l2a"
MAX_CLOUD_COVER = 20  # percent

# Order matters: matches gis.py's 1=Blue, 2=Green, 3=Red, 4=NIR contract.
BAND_ASSETS = ["blue", "green", "red", "nir"]


class NoImageryFoundError(Exception):
    """Raised when the STAC search returns nothing usable for the AOI."""


async def find_latest_scene(
    west: float, south: float, east: float, north: float
) -> dict[str, Any]:
    """Return the STAC item for the freshest low-cloud Sentinel-2 pass over
    this bbox, or raise NoImageryFoundError."""
    body = {
        "collections": [COLLECTION],
        "bbox": [west, south, east, north],
        "query": {"eo:cloud_cover": {"lt": MAX_CLOUD_COVER}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 1,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(STAC_SEARCH_URL, json=body)
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        raise NoImageryFoundError(
            f"No Sentinel-2 pass with <{MAX_CLOUD_COVER}% cloud cover found for this area."
        )
    return features[0]


def crop_scene_to_geotiff(item: dict[str, Any], west: float, south: float, east: float, north: float) -> bytes:
    """Read the AOI window out of each of the item's Blue/Green/Red/NIR
    single-band COGs, convert each from a raw digital number to surface
    reflectance using that band's own scale/offset (Sentinel-2 L2A's 2022+
    processing baseline adds a nonzero offset, so this isn't optional —
    skipping it would bias every NDVI/NDWI computed from the result), and
    stack them into one 4-band GeoTIFF ready for storage.save_scene().
    """
    bands: list[np.ndarray] = []
    out_transform: Affine | None = None
    out_crs = None

    for band_name in BAND_ASSETS:
        asset = item["assets"][band_name]
        with rasterio.open(asset["href"]) as src:
            if out_crs is None:
                aoi_native = transform_bounds("EPSG:4326", src.crs, west, south, east, north)
                out_crs = src.crs
            window = window_from_bounds(*aoi_native, transform=src.transform)
            raw = src.read(1, window=window, boundless=True, fill_value=0).astype(np.float32)
            if out_transform is None:
                out_transform = src.window_transform(window)

        band_meta = (asset.get("raster:bands") or [{}])[0]
        scale = band_meta.get("scale", 1.0)
        offset = band_meta.get("offset", 0.0)
        # 0 is this band's nodata value (edge-of-swath / masked pixels) —
        # leave those at 0 rather than running them through the offset,
        # which would otherwise turn "no data" into a bogus negative
        # reflectance reading.
        #
        # The post-2022 baseline's offset (-0.1, a -1000 DN shift correcting
        # for atmospheric over-subtraction) routinely pushes already-low raw
        # DNs negative — most visibly the red band under healthy vegetation,
        # where strong chlorophyll absorption means most pixels start under
        # the 1000-DN offset to begin with (confirmed on a real Punjab
        # farmland pass: 83% of red-band pixels went negative). Reflectance
        # has no physical negative value, and feeding a negative term into
        # NDVI/NDWI's (a-b)/(a+b) blows the result well outside its defined
        # [-1, 1] range (observed mean NDVI of 1.19 on that same pass) — so
        # it's floored at 0 here, the standard remote-sensing convention for
        # this exact artifact.
        reflectance = np.where(raw > 0, np.maximum(raw * scale + offset, 0.0), 0.0).astype(np.float32)
        bands.append(reflectance)

    stacked = np.stack(bands, axis=0)  # (4, H, W) = Blue, Green, Red, NIR

    buf = io.BytesIO()
    with rasterio.open(
        buf,
        "w",
        driver="GTiff",
        height=stacked.shape[1],
        width=stacked.shape[2],
        count=stacked.shape[0],
        dtype="float32",
        crs=out_crs,
        transform=out_transform,
        nodata=0.0,
    ) as dst:
        dst.write(stacked)

    return buf.getvalue()


def _scene_datetime(item: dict[str, Any]) -> datetime:
    dt_str = item["properties"].get("datetime")
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


def scene_label(item: dict[str, Any]) -> str:
    """Human-readable filename for the fetched scene, e.g.
    'Sentinel-2_2026-07-14.tif'."""
    return f"Sentinel-2_{_scene_datetime(item).strftime('%Y-%m-%d')}.tif"


def scene_capture_info(item: dict[str, Any]) -> dict[str, Any]:
    """Provenance the frontend shows as proof of freshness - which pass this
    is and how much cloud was in the way - not derivable from the cropped
    GeoTIFF's own raster metadata, only from the STAC item."""
    return {
        "capture_date": _scene_datetime(item).date().isoformat(),
        "cloud_cover_pct": item["properties"].get("eo:cloud_cover"),
        "satellite": "Sentinel-2 L2A",
    }
