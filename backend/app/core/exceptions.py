"""Shared exception types that cross service boundaries. M1 Day 13.

`UnsupportedSceneError` is a `ValueError` subclass on purpose: existing tests
(`test_spectral_on_a_scene_without_nir_raises_clearly`) assert on
`pytest.raises(ValueError, ...)` at the GIS-engine level, and that contract
must keep holding regardless of what the orchestrator does with it one layer
up. The orchestrator catches this specific type to answer gracefully instead
of surfacing a 422 - see `app/services/orchestrator.py::handle_query`.
"""
from __future__ import annotations


class UnsupportedSceneError(ValueError):
    """The scene itself can't satisfy the request - wrong band count, too
    coarse a resolution for the requested target, etc. Distinguishing this
    from a generic ValueError is what lets the orchestrator answer in-chat
    ("this scene doesn't have what's needed for that") instead of failing
    the whole query."""
