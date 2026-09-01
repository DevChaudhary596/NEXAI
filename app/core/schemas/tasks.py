"""Async job envelope. M5 owns the queue; M1 defines the shape."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import Field

from .common import Strict


class TaskState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TaskStatus(Strict):
    task_id: str
    state: TaskState
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    stage: str = Field(default="", max_length=120, description="Human-readable, shown in M4's chat")
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    result_url: str | None = Field(
        default=None, description="Set on SUCCEEDED; M4 GETs this for the QueryResponse."
    )
