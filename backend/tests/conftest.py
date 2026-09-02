"""Test-wide setup. Must run before anything imports app.core.config, since
Settings is process-cached (lru_cache) on first call - if SATQUERY_DATA_DIR
isn't set before that first call, every test would read/write the real
~/.satquery/data on the host running the suite."""
from __future__ import annotations

import os
import tempfile

_tmp_data_dir = tempfile.mkdtemp(prefix="satquery-test-data-")
os.environ["SATQUERY_DATA_DIR"] = _tmp_data_dir

import numpy as np
import pytest
import rasterio
from pathlib import Path
from rasterio.transform import from_origin

# Same demo bbox used throughout the mock/router tests, so ROI fixtures line
# up with the values already baked into e.g. the MockGISService defaults.
DEMO_WEST, DEMO_SOUTH, DEMO_EAST, DEMO_NORTH = 77.5, 13.0, 77.6, 13.1

# Scene fixtures are written straight into the real configured storage
# layout (SATQUERY_DATA_DIR/scenes/{id}/scene.tif) rather than pytest's
# per-test tmp_path, so both the adapter unit tests and the full
# /api/v1/query round-trip test (which resolves scene_id through
# app.services.storage, same as production) find the same file.
_SCENES_DIR = Path(_tmp_data_dir) / "scenes"


def _write_multiband_tif(path, red, nir, green, blue=None, *, west=DEMO_WEST, north=DEMO_NORTH, px=0.001):
    h, w = red.shape
    transform = from_origin(west, north, px, px)
    blue = blue if blue is not None else np.full_like(red, 400)
    with rasterio.open(
        path, "w", driver="GTiff", height=h, width=w, count=4,
        dtype=red.dtype, crs="EPSG:4326", transform=transform,
    ) as dst:
        dst.write(blue, 1)
        dst.write(green, 2)
        dst.write(red, 3)
        dst.write(nir, 4)
    return path


@pytest.fixture(scope="module")
def scene_with_vegetation_and_water():
    """100x100, 4-band (B,G,R,NIR) scene: a strong-NDVI patch top-left, a
    strong-NDWI patch bottom-right, flat background elsewhere."""
    shape = (100, 100)
    red = np.full(shape, 400, dtype=np.uint16)
    nir = np.full(shape, 600, dtype=np.uint16)
    green = np.full(shape, 500, dtype=np.uint16)

    # Vegetation: NDVI = (3000-300)/(3300) ≈ 0.82
    red[10:30, 10:30] = 300
    nir[10:30, 10:30] = 3000

    # Water: NDWI = (1000-100)/(1100) ≈ 0.82
    green[60:80, 60:80] = 1000
    nir[60:80, 60:80] = 100

    scene_dir = _SCENES_DIR / "veg_water_scene"
    scene_dir.mkdir(parents=True)
    path = scene_dir / "scene.tif"
    _write_multiband_tif(path, red, nir, green)
    return path


@pytest.fixture(scope="module")
def bitemporal_scenes():
    """Two same-grid scenes where a new NDVI patch appears in the second."""
    shape = (100, 100)
    red_a = np.full(shape, 400, dtype=np.uint16)
    nir_a = np.full(shape, 600, dtype=np.uint16)
    green_a = np.full(shape, 500, dtype=np.uint16)

    red_b = red_a.copy()
    nir_b = nir_a.copy()
    green_b = green_a.copy()
    red_b[40:60, 40:60] = 300
    nir_b[40:60, 40:60] = 3000  # new high-NDVI region only in "b"

    path_a = _SCENES_DIR / "bt_a" / "scene.tif"
    path_a.parent.mkdir(parents=True)
    _write_multiband_tif(path_a, red_a, nir_a, green_a)

    path_b = _SCENES_DIR / "bt_b" / "scene.tif"
    path_b.parent.mkdir(parents=True)
    _write_multiband_tif(path_b, red_b, nir_b, green_b)

    return path_a, path_b


@pytest.fixture(scope="module")
def three_band_scene():
    """RGB-only scene - no NIR, so spectral indices must fail loudly."""
    shape = (20, 20)
    transform = from_origin(DEMO_WEST, DEMO_NORTH, 0.001, 0.001)
    path = _SCENES_DIR / "rgb_only" / "scene.tif"
    path.parent.mkdir(parents=True)
    with rasterio.open(
        path, "w", driver="GTiff", height=shape[0], width=shape[1], count=3,
        dtype=np.uint8, crs="EPSG:4326", transform=transform,
    ) as dst:
        for b in range(1, 4):
            dst.write(np.full(shape, 100, dtype=np.uint8), b)
    return path
