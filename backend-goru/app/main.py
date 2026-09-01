from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import health, query
from app.config import get_settings
from app.core.schemas.common import CONTRACT_VERSION

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Load the VLM once at boot, not on the first request - otherwise the
    demo's first query eats a 40 s model load in front of the judges."""
    if get_settings().vlm_backend in ("local", "mlx"):
        from app.services.vlm import get_vlm

        get_vlm()
        logging.getLogger(__name__).info("VLM warm")
    yield


app = FastAPI(
    title="SatQuery AI",
    lifespan=lifespan,
    version=CONTRACT_VERSION,
    description="Vision-language assistant for remote sensing (SIH26167).",
)

# M4 runs Next.js on 3000; the wildcard stays out of the committed config.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Must be registered before the routers so every /api/v1/* failure comes back
# in the ErrorResponse shape rather than FastAPI's two default ones.
register_error_handlers(app)

app.include_router(health.router)
app.include_router(query.router)
