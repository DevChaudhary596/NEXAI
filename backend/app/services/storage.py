"""File storage service. M5 Days 1-2.

Owns the on-disk layout for uploaded GeoTIFFs, thumbnails, and overlays.
Every other service resolves a scene_id through here — no one touches the
filesystem directly.

Layout:
    data_dir/
    ├── scenes/{scene_id}/scene.tif
    ├── thumbnails/{scene_id}.jpg
    └── overlays/{scene_id}/{overlay_name}.png
"""
from __future__ import annotations

import logging
import os
import json
import hashlib
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_settings

log = logging.getLogger(__name__)


@dataclass
class SceneMeta:
    """Metadata returned after a successful upload."""

    scene_id: str
    filename: str
    size_bytes: int
    thumbnail_url: str
    uploaded_at: str
    bounds: list[float] | None = None
    crs: str | None = None
    resolution_m: float | None = None
    band_count: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class S3ObjectStore:
    """S3/R2 object store. Filesystem copies are an ephemeral compute cache."""

    def __init__(self) -> None:
        s = get_settings()
        if not s.object_storage_bucket:
            raise RuntimeError("object storage bucket is not configured")
        try:
            import boto3
        except ImportError as exc:  # pragma: no cover - production dependency
            raise RuntimeError("boto3 is required for S3/R2 object storage") from exc
        self.bucket = s.object_storage_bucket
        self.prefix = s.object_storage_prefix.strip("/")
        self.client = boto3.client(
            "s3", region_name=s.object_storage_region,
            endpoint_url=s.object_storage_endpoint_url,
            aws_access_key_id=s.object_storage_access_key_id,
            aws_secret_access_key=s.object_storage_secret_access_key,
        )

    def key(self, suffix: str) -> str:
        return f"{self.prefix}/{suffix}" if self.prefix else suffix

    def put_bytes(self, suffix: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=self.key(suffix), Body=data, ContentType=content_type)

    def download(self, suffix: str, destination: Path) -> bool:
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            self.client.download_file(self.bucket, self.key(suffix), str(destination))
            return True
        except Exception as exc:
            log.warning("could not retrieve %s from object storage: %s", suffix, exc)
            return False

    def delete_prefix(self, suffix_prefix: str) -> None:
        prefix = self.key(suffix_prefix)
        paginator = self.client.get_paginator("list_objects_v2")
        objects = [{"Key": obj["Key"]} for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix) for obj in page.get("Contents", [])]
        for start in range(0, len(objects), 1000):
            self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objects[start:start + 1000], "Quiet": True})


class StorageService:
    """Singleton-friendly file storage abstraction."""

    def __init__(self) -> None:
        s = get_settings()
        self._scenes_dir = Path(s.scenes_dir)
        self._thumbs_dir = Path(s.thumbnails_dir)
        self._overlays_dir = Path(s.overlays_dir)
        self._thumb_size = s.thumbnail_size
        self._object_store = S3ObjectStore() if s.object_storage_bucket else None

        # Ensure base directories exist
        for d in (self._scenes_dir, self._thumbs_dir, self._overlays_dir):
            d.mkdir(parents=True, exist_ok=True)

    # ── Upload ────────────────────────────────────────────────────────────

    def mint_scene_id(self) -> str:
        """Generate a unique scene ID. UUID4 prefix + timestamp suffix."""
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        return f"{uuid.uuid4().hex[:12]}_{ts}"

    def save_scene(self, scene_id: str, data: bytes, filename: str) -> Path:
        """Persist raw GeoTIFF bytes to disk."""
        scene_dir = self._scenes_dir / scene_id
        scene_dir.mkdir(parents=True, exist_ok=True)
        dest = scene_dir / "scene.tif"
        dest.write_bytes(data)
        provenance = {
            "scene_id": scene_id,
            "sha256": hashlib.sha256(data).hexdigest(),
            "source_filename": filename,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "source_type": "user_upload",
            "capture_date": None,
            "source_item_id": None,
        }
        (scene_dir / "provenance.json").write_text(json.dumps(provenance, sort_keys=True), encoding="utf-8")
        if self._object_store:
            self._object_store.put_bytes(f"scenes/{scene_id}/scene.tif", data, "image/tiff")
            self._object_store.put_bytes(f"scenes/{scene_id}/provenance.json", json.dumps(provenance, sort_keys=True).encode(), "application/json")
        log.info("saved scene %s (%d bytes) → %s", scene_id, len(data), dest)
        return dest

    def update_scene_provenance(self, scene_id: str, **values: Any) -> None:
        path = self._scenes_dir / scene_id / "provenance.json"
        current = self.get_scene_provenance(scene_id)
        current.update({key: value for key, value in values.items() if value is not None})
        path.write_text(json.dumps(current, sort_keys=True), encoding="utf-8")
        if self._object_store:
            self._object_store.put_bytes(f"scenes/{scene_id}/provenance.json", json.dumps(current, sort_keys=True).encode(), "application/json")

    def get_scene_provenance(self, scene_id: str) -> dict[str, Any]:
        path = self._scenes_dir / scene_id / "provenance.json"
        if not path.exists() and self._object_store:
            self._object_store.download(f"scenes/{scene_id}/provenance.json", path)
        if not path.exists():
            # Legacy/manual fixtures written before the provenance manifest
            # existed are recovered from the actual raster bytes, never from
            # invented metadata. New uploads always take the write path above.
            scene = self.resolve_scene(scene_id)
            recovered = {
                "scene_id": scene_id,
                "sha256": hashlib.sha256(scene.read_bytes()).hexdigest(),
                "source_filename": scene.name,
                "ingested_at": datetime.fromtimestamp(scene.stat().st_mtime, tz=timezone.utc).isoformat(),
                "source_type": "legacy_local_scene",
                "capture_date": None,
                "source_item_id": None,
            }
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(recovered, sort_keys=True), encoding="utf-8")
            return recovered
        return json.loads(path.read_text(encoding="utf-8"))

    def generate_thumbnail(self, scene_id: str, scene_path: Path) -> Path:
        """Create a JPEG thumbnail from the GeoTIFF's display bands."""
        thumb_path = self._thumbs_dir / f"{scene_id}.jpg"

        try:
            import numpy as np
            import rasterio
            from PIL import Image

            with rasterio.open(scene_path) as src:
                # 4+ band scenes follow this app's Sentinel-2 convention
                # (gis.py: 1=Blue, 2=Green, 3=Red, 4=NIR — see
                # satellite_fetch.py), so pick R,G,B by that meaning rather
                # than assuming the first three bands are already in
                # display order. 3-or-fewer-band scenes are used as-is.
                if src.count >= 4:
                    band_indices = [3, 2, 1]
                else:
                    band_indices = list(range(1, min(3, src.count) + 1))
                bands = len(band_indices)
                data = src.read(band_indices)

                # Normalize to 0-255
                arr = np.moveaxis(data, 0, -1)  # (H, W, C)
                if arr.dtype != np.uint8:
                    for c in range(arr.shape[2]):
                        band = arr[:, :, c].astype(float)
                        p2, p98 = np.percentile(band[band > 0], [2, 98]) if band.any() else (0, 1)
                        if p98 > p2:
                            band = np.clip((band - p2) / (p98 - p2) * 255, 0, 255)
                        arr[:, :, c] = band.astype(np.uint8)
                    arr = arr.astype(np.uint8)

                # If single band, convert to grayscale RGB
                if bands == 1:
                    arr = np.repeat(arr, 3, axis=2)

                img = Image.fromarray(arr)
                img.thumbnail((self._thumb_size, self._thumb_size))
                img.save(thumb_path, "JPEG", quality=85)
                log.info("thumbnail generated: %s", thumb_path)

        except ImportError:
            log.warning("rasterio/PIL not available; creating placeholder thumbnail")
            from PIL import Image

            img = Image.new("RGB", (self._thumb_size, self._thumb_size), (40, 40, 40))
            img.save(thumb_path, "JPEG")

        except Exception:
            log.exception("thumbnail generation failed for %s", scene_id)
            from PIL import Image

            img = Image.new("RGB", (self._thumb_size, self._thumb_size), (80, 0, 0))
            img.save(thumb_path, "JPEG")

        if self._object_store and thumb_path.exists():
            self._object_store.put_bytes(f"thumbnails/{scene_id}.jpg", thumb_path.read_bytes(), "image/jpeg")
        return thumb_path

    def extract_metadata(self, scene_path: Path) -> dict[str, Any]:
        """Extract CRS, bounds, resolution, band count from a GeoTIFF.

        `bounds` is always returned in EPSG:4326 (the API contract UploadResponse
        promises this), regardless of the file's native CRS — every existing
        test fixture happens to already be EPSG:4326 so this went unnoticed,
        but a projected-CRS source (e.g. Sentinel-2's per-UTM-zone COGs) would
        otherwise come back as raw UTM metres, which the frontend would then
        treat as degrees.
        """
        try:
            import rasterio
            from rasterio.warp import transform_bounds

            with rasterio.open(scene_path) as src:
                if src.crs and str(src.crs) != "EPSG:4326":
                    bounds = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds))
                else:
                    bounds = list(src.bounds)
                return {
                    "crs": str(src.crs) if src.crs else None,
                    "bounds": bounds,
                    "resolution_m": src.res[0] if src.res else None,
                    "band_count": src.count,
                    "width": src.width,
                    "height": src.height,
                    "driver": src.driver,
                }
        except ImportError:
            log.warning("rasterio not available; returning empty metadata")
            return {"crs": None, "bounds": None, "mock": True}
        except Exception:
            log.exception("metadata extraction failed for %s", scene_path)
            return {"crs": None, "bounds": None, "error": True}

    # ── Resolve ───────────────────────────────────────────────────────────

    def resolve_scene(self, scene_id: str) -> Path:
        """Return the path to the scene GeoTIFF. Raises FileNotFoundError
        if the scene was never uploaded (mock mode tolerates this)."""
        path = self._scenes_dir / scene_id / "scene.tif"
        if not path.exists() and self._object_store:
            self._object_store.download(f"scenes/{scene_id}/scene.tif", path)
        if not path.exists():
            # Fallback: check flat naming from M1's convention
            flat = self._scenes_dir / f"{scene_id}.tif"
            if flat.exists():
                return flat
            raise FileNotFoundError(f"scene not found: {scene_id}")
        return path

    def get_thumbnail_path(self, scene_id: str) -> Path | None:
        """Return thumbnail path or None if it doesn't exist."""
        path = self._thumbs_dir / f"{scene_id}.jpg"
        if not path.exists() and self._object_store:
            self._object_store.download(f"thumbnails/{scene_id}.jpg", path)
        return path if path.exists() else None

    def list_scenes(self) -> list[SceneMeta]:
        """List all uploaded scenes with their metadata."""
        scenes = []
        if not self._scenes_dir.exists():
            return scenes
        for entry in sorted(self._scenes_dir.iterdir(), key=lambda e: e.stat().st_mtime if e.exists() else 0, reverse=True):
            if entry.is_dir():
                scene_file = entry / "scene.tif"
                if scene_file.exists():
                    meta = self.extract_metadata(scene_file)
                    prov = self.get_scene_provenance(entry.name)
                    filename = prov.get("source_filename")
                    if not filename or filename == "scene.tif":
                        bounds = meta.get("bounds")
                        if bounds and len(bounds) == 4:
                            center_lon = (bounds[0] + bounds[2]) / 2
                            center_lat = (bounds[1] + bounds[3]) / 2
                            lat_label = f"{abs(center_lat):.2f}°{'N' if center_lat >= 0 else 'S'}"
                            lon_label = f"{abs(center_lon):.2f}°{'E' if center_lon >= 0 else 'W'}"
                            filename = f"Sentinel-2_{lat_label}_{lon_label}.tif"
                        else:
                            filename = f"Scene_{entry.name[:8]}.tif"
                    scenes.append(SceneMeta(
                        scene_id=entry.name,
                        filename=filename,
                        size_bytes=scene_file.stat().st_size,
                        thumbnail_url=f"/api/v1/scenes/{entry.name}/thumbnail",
                        uploaded_at=datetime.fromtimestamp(
                            scene_file.stat().st_mtime, tz=timezone.utc
                        ).isoformat(),
                        bounds=meta.get("bounds"),
                        crs=meta.get("crs"),
                        resolution_m=meta.get("resolution_m"),
                        band_count=meta.get("band_count"),
                    ))
        return scenes

    def delete_scene(self, scene_id: str) -> bool:
        """Remove a scene and its thumbnail."""
        scene_dir = self._scenes_dir / scene_id
        if scene_dir.exists():
            shutil.rmtree(scene_dir)
        thumb = self._thumbs_dir / f"{scene_id}.jpg"
        if thumb.exists():
            thumb.unlink()
        if self._object_store:
            self._object_store.delete_prefix(f"scenes/{scene_id}/")
            self._object_store.delete_prefix(f"thumbnails/{scene_id}.jpg")
            self._object_store.delete_prefix(f"overlays/{scene_id}/")
        log.info("deleted scene %s", scene_id)
        return True

    # ── Overlays ──────────────────────────────────────────────────────────

    def save_overlay(self, scene_id: str, name: str, data: bytes) -> Path:
        """Save a raster overlay (RGBA PNG from M3's spectral output)."""
        overlay_dir = self._overlays_dir / scene_id
        overlay_dir.mkdir(parents=True, exist_ok=True)
        dest = overlay_dir / f"{name}.png"
        dest.write_bytes(data)
        if self._object_store:
            self._object_store.put_bytes(f"overlays/{scene_id}/{name}.png", data, "image/png")
        return dest

    def resolve_overlay(self, scene_id: str, name: str) -> Path:
        path = self._overlays_dir / scene_id / f"{name}.png"
        if not path.exists() and self._object_store:
            self._object_store.download(f"overlays/{scene_id}/{name}.png", path)
        if not path.exists():
            raise FileNotFoundError(f"overlay not found: {scene_id}/{name}")
        return path


# ── Singleton ─────────────────────────────────────────────────────────────
_storage: StorageService | None = None


def get_storage() -> StorageService:
    global _storage
    if _storage is None:
        _storage = StorageService()
    return _storage
