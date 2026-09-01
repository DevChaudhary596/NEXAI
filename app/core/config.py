"""Runtime configuration. Env-driven so the same image runs on M1's 4060 and
on M2-M6's CPU laptops with no code change.

M5 extends M1's base settings with upload/storage/tile configuration.
"""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "SATQUERY_", "extra": "ignore"}

    # ── VLM backend (M1) ──────────────────────────────────────────────────
    vlm_backend: str = Field(default="mock", pattern="^(mock|local|mlx)$")
    model_id: str = "Qwen/Qwen2-VL-7B-Instruct"
    mlx_model_id: str = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"
    adapter_path: str | None = None
    max_pixels: int = 256 * 28 * 28
    min_pixels: int = 64 * 28 * 28
    max_new_tokens: int = 384
    vram_ceiling_gb: float = 5.0
    rules_only_router: bool = False

    # ── M5: Storage & Upload ──────────────────────────────────────────────
    data_dir: str = Field(
        default=os.path.expanduser("~/.satquery/data"),
        description="Root directory for all persistent data (scenes, overlays, tiles).",
    )
    upload_max_mb: int = Field(
        default=500,
        description="Maximum upload size in megabytes. Sentinel-2 tiles can be ~200 MB.",
    )
    thumbnail_size: int = Field(
        default=256,
        description="Thumbnail longest edge in pixels.",
    )

    # ── M5: Tile Server ───────────────────────────────────────────────────
    tile_cache_dir: str | None = Field(
        default=None,
        description="Directory for cached tile PNGs. Falls back to data_dir/tile_cache.",
    )
    tile_size: int = Field(default=256, description="Output tile size in pixels.")

    # ── M5: Async Queue ───────────────────────────────────────────────────
    worker_concurrency: int = Field(
        default=1,
        description="Max concurrent background query workers. 1 on 8 GB hosts to avoid OOM.",
    )

    # ── Server ────────────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed CORS origins. M4 runs Next.js on port 3000.",
    )

    @property
    def scenes_dir(self) -> str:
        return os.path.join(self.data_dir, "scenes")

    @property
    def overlays_dir(self) -> str:
        return os.path.join(self.data_dir, "overlays")

    @property
    def thumbnails_dir(self) -> str:
        return os.path.join(self.data_dir, "thumbnails")

    @property
    def resolved_tile_cache_dir(self) -> str:
        return self.tile_cache_dir or os.path.join(self.data_dir, "tile_cache")


@lru_cache
def get_settings() -> Settings:
    return Settings()
