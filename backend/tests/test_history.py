"""Day 8 - multi-turn memory over the wire. A follow-up question with
`history` attached should route/answer without needing the base prompt
repeated, and the server should accept it as a purely additive field (old
clients that never send `history` keep working - see test_gis.py's
round-trip test, which posts no `history` at all)."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.schemas import QueryResponse
from app.main import app


def test_query_accepts_conversation_history(scene_with_vegetation_and_water):
    with TestClient(app) as client:
        r = client.post("/api/v1/query", json={
            "prompt": "how many of those are near the eastern edge?",
            "scene_id": "veg_water_scene",
            "history": [
                {"role": "user", "content": "how many ships are in this scene?"},
                {"role": "assistant", "content": "3 ships detected."},
            ],
        })

    assert r.status_code == 200
    QueryResponse.model_validate(r.json())  # shape check


def test_history_trim_helper_keeps_only_the_last_n_turns():
    """`handle_query` trims `req.history` server-side to `max_history_turns`
    regardless of what the client sent (see orchestrator.py's
    `_history_as_dicts`) - unit-tested directly since it's the part with
    actual logic; the HTTP test above only proves the field round-trips."""
    from app.core.schemas import ConversationTurn
    from app.services.orchestrator import _history_as_dicts

    history = [
        ConversationTurn(role="user" if i % 2 == 0 else "assistant", content=f"turn {i}")
        for i in range(10)
    ]
    trimmed = _history_as_dicts(history, max_turns=4)
    assert len(trimmed) == 4
    assert trimmed[-1]["content"] == "turn 9"
    assert trimmed[0]["content"] == "turn 6"


def test_history_trim_helper_with_zero_turns_configured():
    from app.core.schemas import ConversationTurn
    from app.services.orchestrator import _history_as_dicts

    history = [ConversationTurn(role="user", content="hi")]
    assert _history_as_dicts(history, max_turns=0) == []
