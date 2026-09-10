"""Day 11 and Day 14 script verification tests.

Verifies:
- Config constraints: max_new_tokens=150, vram_ceiling_gb=5.0, max_history_turns=8.
- profile_latency.py runs cleanly against the pipeline.
- vram_audit.py runs cleanly with plateau and leak-detection logic.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from app.core.config import get_settings


def test_member1_config_constraints():
    """Verify that Day 11 and Day 14 architectural budgets are enforced in config."""
    s = get_settings()
    assert s.max_new_tokens <= 150, "Day 11 budget: max_new_tokens must be <= 150"
    assert s.vram_ceiling_gb <= 5.0, "Day 14 budget: VRAM ceiling must be <= 5.0 GB"
    assert s.max_history_turns <= 8, "Day 8 budget: history memory turns must be bounded <= 8"
    assert s.max_pixels <= 256 * 28 * 28, "Day 11 visual token cap must be <= 256 tokens"


def test_profile_latency_script_runs_successfully():
    """Day 11: run scripts/profile_latency.py as a subprocess and verify exit 0."""
    repo_root = Path(__file__).resolve().parent.parent
    script = repo_root / "scripts" / "profile_latency.py"

    res = subprocess.run(
        [sys.executable, str(script), "--allow-mock", "--ceiling-ms", "4000"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"profile_latency failed:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
    assert "worst total_ms" in res.stdout


def test_vram_audit_script_runs_successfully():
    """Day 14: run scripts/vram_audit.py as a subprocess with --allow-mock and verify exit 0."""
    repo_root = Path(__file__).resolve().parent.parent
    script = repo_root / "scripts" / "vram_audit.py"

    res = subprocess.run(
        [sys.executable, str(script), "--allow-mock", "--queries", "6"],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"vram_audit failed:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
    assert "PASS: under ceiling" in res.stdout
