"""Tile server routes. M5 Day 5.

GET /api/v1/tiles/{scene_id}/{z}/{x}/{y}.png — XYZ tile endpoint for Leaflet.

M4's Leaflet map adds this as a TileLayer:
  L.tileLayer('/api/v1/tiles/{scene_id}/{z}/{x}/{y}.png')
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.errors import ApiError
from app.services.storage import get_storage
from app.services.tile_renderer import render_tile

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["tiles"])

# 1x1 transparent PNG for empty tiles (avoids 404 errors in Leaflet)
_EMPTY_TILE = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00"
    b"\x01\x03\x00\x00\x00f\xbc:%\x00\x00\x00\x03PLTE\x00\x00\x00\xa7z=\xda"
    b"\x00\x00\x00\x01tRNS\x00@\xe6\xd8f\x00\x00\x00\x1fIDATh\xde\xed\xc1"
    b"\x01\r\x00\x00\x00\xc2 \xfb\xa76\xc77`\x00\x00\x00\x00\x00\x00\x00"
    b"\x00\xbe\r!\x00\x00\x01\x9a`\xe1\xd5\x00\x00\x00\x00IEND\xaeB`\x82"
)


@router.get("/tiles/{scene_id}/{z}/{x}/{y}.png")
def get_tile(
    scene_id: str,
    z: int,
    x: int,
    y: int,
    layer: str = Query(default="rgb", pattern="^(rgb|ndvi|ndwi|ndbi)$"),
) -> Response:
    """Serve a single XYZ tile as PNG.

    Query params:
        layer: 'rgb' (natural color) or 'ndvi'/'ndwi'/'ndbi' (spectral overlay).
    """
    storage = get_storage()

    try:
        scene_path = storage.resolve_scene(scene_id)
    except FileNotFoundError:
        raise ApiError(404, "scene_not_found", f"Scene not found: {scene_id}")

    tile_data = render_tile(scene_path, z, x, y, layer=layer)

    if tile_data is None:
        # Return transparent tile instead of 404 — Leaflet expects 200 for all tiles
        return Response(
            content=_EMPTY_TILE,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    return Response(
        content=tile_data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )
