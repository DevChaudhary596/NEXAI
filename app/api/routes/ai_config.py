from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from app.api.errors import ApiError
from app.core.auth import optional_principal, require_principal
from app.core.config import get_settings
from app.services.vlm import get_vlm, reset_vlm

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


class AIStatusResponse(BaseModel):
    backend: str
    active_backend_name: str
    groq_configured: bool
    vision_model: str
    text_model: str


class GroqKeyRequest(BaseModel):
    api_key: str = Field(min_length=10, max_length=200, description="Groq API key (starts with gsk_)")


class GroqKeyResponse(BaseModel):
    status: str
    backend: str
    message: str
    vision_model: str
    text_model: str


def _update_env_file(key: str) -> None:
    """Safely persist or update SATQUERY_GROQ_API_KEY in backend/.env for local dev."""
    s = get_settings()
    if s.environment == "production":
        log.info("Skipping .env disk write in production runtime.")
        return

    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    lines = []
    if env_path.exists():
        try:
            lines = env_path.read_text(encoding="utf-8").splitlines()
        except Exception as exc:
            log.warning("Could not read .env: %s", exc)

    found_key = False
    found_backend = False
    new_lines = []
    for line in lines:
        if line.startswith("SATQUERY_GROQ_API_KEY=") or line.startswith("GROQ_API_KEY="):
            new_lines.append(f"SATQUERY_GROQ_API_KEY={key}")
            found_key = True
        elif line.startswith("SATQUERY_VLM_BACKEND="):
            new_lines.append("SATQUERY_VLM_BACKEND=groq")
            found_backend = True
        else:
            new_lines.append(line)

    if not found_key:
        new_lines.append(f"SATQUERY_GROQ_API_KEY={key}")
    if not found_backend:
        new_lines.append("SATQUERY_VLM_BACKEND=groq")

    try:
        env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        log.info("Persisted Groq key to %s", env_path)
    except Exception as exc:
        log.warning("Failed to write to .env file: %s", exc)


@router.get("/status", response_model=AIStatusResponse)
def get_ai_status() -> AIStatusResponse:
    s = get_settings()
    has_key = bool(
        s.groq_api_key
        or os.getenv("SATQUERY_GROQ_API_KEY")
        or os.getenv("GROQ_API_KEY")
    )
    current_vlm = get_vlm()
    return AIStatusResponse(
        backend=s.vlm_backend,
        active_backend_name=current_vlm.name,
        groq_configured=has_key,
        vision_model=s.groq_model,
        text_model=s.groq_text_model,
    )


@router.post("/groq-key", response_model=GroqKeyResponse)
async def configure_groq_key(
    payload: GroqKeyRequest,
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> GroqKeyResponse:
    s = get_settings()
    if s.environment == "production":
        raise ApiError(
            403,
            "configuration_locked",
            "Remote AI key modification via API is disabled in production. Set SATQUERY_GROQ_API_KEY in your deployment environment variables.",
        )

    key = payload.api_key.strip()
    if not key:
        raise ApiError(400, "invalid_key", "API key cannot be empty.")

    # Validate against Groq
    try:
        from groq import Groq

        test_client = Groq(api_key=key)
        # Fast validation: list models
        test_client.models.list()
    except Exception as exc:
        log.warning("Groq key validation failed: %s", exc)
        raise ApiError(400, "invalid_groq_key", f"Could not authenticate with Groq: {exc}") from exc

    # Activate in current process
    os.environ["GROQ_API_KEY"] = key
    os.environ["SATQUERY_GROQ_API_KEY"] = key
    os.environ["SATQUERY_VLM_BACKEND"] = "groq"

    _update_env_file(key)

    get_settings.cache_clear()
    reset_vlm()

    active_vlm = get_vlm()
    log.info("Groq VLM activated: %s", active_vlm.name)

    return GroqKeyResponse(
        status="success",
        backend=active_vlm.name,
        message="Groq API key activated successfully. Low-latency multimodal vision and reasoning are active.",
        vision_model=s.groq_model,
        text_model=s.groq_text_model,
    )


@router.delete("/groq-key")
async def remove_groq_key(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    s = get_settings()
    if s.environment == "production":
        raise ApiError(
            403,
            "configuration_locked",
            "Remote AI key modification via API is disabled in production.",
        )

    os.environ.pop("GROQ_API_KEY", None)
    os.environ.pop("SATQUERY_GROQ_API_KEY", None)
    os.environ["SATQUERY_VLM_BACKEND"] = "mock"

    get_settings.cache_clear()
    reset_vlm()

    return {"status": "success", "message": "Groq API key removed from active session."}

