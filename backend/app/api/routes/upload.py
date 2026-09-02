"""Upload & scene management routes. M5 Days 1-2.

POST /api/v1/upload — multipart GeoTIFF upload with thumbnail generation.
GET  /api/v1/scenes — list all uploaded scenes.
GET  /api/v1/scenes/{scene_id}/thumbnail — serve the JPEG thumbnail.
DELETE /api/v1/scenes/{scene_id} — remove a scene.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse, Response

from app.api.errors import ApiError
from app.core.config import get_settings
from app.core.schemas import SceneListItem, SceneListResponse, UploadResponse
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
