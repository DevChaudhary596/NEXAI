"""In-memory async task queue. M5 Days 3-4.

Wraps M1's synchronous `handle_query` in a background worker so M4 can submit
long-running queries and poll for results without blocking the HTTP connection.

No Redis, no Celery — an in-memory dict is sufficient for the demo. The queue
survives within a process but not across restarts, which is fine for SIH.

Task lifecycle: PENDING → RUNNING → SUCCEEDED / FAILED
"""
from __future__ import annotations

import asyncio
import logging
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.schemas import QueryRequest, QueryResponse, TaskState, TaskStatus

log = logging.getLogger(__name__)

# ── In-memory stores ──────────────────────────────────────────────────────
_tasks: dict[str, TaskStatus] = {}
_results: dict[str, QueryResponse] = {}
_executor: ThreadPoolExecutor | None = None


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        s = get_settings()
        _executor = ThreadPoolExecutor(
            max_workers=s.worker_concurrency,
            thread_name_prefix="satquery-worker",
        )
    return _executor


import json
import os
from pathlib import Path

_TASK_DIR = Path("data/tasks")


def _save_task_disk(task_id: str, status: TaskStatus) -> None:
    try:
        _TASK_DIR.mkdir(parents=True, exist_ok=True)
        with open(_TASK_DIR / f"{task_id}.json", "w", encoding="utf-8") as f:
            f.write(status.model_dump_json())
    except Exception as e:
        log.warning("Could not persist task %s to disk: %s", task_id, e)


def _save_result_disk(task_id: str, result: QueryResponse) -> None:
    try:
        _TASK_DIR.mkdir(parents=True, exist_ok=True)
        with open(_TASK_DIR / f"{task_id}_result.json", "w", encoding="utf-8") as f:
            f.write(result.model_dump_json())
    except Exception as e:
        log.warning("Could not persist result %s to disk: %s", task_id, e)


def _run_query_sync(task_id: str, req: QueryRequest) -> None:
    """Runs in a worker thread. Updates the task status as it progresses."""
    try:
        _tasks[task_id].state = TaskState.RUNNING
        _tasks[task_id].stage = "routing query..."
        _save_task_disk(task_id, _tasks[task_id])

        from app.services.orchestrator import handle_query

        _tasks[task_id].stage = "executing tool..."
        _tasks[task_id].progress = 0.3
        _save_task_disk(task_id, _tasks[task_id])

        result = handle_query(req)

        _results[task_id] = result
        _save_result_disk(task_id, result)

        _tasks[task_id].state = TaskState.SUCCEEDED
        _tasks[task_id].progress = 1.0
        _tasks[task_id].stage = "complete"
        _tasks[task_id].result_url = f"/api/v1/tasks/{task_id}/result"
        _save_task_disk(task_id, _tasks[task_id])
        log.info("task %s succeeded in %.0f ms", task_id, result.timings.total_ms)

    except Exception as exc:
        _tasks[task_id].state = TaskState.FAILED
        _tasks[task_id].error = f"{type(exc).__name__}: {exc}"
        _tasks[task_id].stage = "failed"
        _save_task_disk(task_id, _tasks[task_id])
        log.exception("task %s failed", task_id)


async def submit_task(req: QueryRequest) -> TaskStatus:
    """Submit a query for background execution. Returns immediately."""
    task_id = uuid.uuid4().hex[:16]

    status = TaskStatus(
        task_id=task_id,
        state=TaskState.PENDING,
        stage="queued",
        created_at=datetime.now(timezone.utc),
    )
    _tasks[task_id] = status
    _save_task_disk(task_id, status)

    loop = asyncio.get_event_loop()
    loop.run_in_executor(_get_executor(), _run_query_sync, task_id, req)

    log.info("task %s submitted (prompt=%r)", task_id, req.prompt[:50])
    return status


def get_task(task_id: str) -> TaskStatus | None:
    """Get the current status of a task."""
    if task_id in _tasks:
        return _tasks[task_id]
    p = _TASK_DIR / f"{task_id}.json"
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                loaded = TaskStatus.model_validate_json(f.read())
                _tasks[task_id] = loaded
                return loaded
        except Exception:
            pass
    return None


def get_result(task_id: str) -> QueryResponse | None:
    """Get the result of a completed task."""
    if task_id in _results:
        return _results[task_id]
    p = _TASK_DIR / f"{task_id}_result.json"
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                loaded = QueryResponse.model_validate_json(f.read())
                _results[task_id] = loaded
                return loaded
        except Exception:
            pass
    return None


def list_tasks(limit: int = 50) -> list[TaskStatus]:
    """List recent tasks, newest first."""
    # Also load from disk if present
    if _TASK_DIR.exists():
        for fpath in _TASK_DIR.glob("*.json"):
            if not fpath.name.endswith("_result.json"):
                tid = fpath.stem
                if tid not in _tasks:
                    get_task(tid)

    return sorted(
        _tasks.values(),
        key=lambda t: t.created_at,
        reverse=True,
    )[:limit]
