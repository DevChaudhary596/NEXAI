"""Upload & scene management routes. M5 Days 1-2.

POST /api/v1/upload — multipart GeoTIFF upload with thumbnail generation.
POST /api/v1/scenes/fetch-satellite — fetch live Sentinel-2 imagery for an AOI,
    no GeoTIFF upload required.
GET  /api/v1/scenes — list all uploaded scenes.
GET  /api/v1/scenes/{scene_id}/thumbnail — serve the JPEG thumbnail.
DELETE /api/v1/scenes/{scene_id} — remove a scene.
"""
from __future__ import annotations

import base64
import io
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse, Response

from app.api.errors import ApiError
from app.core.config import get_settings
from app.core.schemas import (
    FetchSatelliteRequest,
    SceneListItem,
    SceneListResponse,
    SnapshotSceneRequest,
    UploadResponse,
)
from app.services import satellite_fetch
from app.services.storage import get_storage

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["upload"])


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_scene(file: UploadFile = File(...)) -> UploadResponse:
    """Accept a GeoTIFF upload, store it, generate a thumbnail, extract metadata.

    M4 calls this before sending a query — the returned `scene_id` is what
    goes into QueryRequest.scene_id.
    """
    s = get_settings()
    storage = get_storage()

    # Validate file type
    filename = file.filename or "unknown.tif"
    if not filename.lower().endswith((".tif", ".tiff", ".geotiff")):
        raise ApiError(
            400, "invalid_file_type",
            f"Expected a GeoTIFF file (.tif/.tiff), got: {filename}",
        )

    # Read and validate size
    data = await file.read()
    max_bytes = s.upload_max_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise ApiError(
            413, "payload_too_large",
            f"File size {len(data) / 1e6:.1f} MB exceeds limit of {s.upload_max_mb} MB.",
        )

    # Mint ID, save, generate thumbnail, extract metadata
    scene_id = storage.mint_scene_id()
    scene_path = storage.save_scene(scene_id, data, filename)
    storage.generate_thumbnail(scene_id, scene_path)
    meta = storage.extract_metadata(scene_path)

    log.info(
        "upload complete: scene_id=%s filename=%s size=%d bytes",
        scene_id, filename, len(data),
    )

    return UploadResponse(
        scene_id=scene_id,
        filename=filename,
        size_bytes=len(data),
        thumbnail_url=f"/api/v1/scenes/{scene_id}/thumbnail",
        bounds=meta.get("bounds"),
        crs=meta.get("crs"),
        resolution_m=meta.get("resolution_m"),
        band_count=meta.get("band_count"),
    )


@router.post("/scenes/fetch-satellite", response_model=UploadResponse, status_code=201)
async def fetch_satellite_scene(req: FetchSatelliteRequest) -> UploadResponse:
    """Fetch the freshest low-cloud Sentinel-2 pass for an AOI and register
    it as a scene — the "no GeoTIFF required" path. Same response shape as
    /upload, so the frontend treats it identically once it comes back.
    """
    storage = get_storage()
    bbox = req.bbox

    try:
        item = await satellite_fetch.find_latest_scene(
            bbox.west, bbox.south, bbox.east, bbox.north
        )
    except satellite_fetch.NoImageryFoundError as exc:
        raise ApiError(404, "no_imagery_found", str(exc))
    except httpx.HTTPError as exc:
        raise ApiError(502, "imagery_provider_error", f"Sentinel-2 search failed: {exc}")

    try:
        data = satellite_fetch.crop_scene_to_geotiff(
            item, bbox.west, bbox.south, bbox.east, bbox.north
        )
    except Exception as exc:
        log.exception("satellite crop failed")
        raise ApiError(502, "imagery_provider_error", f"Could not read Sentinel-2 imagery: {exc}")

    filename = satellite_fetch.scene_label(item)
    scene_id = storage.mint_scene_id()
    scene_path = storage.save_scene(scene_id, data, filename)
    storage.update_scene_provenance(
        scene_id,
        source_type="copernicus_planetary_computer",
        source_item_id=item["id"],
        capture_date=satellite_fetch.scene_capture_info(item)["capture_date"],
    )
    storage.generate_thumbnail(scene_id, scene_path)
    meta = storage.extract_metadata(scene_path)

    log.info(
        "satellite fetch complete: scene_id=%s item=%s bbox=%s",
        scene_id, item["id"], (bbox.west, bbox.south, bbox.east, bbox.north),
    )

    capture_info = satellite_fetch.scene_capture_info(item)
    return UploadResponse(
        scene_id=scene_id,
        filename=filename,
        size_bytes=len(data),
        thumbnail_url=f"/api/v1/scenes/{scene_id}/thumbnail",
        bounds=meta.get("bounds"),
        crs=meta.get("crs"),
        resolution_m=meta.get("resolution_m"),
        band_count=meta.get("band_count"),
        satellite=capture_info["satellite"],
        capture_date=capture_info["capture_date"],
        cloud_cover_pct=capture_info["cloud_cover_pct"],
    )


@router.post("/scenes/snapshot", response_model=UploadResponse, status_code=201)
async def create_snapshot_scene(req: SnapshotSceneRequest) -> UploadResponse:
    """Create an authentic georeferenced GeoTIFF scene from a live Cesium
    map viewport or user-drawn AOI bounding box snapshot.
    """
    storage = get_storage()
    bounds = req.bounds
    if len(bounds) != 4:
        raise ApiError(400, "invalid_bounds", "bounds must be [west, south, east, north]")

    west, south, east, north = bounds
    if west >= east or south >= north:
        raise ApiError(400, "invalid_bounds", "west must be < east and south must be < north")

    raw_b64 = req.image_base64
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception as exc:
        raise ApiError(400, "invalid_image_base64", f"Could not decode base64 image: {exc}")

    try:
        from PIL import Image
        import numpy as np
        import rasterio
        from rasterio.transform import from_bounds

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(img)
        h, w, _ = arr.shape
        if h < 2 or w < 2:
            raise ValueError("Image dimensions too small")

        transform = from_bounds(west, south, east, north, w, h)
        buf = io.BytesIO()
        with rasterio.open(
            buf,
            "w",
            driver="GTiff",
            height=h,
            width=w,
            count=3,
            dtype=arr.dtype,
            crs="EPSG:4326",
            transform=transform,
        ) as dst:
            dst.write(np.moveaxis(arr, -1, 0))

        data = buf.getvalue()
    except Exception as exc:
        log.exception("snapshot geotiff generation failed")
        raise ApiError(500, "geotiff_generation_failed", f"Failed to georeference snapshot: {exc}")

    label_prefix = "Drawn AOI" if req.is_roi else "Live Map View"
    filename = req.label or f"{label_prefix} ({north:.3f}°N, {west:.3f}°E).tif"
    scene_id = storage.mint_scene_id()
    scene_path = storage.save_scene(scene_id, data, filename)
    storage.update_scene_provenance(
        scene_id,
        source_type="drawn_roi_snapshot" if req.is_roi else "live_viewport_snapshot",
        capture_date=datetime.now(timezone.utc).isoformat(),
    )
    storage.generate_thumbnail(scene_id, scene_path)
    meta = storage.extract_metadata(scene_path)

    log.info("snapshot scene created: scene_id=%s filename=%s is_roi=%s", scene_id, filename, req.is_roi)

    return UploadResponse(
        scene_id=scene_id,
        filename=filename,
        size_bytes=len(data),
        thumbnail_url=f"/api/v1/scenes/{scene_id}/thumbnail",
        bounds=meta.get("bounds") or bounds,
        crs=meta.get("crs") or "EPSG:4326",
        resolution_m=meta.get("resolution_m"),
        band_count=3,
        satellite="Live Aerial/Satellite View",
        capture_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        cloud_cover_pct=0.0,
    )


@router.get("/scenes", response_model=SceneListResponse)
def list_scenes() -> SceneListResponse:
    """Return all uploaded scenes with their metadata."""
    storage = get_storage()
    scenes = storage.list_scenes()
    return SceneListResponse(
        scenes=[
            SceneListItem(
                scene_id=s.scene_id,
                filename=s.filename,
                size_bytes=s.size_bytes,
                thumbnail_url=s.thumbnail_url,
                uploaded_at=s.uploaded_at,
                bounds=s.bounds,
                crs=s.crs,
            )
            for s in scenes
        ],
        total=len(scenes),
    )


@router.get("/scenes/{scene_id}/thumbnail")
def get_thumbnail(scene_id: str) -> FileResponse:
    """Serve the JPEG thumbnail for a scene."""
    storage = get_storage()
    path = storage.get_thumbnail_path(scene_id)
    if path is None:
        raise ApiError(404, "thumbnail_not_found", f"No thumbnail for scene: {scene_id}")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/scenes/{scene_id}/overlays/{name}.png")
def get_overlay(scene_id: str, name: str) -> FileResponse:
    """Serve a georeferenced RGBA overlay PNG (M3's spectral output).

    `RasterOverlay.url` in a /query response points here - M4's
    RasterOverlay.tsx loads it directly with L.imageOverlay(url, bounds).
    """
    storage = get_storage()
    try:
        path = storage.resolve_overlay(scene_id, name)
    except FileNotFoundError:
        raise ApiError(404, "overlay_not_found", f"No overlay '{name}' for scene: {scene_id}")
    return FileResponse(path, media_type="image/png")


@router.delete("/scenes/{scene_id}")
def delete_scene(scene_id: str) -> Response:
    """Remove a scene and its thumbnail from storage."""
    from fastapi.responses import Response as RawResponse

    storage = get_storage()
    try:
        storage.resolve_scene(scene_id)
    except FileNotFoundError:
        raise ApiError(404, "scene_not_found", f"Scene not found: {scene_id}")
    storage.delete_scene(scene_id)
    return RawResponse(status_code=204)
