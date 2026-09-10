"""Speech-to-text backends. M1 Day 10.

Same split as vlm.py and for the same reason: `MockASR` needs no model and no
audio libs, so the /api/v1/transcribe route and the frontend mic button are
fully exercisable on a CPU laptop / in CI. `LocalWhisperASR` runs faster-whisper
on CPU (int8) - no GPU needed for ASR at all, so it never competes with the
VLM for the one card's VRAM budget.
"""
from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)


class ASRBackend:
    name: str = "base"

    def transcribe(self, audio_path: str | Path) -> str:
        raise NotImplementedError


class MockASR(ASRBackend):
    """No-model stand-in. Returns a fixed, obviously-fake transcript so a
    caller can tell at a glance it isn't real speech-to-text - same contract
    MockVLM follows for the VLM side."""

    name = "mock"

    def transcribe(self, audio_path: str | Path) -> str:
        return "how many ships are in this scene"


class LocalWhisperASR(ASRBackend):
    """faster-whisper on CPU, int8 quantized. Deliberately CPU-only: Whisper's
    compute cost is trivial next to the VLM's, and keeping it off the GPU
    means voice queries never eat into the 5 GB VRAM ceiling Day 14 audits."""

    name = "local"

    def __init__(self, settings: Settings | None = None):
        from faster_whisper import WhisperModel

        self.s = settings or get_settings()
        log.info("loading faster-whisper %s (CPU, int8)", self.s.asr_model_size)
        self._model = WhisperModel(self.s.asr_model_size, device="cpu", compute_type="int8")

    def transcribe(self, audio_path: str | Path) -> str:
        segments, _info = self._model.transcribe(str(audio_path), beam_size=5)
        return " ".join(seg.text.strip() for seg in segments).strip()


_backend: ASRBackend | None = None


def get_asr() -> ASRBackend:
    global _backend
    if _backend is None:
        s = get_settings()
        if s.asr_backend == "local":
            try:
                _backend = LocalWhisperASR(s)
            except ImportError as exc:
                log.warning("faster-whisper not installed; falling back to MockASR: %s", exc)
                _backend = MockASR()
        else:
            _backend = MockASR()
        log.info("ASR backend: %s", _backend.name)
    return _backend


def reset_asr() -> None:
    """Test hook."""
    global _backend
    _backend = None
