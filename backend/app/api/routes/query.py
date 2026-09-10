from __future__ import annotations

import logging

from fastapi import APIRouter

from app.api.errors import ApiError
from app.core.schemas import QueryRequest, QueryResponse, RoutingDecision
from app.services.orchestrator import SceneNotFound, handle_query
from app.services.router import IntentRouter
from app.services.vlm import get_vlm

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["query"])


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest) -> QueryResponse:
    """The single entry point M4 calls. Routes, runs one tool, summarises."""
    try:
        return handle_query(req)
    except SceneNotFound as exc:
        raise ApiError(404, "scene_not_found", f"scene not found: {exc}") from exc
    except ValueError as exc:
        # A well-formed request the scene or model can't satisfy - e.g. a
        # plain 3-band RGB upload asked for NDVI/NDWI (needs a NIR band), or a
        # target class the detector was never trained on. A foreseeable
        # client-input mismatch, not a server fault.
        raise ApiError(422, "unsupported_query", str(exc)) from exc
    except Exception as exc:
        log.exception("query failed")
        raise ApiError(500, "query_failed", f"query failed: {exc}") from exc


@router.post("/route", response_model=RoutingDecision)
def route_only(req: QueryRequest) -> RoutingDecision:
    """Routing without tool execution.

    M6 benchmarks router accuracy against this on a CPU box - no GPU, no
    scene file, so the 50-query matrix runs in seconds.
    """
    return IntentRouter(get_vlm()).route(req.prompt)
