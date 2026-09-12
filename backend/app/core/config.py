"""Runtime configuration. Env-driven so the same image runs on M1's 4060 and
on M2-M6's CPU laptops with no code change.

M5 extends M1's base settings with upload/storage/tile configuration.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings

log = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = {
        "env_prefix": "SATQUERY_",
        "extra": "ignore",
        "env_file": [".env", "backend/.env"],
        "env_file_encoding": "utf-8",
    }

    # ── Environment / production guards ──────────────────────────────────
    # Production never silently falls back to a local SQLite database, mock
    # identity, or filesystem storage. Those fallbacks are useful for an
    # isolated developer test run only and are rejected by `validate_runtime`.
    environment: str = Field(default="development", pattern="^(development|test|production)$")
    testing: bool = False

    # ── Identity and tenant data ──────────────────────────────────────────
    firebase_project_id: str | None = None
    # A JSON service-account document or a path to one. It is intentionally
    # read from an environment variable / secret manager, never committed.
    firebase_credentials: str | None = None
    database_url: str | None = Field(
        default=None,
        description="PostgreSQL URL for production tenant/application data.",
    )

    # ── S3-compatible object storage ─────────────────────────────────────
    # Cloudflare R2 is S3-compatible: set endpoint_url to the R2 endpoint;
    # AWS S3 works by leaving endpoint_url unset.
    object_storage_bucket: str | None = None
    object_storage_prefix: str = "satquery"
    object_storage_region: str | None = None
    object_storage_endpoint_url: str | None = None
    object_storage_access_key_id: str | None = None
    object_storage_secret_access_key: str | None = None

    # ── VLM backend (M1) ──────────────────────────────────────────────────
    vlm_backend: str = Field(default="mock", pattern="^(mock|local|mlx|groq)$")
    model_id: str = "Qwen/Qwen2-VL-7B-Instruct"
    mlx_model_id: str = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"
    adapter_path: str | None = None
    groq_api_key: str | None = Field(
        default_factory=lambda: os.getenv("SATQUERY_GROQ_API_KEY") or os.getenv("GROQ_API_KEY"),
        description="Groq API key for cloud LLM and vision reasoning.",
    )
    groq_model: str = Field(
        default="qwen/qwen3.8-27b",
        description="Groq multimodal vision model for satellite scene reasoning.",
    )
    groq_text_model: str = Field(
        default="openai/gpt-oss-120b",
        description="Groq high-intelligence 120B parameter model for deep reasoning and reports.",
    )
    max_pixels: int = 256 * 28 * 28
    min_pixels: int = 64 * 28 * 28
    max_new_tokens: int = 1200
    vram_ceiling_gb: float = 5.0
    rules_only_router: bool = False

    # ── Multi-turn memory (M1 Day 8) ────────────────────────────────────────
    max_history_turns: int = Field(
        default=8,
        description=(
            "Prior user/assistant turns kept as text-only context on each "
            "request. Bounded so a long chat can't grow the prompt (and VRAM) "
            "without limit - only the current turn ever carries the image."
        ),
    )

    # ── ASR / voice input (M1 Day 10) ───────────────────────────────────────
    asr_backend: str = Field(default="mock", pattern="^(mock|local)$")
    asr_model_size: str = Field(
        default="base",
        description="faster-whisper model size for the local ASR backend (tiny/base/small/...).",
    )
    asr_max_seconds: int = Field(
        default=60, description="Reject recordings longer than this - a runaway hot-mic guard."
    )

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

    # ── Watches (AOI monitoring / alerts) ────────────────────────────────
    watch_check_interval_minutes: int = Field(
        default=60,
        description="How often the background scheduler re-checks a watch for a new Sentinel-2 pass.",
    )
    watches_db_path: str | None = Field(
        default=None,
        description="SQLite file for watches/alerts. Falls back to data_dir/watches.db.",
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

    @property
    def resolved_watches_db_path(self) -> str:
        return self.watches_db_path or os.path.join(self.data_dir, "watches.db")

    def validate_runtime(self) -> None:
        """Fail closed when a deployment is marked production.

        This lets contributors run the existing local GeoTIFF tests without
        cloud credentials, while preventing a Vercel/production deployment
        from accidentally exposing shared data through development fallbacks.
        """
        if self.environment != "production":
            return

        missing: list[str] = []
        if self.vlm_backend == "mock":
            missing.append("SATQUERY_VLM_BACKEND (must be mlx, local, or groq)")
        if self.vlm_backend == "groq" and not self.groq_api_key:
            missing.append("SATQUERY_GROQ_API_KEY")
        if not self.firebase_project_id:
            missing.append("SATQUERY_FIREBASE_PROJECT_ID")
        if not self.firebase_credentials:
            missing.append("SATQUERY_FIREBASE_CREDENTIALS")
        if not self.database_url or not self.database_url.startswith(("postgresql://", "postgres://")):
            missing.append("SATQUERY_DATABASE_URL (PostgreSQL)")
        if not self.object_storage_bucket:
            missing.append("SATQUERY_OBJECT_STORAGE_BUCKET")
        if not self.object_storage_access_key_id:
            missing.append("SATQUERY_OBJECT_STORAGE_ACCESS_KEY_ID")
        if not self.object_storage_secret_access_key:
            missing.append("SATQUERY_OBJECT_STORAGE_SECRET_ACCESS_KEY")
        if missing:
            raise RuntimeError(
                "SOLEN production configuration is incomplete: " + ", ".join(missing)
            )

        if self.cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]:
            log.warning(
                "Production runtime warning: SATQUERY_CORS_ORIGINS is using local default origins %s. "
                "Set SATQUERY_CORS_ORIGINS to include your production frontend domain.",
                self.cors_origins,
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
