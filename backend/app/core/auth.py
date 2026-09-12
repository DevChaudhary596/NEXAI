"""Firebase-backed request identity and workspace authorization.

Firebase authenticates people; it does not decide which customer workspace a
person may access. That decision lives in PostgreSQL, and every protected
route must resolve a membership before reading or writing tenant data.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated

from fastapi import Depends, Header, Request

from app.api.errors import ApiError
from app.core.config import get_settings


ROLE_ORDER = {"viewer": 0, "analyst": 1, "reviewer": 2, "admin": 3}


@dataclass(frozen=True)
class Principal:
    uid: str
    email: str | None
    name: str | None
    authenticated: bool


def _firebase_auth():
    """Initialize Firebase Admin once, from a runtime secret only."""
    try:
        import firebase_admin
        from firebase_admin import auth, credentials
    except ImportError as exc:  # pragma: no cover - deployment dependency
        raise ApiError(503, "identity_unavailable", "Firebase Admin is not installed.") from exc

    if not firebase_admin._apps:
        settings = get_settings()
        raw = settings.firebase_credentials
        if not raw:
            raise ApiError(503, "identity_unconfigured", "Firebase Admin credentials are not configured.")
        try:
            credential_value = json.loads(raw)
        except json.JSONDecodeError:
            candidate = Path(raw)
            if not candidate.is_file():
                raise ApiError(503, "identity_unconfigured", "Firebase credentials must be a JSON secret or readable file path.")
            credential_value = str(candidate)
        firebase_admin.initialize_app(credentials.Certificate(credential_value), {"projectId": settings.firebase_project_id})
    return auth


async def require_principal(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    test_uid: Annotated[str | None, Header(alias="X-SOLEN-Test-UID")] = None,
) -> Principal:
    """Validate a Firebase ID token, failing closed in production.

    The test escape hatch is deliberately unavailable in production. It keeps
    existing offline unit tests independent of a Firebase project while never
    becoming a deploy-time backdoor.
    """
    settings = get_settings()
    if settings.environment == "test" and settings.testing and test_uid:
        return Principal(uid=test_uid, email=None, name=None, authenticated=True)

    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(401, "authentication_required", "A Firebase ID token is required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise ApiError(401, "authentication_required", "A Firebase ID token is required.")
    try:
        decoded = _firebase_auth().verify_id_token(token, check_revoked=True)
    except ApiError:
        raise
    except Exception as exc:
        raise ApiError(401, "invalid_identity_token", "The Firebase ID token is invalid, expired, or revoked.") from exc
    return Principal(
        uid=str(decoded["uid"]),
        email=decoded.get("email"),
        name=decoded.get("name"),
        authenticated=True,
    )


async def optional_principal(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> Principal | None:
    """Use only for endpoints that truly allow an unauthenticated response."""
    if not authorization:
        return None
    return await require_principal(request, authorization)


def require_role(role: str):
    if role not in ROLE_ORDER:
        raise ValueError(f"unknown role: {role}")

    async def _dependency(
        workspace_header: Annotated[str, Header(alias="X-Workspace-ID")],
        principal: Principal = Depends(require_principal),
    ) -> Principal:
        from app.services.tenant_store import get_tenant_store

        membership = get_tenant_store().get_membership(workspace_header, principal.uid)
        if membership is None:
            raise ApiError(403, "workspace_access_denied", "You do not have access to this workspace.")
        if ROLE_ORDER[membership.role] < ROLE_ORDER[role]:
            raise ApiError(403, "insufficient_role", f"This action requires the {role} role.")
        return principal

    return _dependency
