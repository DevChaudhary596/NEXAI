"""SatQuery AI — FastAPI application entry point. M5 owns this file.

Wires together:
  - M1's VLM lifespan warm-up
  - M1's /api/v1/query and /api/v1/route endpoints
  - M5's /api/v1/upload, /api/v1/tasks, /api/v1/tiles, /healthz
  - CORS for M4's Next.js frontend
  - Uniform error envelope for all /api/v1/* failures
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import health, query, tasks, tiles, upload
from app.core.config import get_settings
from app.core.schemas.common import CONTRACT_VERSION

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Load the VLM once at boot, not on the first request — otherwise the
    demo's first query eats a 40s model load in front of the judges."""
    s = get_settings()

    if s.vlm_backend in ("local", "mlx"):
        from app.services.vlm import get_vlm
        get_vlm()
        log.info("VLM warm")

    # Ensure storage directories exist
    from app.services.storage import get_storage
    get_storage()
    log.info("storage initialized at %s", s.data_dir)

    yield


app = FastAPI(
    title="SatQuery AI",
    lifespan=lifespan,
    version=CONTRACT_VERSION,
    description="Vision-language assistant for remote sensing (SIH26167).",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────
s = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=s.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Error handlers ────────────────────────────────────────────────────────
# Must be registered before routers so every /api/v1/* failure comes back
# in the ErrorResponse shape rather than FastAPI's default shapes.
register_error_handlers(app)

# ── Routers ───────────────────────────────────────────────────────────────
app.include_router(health.router)      # GET  /healthz
app.include_router(query.router)       # POST /api/v1/query, POST /api/v1/route
app.include_router(upload.router)      # POST /api/v1/upload, GET /api/v1/scenes
app.include_router(tasks.router)       # POST /api/v1/tasks, GET /api/v1/tasks/{id}
app.include_router(tiles.router)       # GET  /api/v1/tiles/{scene_id}/{z}/{x}/{y}.png
