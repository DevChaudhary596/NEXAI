"""Voice input route. M1 Day 10.

POST /api/v1/transcribe — multipart audio upload -> transcript text.
M4 records a clip in the browser (MediaRecorder), posts it here, and drops
the returned text straight into the chat input for hands-free querying.
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, UploadFile

from app.api.errors import ApiError
from app.core.config import get_settings
from app.core.schemas import TranscribeResponse
from app.services.asr import get_asr

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["transcribe"])

# Whatever a browser's MediaRecorder is likely to hand us. Extension is
# advisory only - faster-whisper (ffmpeg under the hood) sniffs real content.
_ALLOWED_SUFFIXES = (".webm", ".ogg", ".wav", ".mp3", ".m4a", ".mp4")


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscribeResponse:
    s = get_settings()
    filename = file.filename or "clip.webm"
    suffix = Path(filename).suffix.lower() or ".webm"
    if suffix not in _ALLOWED_SUFFIXES:
        raise ApiError(
            400, "invalid_file_type",
            f"Expected an audio clip ({', '.join(_ALLOWED_SUFFIXES)}), got: {filename}",
        )

    data = await file.read()
    # A hot mic left open is the failure mode this guards against, not a
    # legitimate long query - voice queries are short by nature.
    max_bytes = s.asr_max_seconds * 64_000  # ~64kbps opus/webm, generous ceiling
    if len(data) > max_bytes:
        raise ApiError(
            413, "payload_too_large",
            f"Recording exceeds the {s.asr_max_seconds}s limit.",
        )
    if not data:
        raise ApiError(400, "empty_recording", "No audio data received.")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(data)
        tmp.flush()
        try:
            text = get_asr().transcribe(tmp.name)
        except Exception as exc:
            log.exception("transcription failed")
            raise ApiError(500, "transcription_failed", f"transcription failed: {exc}") from exc

    if not text.strip():
        raise ApiError(422, "empty_transcript", "Could not make out any speech in that clip.")

    return TranscribeResponse(text=text.strip(), backend=get_asr().name)
