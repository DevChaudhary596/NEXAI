"""PostgreSQL system of record for SatQuery's multi-tenant product data.

No tenant identity is inferred from an email query parameter or the browser.
Every read is scoped by a workspace membership verified from a Firebase UID.
The schema is installed idempotently at application startup; production teams
can later lift it into a versioned migration without changing callers.
"""
from __future__ import annotations

import json
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterator

from app.core.config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
    classification TEXT NOT NULL CHECK (classification IN ('unclassified', 'restricted', 'confidential')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('viewer', 'analyst', 'reviewer', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, firebase_uid)
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
    template TEXT NOT NULL CHECK (template IN ('flood_response', 'crop_monitoring', 'maritime_surveillance', 'border_security', 'custom')),
    aoi_json JSONB,
    classification TEXT NOT NULL CHECK (classification IN ('unclassified', 'restricted', 'confidential')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_uid TEXT NOT NULL,
    event_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_uid ON workspace_members(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_projects_workspace_updated ON projects(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_time ON audit_events(workspace_id, occurred_at DESC);
"""


@dataclass(frozen=True)
class Membership:
    workspace_id: str
    firebase_uid: str
    role: str


def _uuid() -> str:
    return str(uuid.uuid4())


class TenantStore:
    def _driver(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:  # pragma: no cover - deployment dependency
            raise RuntimeError("PostgreSQL support requires psycopg. Install backend/requirements.txt.") from exc
        return psycopg, dict_row

    @contextmanager
    def _connect(self) -> Iterator[Any]:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError("SATQUERY_DATABASE_URL is required for tenant data.")
        psycopg, dict_row = self._driver()
        with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
            yield conn

    def initialize(self) -> None:
        """Install the product schema. This is safe to call on each boot."""
        if not get_settings().database_url:
            return
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(_SCHEMA)

    @staticmethod
    def _workspace(row: dict[str, Any], role: str) -> dict[str, Any]:
        return {
            "id": str(row["id"]), "name": row["name"],
            "classification": row["classification"], "role": role,
            "created_at": row["created_at"],
        }

    def create_workspace(self, *, name: str, classification: str, owner_uid: str) -> dict[str, Any]:
        workspace_id = _uuid()
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO workspaces (id, name, classification) VALUES (%s, %s, %s) RETURNING *",
                    (workspace_id, name, classification),
                )
                workspace = cur.fetchone()
                cur.execute(
                    "INSERT INTO workspace_members (workspace_id, firebase_uid, role) VALUES (%s, %s, 'admin')",
                    (workspace_id, owner_uid),
                )
                self._insert_audit(cur, workspace_id, owner_uid, "workspace.created", "workspace", workspace_id, {"name": name})
        return self._workspace(workspace, "admin")

    def list_workspaces(self, firebase_uid: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT w.*, m.role FROM workspaces w
                       JOIN workspace_members m ON m.workspace_id = w.id
                       WHERE m.firebase_uid = %s ORDER BY w.created_at ASC""",
                    (firebase_uid,),
                )
                rows = cur.fetchall()
        return [self._workspace(row, row["role"]) for row in rows]

    def get_membership(self, workspace_id: str, firebase_uid: str) -> Membership | None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT workspace_id, firebase_uid, role FROM workspace_members WHERE workspace_id = %s AND firebase_uid = %s",
                    (workspace_id, firebase_uid),
                )
                row = cur.fetchone()
        if not row:
            return None
        return Membership(workspace_id=str(row["workspace_id"]), firebase_uid=row["firebase_uid"], role=row["role"])

    def add_member(self, *, workspace_id: str, firebase_uid: str, role: str, actor_uid: str) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO workspace_members (workspace_id, firebase_uid, role)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (workspace_id, firebase_uid) DO UPDATE SET role = EXCLUDED.role""",
                    (workspace_id, firebase_uid, role),
                )
                self._insert_audit(cur, workspace_id, actor_uid, "workspace.member_upserted", "member", firebase_uid, {"role": role})

    def create_project(self, *, workspace_id: str, name: str, template: str, aoi: dict[str, float] | None, classification: str, actor_uid: str) -> dict[str, Any]:
        project_id = _uuid()
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO projects (id, workspace_id, name, template, aoi_json, classification)
                       VALUES (%s, %s, %s, %s, %s::jsonb, %s) RETURNING *""",
                    (project_id, workspace_id, name, template, json.dumps(aoi) if aoi else None, classification),
                )
                project = cur.fetchone()
                self._insert_audit(cur, workspace_id, actor_uid, "project.created", "project", project_id, {"template": template})
        return self._project(project)

    @staticmethod
    def _project(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]), "workspace_id": str(row["workspace_id"]), "name": row["name"],
            "template": row["template"], "aoi": row["aoi_json"], "classification": row["classification"],
            "created_at": row["created_at"], "updated_at": row["updated_at"],
        }

    def list_projects(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM projects WHERE workspace_id = %s ORDER BY updated_at DESC", (workspace_id,))
                rows = cur.fetchall()
        return [self._project(row) for row in rows]

    def list_audit_events(self, workspace_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM audit_events WHERE workspace_id = %s ORDER BY occurred_at DESC LIMIT %s",
                    (workspace_id, limit),
                )
                rows = cur.fetchall()
        return [
            {
                "id": str(row["id"]), "event_type": row["event_type"], "actor_uid": row["actor_uid"],
                "resource_type": row["resource_type"], "resource_id": row["resource_id"],
                "occurred_at": row["occurred_at"], "metadata": row["metadata"],
            }
            for row in rows
        ]

    def _insert_audit(self, cur: Any, workspace_id: str, actor_uid: str, event_type: str, resource_type: str, resource_id: str, metadata: dict[str, Any]) -> None:
        cur.execute(
            """INSERT INTO audit_events (id, workspace_id, actor_uid, event_type, resource_type, resource_id, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)""",
            (_uuid(), workspace_id, actor_uid, event_type, resource_type, resource_id, json.dumps(metadata)),
        )


_tenant_store: TenantStore | None = None


def get_tenant_store() -> TenantStore:
    global _tenant_store
    if _tenant_store is None:
        _tenant_store = TenantStore()
    return _tenant_store
