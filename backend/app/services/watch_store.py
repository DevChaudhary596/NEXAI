"""Persistence for AOI watches and the alerts they generate.

SQLite, not a new service — this app has no database at all otherwise (every
other service is filesystem-backed, see storage.py). SQLite is a single file,
needs no server, and is stdlib (`sqlite3`), so this adds zero new
infrastructure while still giving real querying (e.g. "which watches are due
for a check") that flat JSON-per-record files would make awkward.

Email-based, not account-based: see schemas/watches.py docstring.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

from app.core.config import get_settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS watches (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    label TEXT,
    west REAL NOT NULL,
    south REAL NOT NULL,
    east REAL NOT NULL,
    north REAL NOT NULL,
    tool_call_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_checked_at TEXT,
    last_item_id TEXT,
    last_stats_json TEXT,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    watch_id TEXT NOT NULL REFERENCES watches(id),
    created_at TEXT NOT NULL,
    message TEXT NOT NULL,
    stats_before_json TEXT NOT NULL,
    stats_after_json TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alerts_watch ON alerts(watch_id);
CREATE INDEX IF NOT EXISTS idx_watches_email ON watches(email);
"""


@dataclass
class Watch:
    id: str
    email: str
    label: str | None
    west: float
    south: float
    east: float
    north: float
    tool_call_json: str
    created_at: str
    last_checked_at: str | None
    last_item_id: str | None
    last_stats: dict[str, float] = field(default_factory=dict)
    active: bool = True


@dataclass
class Alert:
    id: str
    watch_id: str
    created_at: str
    message: str
    stats_before: dict[str, float]
    stats_after: dict[str, float]
    seen: bool


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mint_id() -> str:
    return uuid.uuid4().hex[:16]


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    s = get_settings()
    conn = sqlite3.connect(s.resolved_watches_db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(_SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def _row_to_watch(row: sqlite3.Row) -> Watch:
    return Watch(
        id=row["id"],
        email=row["email"],
        label=row["label"],
        west=row["west"], south=row["south"], east=row["east"], north=row["north"],
        tool_call_json=row["tool_call_json"],
        created_at=row["created_at"],
        last_checked_at=row["last_checked_at"],
        last_item_id=row["last_item_id"],
        last_stats=json.loads(row["last_stats_json"]) if row["last_stats_json"] else {},
        active=bool(row["active"]),
    )


def _row_to_alert(row: sqlite3.Row) -> Alert:
    return Alert(
        id=row["id"],
        watch_id=row["watch_id"],
        created_at=row["created_at"],
        message=row["message"],
        stats_before=json.loads(row["stats_before_json"]),
        stats_after=json.loads(row["stats_after_json"]),
        seen=bool(row["seen"]),
    )


def create_watch(
    email: str, label: str | None, west: float, south: float, east: float,
    north: float, tool_call_json: str,
) -> Watch:
    watch_id = _mint_id()
    created_at = _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO watches (id, email, label, west, south, east, north, "
            "tool_call_json, created_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
            (watch_id, email, label, west, south, east, north, tool_call_json, created_at),
        )
    return Watch(
        id=watch_id, email=email, label=label, west=west, south=south, east=east,
        north=north, tool_call_json=tool_call_json, created_at=created_at,
        last_checked_at=None, last_item_id=None, last_stats={}, active=True,
    )


def list_watches(email: str | None = None) -> list[Watch]:
    """Active watches only - a deleted (deactivated) watch shouldn't reappear
    in a user's watch list."""
    with _connect() as conn:
        if email:
            rows = conn.execute(
                "SELECT * FROM watches WHERE email = ? AND active = 1 ORDER BY created_at DESC",
                (email,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM watches WHERE active = 1 ORDER BY created_at DESC"
            ).fetchall()
    return [_row_to_watch(r) for r in rows]


def get_watch(watch_id: str) -> Watch | None:
    with _connect() as conn:
        row = conn.execute("SELECT * FROM watches WHERE id = ?", (watch_id,)).fetchone()
    return _row_to_watch(row) if row else None


def deactivate_watch(watch_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("UPDATE watches SET active = 0 WHERE id = ?", (watch_id,))
    return cur.rowcount > 0


def get_due_watches(interval_minutes: int) -> list[Watch]:
    """Active watches never checked, or last checked more than the interval
    ago."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=interval_minutes)).isoformat()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM watches WHERE active = 1 "
            "AND (last_checked_at IS NULL OR last_checked_at < ?)",
            (cutoff,),
        ).fetchall()
    return [_row_to_watch(r) for r in rows]


def mark_checked(watch_id: str, item_id: str | None, stats: dict[str, float] | None = None) -> None:
    with _connect() as conn:
        if stats is not None:
            conn.execute(
                "UPDATE watches SET last_checked_at = ?, last_item_id = ?, last_stats_json = ? WHERE id = ?",
                (_now(), item_id, json.dumps(stats), watch_id),
            )
        else:
            conn.execute(
                "UPDATE watches SET last_checked_at = ?, last_item_id = ? WHERE id = ?",
                (_now(), item_id, watch_id),
            )


def create_alert(
    watch_id: str, message: str, stats_before: dict[str, float], stats_after: dict[str, float]
) -> Alert:
    alert_id = _mint_id()
    created_at = _now()
    with _connect() as conn:
        conn.execute(
            "INSERT INTO alerts (id, watch_id, created_at, message, stats_before_json, "
            "stats_after_json, seen) VALUES (?, ?, ?, ?, ?, ?, 0)",
            (alert_id, watch_id, created_at, message, json.dumps(stats_before), json.dumps(stats_after)),
        )
    return Alert(
        id=alert_id, watch_id=watch_id, created_at=created_at, message=message,
        stats_before=stats_before, stats_after=stats_after, seen=False,
    )


def list_alerts(email: str | None = None, watch_id: str | None = None) -> list[Alert]:
    query = (
        "SELECT alerts.* FROM alerts "
        "JOIN watches ON watches.id = alerts.watch_id WHERE 1=1"
    )
    params: list[Any] = []
    if email:
        query += " AND watches.email = ?"
        params.append(email)
    if watch_id:
        query += " AND alerts.watch_id = ?"
        params.append(watch_id)
    query += " ORDER BY alerts.created_at DESC"

    with _connect() as conn:
        rows = conn.execute(query, params).fetchall()
    return [_row_to_alert(r) for r in rows]


def mark_alert_seen(alert_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("UPDATE alerts SET seen = 1 WHERE id = ?", (alert_id,))
    return cur.rowcount > 0
