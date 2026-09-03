"""Tile renderer. M5 Day 5.

Converts GeoTIFF scenes into XYZ-scheme PNG tiles suitable for Leaflet.
Supports RGB rendering and spectral index color-mapped overlays.
"""
from __future__ import annotations

import hashlib
import logging
import math
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from app.core.config import get_settings

log = logging.getLogger(__name__)


def _tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Convert XYZ tile coordinates to EPSG:4326 bounds (west, south, east, north)."""
    n = 2**z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return west, south, east, north


def render_tile(
    scene_path: str | Path,
    z: int, x: int, y: int,
    *,
    layer: str = "rgb",
    tile_size: int | None = None,
) -> bytes | None:
    """Render a single tile as PNG bytes.

    Returns None if the tile doesn't intersect the scene.

    Args:
        scene_path: Path to the GeoTIFF.
        z, x, y: XYZ tile coordinates.
        layer: 'rgb' for natural color, or 'ndvi'/'ndwi'/'ndbi' for spectral.
        tile_size: Output tile size in pixels (default from config).
    """
    try:
        import rasterio
        from rasterio.warp import transform_bounds
        from rasterio.windows import from_bounds
    except ImportError:
        log.warning("rasterio not available; cannot render tiles")
        return None

    s = get_settings()
    size = tile_size or s.tile_size
    tile_west, tile_south, tile_east, tile_north = _tile_bounds(z, x, y)

    try:
        with rasterio.open(scene_path) as src:
            # Transform tile bounds to scene CRS
            if src.crs and str(src.crs) != "EPSG:4326":
                scene_bounds = transform_bounds(
                    "EPSG:4326", src.crs,
                    tile_west, tile_south, tile_east, tile_north,
                )
            else:
                scene_bounds = (tile_west, tile_south, tile_east, tile_north)

            # Check intersection
            sb = src.bounds
            if (scene_bounds[0] >= sb.right or scene_bounds[2] <= sb.left or
                    scene_bounds[1] >= sb.top or scene_bounds[3] <= sb.bottom):
                return None  # No intersection

            # Read windowed data
            window = from_bounds(*scene_bounds, src.transform)
            if src.count >= 4:
                # 4+ band scenes follow this app's Sentinel-2 convention
                # (gis.py: 1=Blue, 2=Green, 3=Red, 4=NIR — see
                # satellite_fetch.py) rather than already being in R,G,B
                # display order, so pick bands by that meaning.
                band_indices = [3, 2, 1]
            else:
                band_indices = list(range(1, min(3, src.count) + 1))
            bands = len(band_indices)

            if layer == "rgb":
                # boundless+fill_value=0 is required whenever `window` only
                # partially overlaps the dataset (any tile straddling the
                # scene's edge). Without it, rasterio silently clips the
                # window to the overlapping sliver and then stretches that
                # sliver across the full out_shape — the real image appears
                # to "bleed" past its true geographic footprint into
                # neighboring tiles instead of fading to transparent.
                data = src.read(
                    band_indices,
                    window=window,
                    out_shape=(bands, size, size),
                    resampling=rasterio.enums.Resampling.bilinear,
                    boundless=True,
                    fill_value=0,
                )
                arr = np.moveaxis(data, 0, -1)

                # Normalize to 0-255
                if arr.dtype != np.uint8:
                    for c in range(arr.shape[2]):
                        band = arr[:, :, c].astype(float)
                        valid = band[band > 0]
                        if valid.size > 0:
                            p2, p98 = np.percentile(valid, [2, 98])
                            if p98 > p2:
                                band = np.clip((band - p2) / (p98 - p2) * 255, 0, 255)
                        arr[:, :, c] = band
                    arr = arr.astype(np.uint8)

                if bands == 1:
                    arr = np.repeat(arr, 3, axis=2)

                # Add alpha channel (transparent where no data)
                alpha = np.where(arr.sum(axis=2) > 0, 255, 0).astype(np.uint8)
                rgba = np.dstack([arr, alpha])
                img = Image.fromarray(rgba, "RGBA")

            else:
                # Spectral index rendering
                img = _render_spectral_tile(src, window, size, layer)
                if img is None:
                    return None

            buf = BytesIO()
            img.save(buf, "PNG", optimize=True)
            return buf.getvalue()

    except Exception:
        log.exception("tile render failed for z=%d x=%d y=%d", z, x, y)
        return None


def _render_spectral_tile(
    src, window, size: int, index_name: str
) -> Image.Image | None:
    """Compute a spectral index and render as a color-mapped tile."""
    import rasterio

    try:
        # Need at least 4 bands for spectral indices
        if src.count < 4:
            return None

        data = src.read(
            window=window,
            out_shape=(src.count, size, size),
            resampling=rasterio.enums.Resampling.bilinear,
            boundless=True,
            fill_value=0,
        ).astype(float)

        # Standard Sentinel-2 band ordering: B2(blue), B3(green), B4(red), B8(NIR)
        red = data[2]   # Band 3 = Red
        nir = data[3]   # Band 4 = NIR
        green = data[1] # Band 2 = Green
        blue = data[0]  # Band 1 = Blue

        # Compute index
        eps = 1e-10
        if index_name == "ndvi":
            idx = (nir - red) / (nir + red + eps)
            cmap = _ndvi_colormap
        elif index_name == "ndwi":
            idx = (green - nir) / (green + nir + eps)
            cmap = _ndwi_colormap
        elif index_name == "ndbi":
            # NDBI uses SWIR, but with 4 bands we approximate
            idx = (red - nir) / (red + nir + eps)
            cmap = _ndbi_colormap
        else:
            return None

        # Normalize to 0-255 and apply colormap
        normalized = np.clip((idx + 1) / 2 * 255, 0, 255).astype(np.uint8)
        rgba = cmap(normalized)
        return Image.fromarray(rgba, "RGBA")

    except Exception:
        log.exception("spectral tile render failed")
        return None


def _ndvi_colormap(values: np.ndarray) -> np.ndarray:
    """Red → Yellow → Green colormap for NDVI."""
    h, w = values.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 3] = np.where(values > 10, 180, 0)  # Alpha

    # Red channel: high for low NDVI
    rgba[:, :, 0] = np.clip(255 - values * 2, 0, 255).astype(np.uint8)
    # Green channel: high for high NDVI
    rgba[:, :, 1] = np.clip(values * 2 - 50, 0, 255).astype(np.uint8)
    # Blue: minimal
    rgba[:, :, 2] = 20
    return rgba


def _ndwi_colormap(values: np.ndarray) -> np.ndarray:
    """Brown → Cyan → Blue colormap for NDWI."""
    h, w = values.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 3] = np.where(values > 10, 180, 0)

    rgba[:, :, 0] = np.clip(180 - values, 0, 255).astype(np.uint8)
    rgba[:, :, 1] = np.clip(values * 1.5, 0, 255).astype(np.uint8)
    rgba[:, :, 2] = np.clip(values * 2, 0, 255).astype(np.uint8)
    return rgba


def _ndbi_colormap(values: np.ndarray) -> np.ndarray:
    """Green → Yellow → Purple colormap for NDBI."""
    h, w = values.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, 3] = np.where(values > 10, 180, 0)

    rgba[:, :, 0] = np.clip(values * 1.5, 0, 255).astype(np.uint8)
    rgba[:, :, 1] = np.clip(255 - values, 0, 255).astype(np.uint8)
    rgba[:, :, 2] = np.clip(values, 0, 200).astype(np.uint8)
    return rgba
