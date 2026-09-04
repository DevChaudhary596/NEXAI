from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.core.schemas.common import CONTRACT_VERSION
from app.services.vlm import detect_accelerator, get_vlm, select_attn_implementation

router = APIRouter(tags=["ops"])


@router.get("/healthz")
def healthz() -> dict[str, object]:
    """M6's harness polls this; M4 uses it to show the backend badge."""
    s = get_settings()
    accel = detect_accelerator()
    payload: dict[str, object] = {
        "status": "ok",
        "contract_version": CONTRACT_VERSION,
        "vlm_backend": s.vlm_backend,
        # Which weights are actually live depends on the backend, so report the
        # one in use rather than always the CUDA id.
        "model_id": s.mlx_model_id if s.vlm_backend == "mlx" else s.model_id,
        "adapter_loaded": bool(s.adapter_path),
        "max_pixels": s.max_pixels,
        "accelerator": accel,
    }
    if accel == "cuda":
        import torch

        payload["cuda"] = True
        payload["gpu"] = torch.cuda.get_device_name(0)
        payload["capability"] = ".".join(map(str, torch.cuda.get_device_capability()))
        payload["attn"] = select_attn_implementation()
    elif accel == "mlx":
        import mlx.core as mx

        payload["cuda"] = False
        payload["gpu"] = "Apple Silicon (Metal)"
        # Unified memory: this is shared with macOS, not dedicated VRAM.
        payload["active_mem_gb"] = round(mx.get_active_memory() / 1024**3, 3)
    else:
        payload["cuda"] = False

    if s.vlm_backend != "mock":
        payload["peak_vram_gb"] = get_vlm().peak_vram_gb()
    return payload
