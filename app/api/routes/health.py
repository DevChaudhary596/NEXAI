"""Health check endpoint. M5 adaptation of M1's health route.

Simplified version that works without VLM imports on CPU-only hosts.
M6's harness polls this; M4 uses it for the backend status badge.
"""
from __future__ import annotations

import time

from fastapi import APIRouter

from app.core.config import get_settings
from app.core.schemas.common import CONTRACT_VERSION

router = APIRouter(tags=["ops"])
_boot_time = time.time()


@router.get("/healthz")
def healthz() -> dict[str, object]:
    """Lightweight health check. Always responds, even before VLM loads."""
    s = get_settings()
    uptime = round(time.time() - _boot_time, 1)

    payload: dict[str, object] = {
        "status": "ok",
        "contract_version": CONTRACT_VERSION,
        "vlm_backend": s.vlm_backend,
        "uptime_s": uptime,
    }

    # Accelerator detection (safe import)
    try:
        from app.services.vlm import detect_accelerator

        accel = detect_accelerator()
        payload["accelerator"] = accel

        if accel == "cuda":
            import torch

            payload["cuda"] = True
            payload["gpu"] = torch.cuda.get_device_name(0)
        elif accel == "mlx":
            payload["cuda"] = False
            payload["gpu"] = "Apple Silicon (Metal)"
        else:
            payload["cuda"] = False
    except Exception:
        payload["accelerator"] = "cpu"
        payload["cuda"] = False

    return payload
