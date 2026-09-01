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


def _run_query_sync(task_id: str, req: QueryRequest) -> None:
    """Runs in a worker thread. Updates the task status as it progresses."""
    try:
        _tasks[task_id].state = TaskState.RUNNING
        _tasks[task_id].stage = "routing query..."

        from app.services.orchestrator import handle_query

        _tasks[task_id].stage = "executing tool..."
        _tasks[task_id].progress = 0.3

        result = handle_query(req)

        _results[task_id] = result
        _tasks[task_id].state = TaskState.SUCCEEDED
        _tasks[task_id].progress = 1.0
        _tasks[task_id].stage = "complete"
        _tasks[task_id].result_url = f"/api/v1/tasks/{task_id}/result"
        log.info("task %s succeeded in %.0f ms", task_id, result.timings.total_ms)

    except Exception as exc:
        _tasks[task_id].state = TaskState.FAILED
        _tasks[task_id].error = f"{type(exc).__name__}: {exc}"
        _tasks[task_id].stage = "failed"
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

    loop = asyncio.get_event_loop()
    loop.run_in_executor(_get_executor(), _run_query_sync, task_id, req)

    log.info("task %s submitted (prompt=%r)", task_id, req.prompt[:50])
    return status


def get_task(task_id: str) -> TaskStatus | None:
    """Get the current status of a task."""
    return _tasks.get(task_id)


def get_result(task_id: str) -> QueryResponse | None:
    """Get the result of a completed task."""
    return _results.get(task_id)


def list_tasks(limit: int = 50) -> list[TaskStatus]:
    """List recent tasks, newest first."""
    return sorted(
        _tasks.values(),
        key=lambda t: t.created_at,
        reverse=True,
    )[:limit]
