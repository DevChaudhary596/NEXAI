"""Async task management routes. M5 Days 3-4.

POST /api/v1/tasks         — submit a query for async execution
GET  /api/v1/tasks/{id}    — poll task status
GET  /api/v1/tasks/{id}/result — get the QueryResponse when succeeded
GET  /api/v1/tasks         — list recent tasks
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.api.errors import ApiError
from app.core.schemas import QueryRequest, QueryResponse, TaskStatus
from app.services.task_queue import get_result, get_task, list_tasks, submit_task

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["tasks"])


@router.post("/tasks", response_model=TaskStatus, status_code=202)
async def create_task(req: QueryRequest) -> TaskStatus:
    """Submit a query for background processing.

    Returns immediately with a task_id. M4 polls GET /tasks/{id} until
    state is 'succeeded', then fetches the result.
    """
    return await submit_task(req)


@router.get("/tasks/{task_id}", response_model=TaskStatus)
def poll_task(task_id: str) -> TaskStatus:
    """Check the current status of an async task."""
    status = get_task(task_id)
    if status is None:
        raise ApiError(404, "task_not_found", f"No task with id: {task_id}")
    return status


@router.get("/tasks/{task_id}/result", response_model=QueryResponse)
def fetch_result(task_id: str) -> QueryResponse:
    """Retrieve the full QueryResponse for a completed task.

    Returns 404 if the task doesn't exist, 409 if it hasn't finished yet.
    """
    status = get_task(task_id)
    if status is None:
        raise ApiError(404, "task_not_found", f"No task with id: {task_id}")
    if status.state.value != "succeeded":
        raise ApiError(
            409, "task_not_ready",
            f"Task {task_id} is in state '{status.state.value}', not 'succeeded'.",
        )
    result = get_result(task_id)
    if result is None:
        raise ApiError(500, "result_missing", f"Task succeeded but result is missing: {task_id}")
    return result


@router.get("/tasks", response_model=list[TaskStatus])
def list_all_tasks(limit: int = 50) -> list[TaskStatus]:
    """List recent tasks, newest first."""
    return list_tasks(limit=limit)
