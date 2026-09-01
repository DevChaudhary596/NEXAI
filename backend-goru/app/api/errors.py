"""Uniform error envelope. M1 Day 7.

`ErrorResponse` promises `detail` (a string) and `code` (a stable slug) on
every non-2xx from /api/v1/*. Without these handlers FastAPI emits two other
shapes instead - a bare `{"detail": "..."}` for HTTPException and a *list* of
dicts for validation errors - so M4 would have to branch on which kind of
failure it got before it can show anything.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.schemas import ErrorResponse

log = logging.getLogger(__name__)

# Fallbacks for HTTPExceptions raised without an explicit slug.
_CODE_BY_STATUS = {400: "bad_request", 404: "not_found", 413: "payload_too_large"}


class ApiError(HTTPException):
    """HTTPException that carries the machine-readable slug M4 branches on."""

    def __init__(self, status_code: int, code: str, detail: str):
        super().__init__(status_code=status_code, detail=detail)
        self.code = code


def _envelope(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(detail=detail, code=code).model_dump(),
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _envelope(exc.status_code, exc.code, str(exc.detail))

    # Starlette's base class, not FastAPI's subclass: an unmatched route raises
    # the base one, so a handler registered on the subclass never sees it and
    # the bare {"detail": "Not Found"} leaks out.
    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _CODE_BY_STATUS.get(exc.status_code, f"http_{exc.status_code}")
        return _envelope(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Flatten to one line: "body.roi.bbox.west: Input should be less than 180".
        # The raw list is precise but M4 renders `detail` verbatim into a chat
        # bubble, so it has to be a sentence, not a nested structure.
        parts = [
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}"
            for e in exc.errors()
        ]
        return _envelope(422, "validation_error", "; ".join(parts) or "invalid request")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        # Never leak a traceback to the client, but always log it here.
        log.exception("unhandled error")
        return _envelope(500, "internal_error", f"{type(exc).__name__}: {exc}")
