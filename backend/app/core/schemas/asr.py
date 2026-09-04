"""POST /api/v1/transcribe contract. M1 Day 10."""
from __future__ import annotations

from pydantic import Field

from .common import Strict


class TranscribeResponse(Strict):
    text: str = Field(description="Transcript. M4 drops this straight into the chat input.")
    backend: str = Field(description="'mock' or 'local' - which ASR backend produced this.")
