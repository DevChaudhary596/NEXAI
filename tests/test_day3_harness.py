"""
Day 3 QA Unit Tests: Validation of QATestHarness and Metric Logging Tool.
Ensures latency timers, memory profilers, test runners, and report generators work accurately.
"""

import json
import os
import pytest
from qa_eval.test_harness import QATestHarness, QueryResult, LATEST_JSON_REPORT, LATEST_MD_REPORT


@pytest.fixture(scope="module")
def harness():
    return QATestHarness()


def test_harness_instantiation(harness):
    """Verify test harness initializes with valid matrix and client."""
    assert harness.matrix is not None
    assert "queries" in harness.matrix
    assert len(harness.matrix["queries"]) == 50
    assert harness.client is not None


def test_harness_memory_profiling(harness):
    """Verify memory reader returns reasonable positive RSS value."""
    rss = harness.get_current_rss_mb()
    assert isinstance(rss, float)
    assert 20.0 <= rss <= 4000.0, f"Unexpected memory RSS: {rss} MB"


def test_harness_single_query_execution(harness):
    """Verify single query execution returns QueryResult with valid latency and status."""
    first_q = harness.matrix["queries"][0]
    res = harness.run_single_query(first_q, mode="router")

    assert isinstance(res, QueryResult)
    assert res.query_id == "Q-001"
    assert res.latency_ms > 0.0
    assert res.latency_ms < 4000.0, "Routing should be well under 4 seconds"
    assert res.status in ["PASS", "FAIL", "HTTP_200"]
    assert res.actual_router_path == "detection"
    assert res.passed is True


def test_harness_run_suite_and_reports(harness):
    """Verify run_suite generates structured JSON report and Markdown scorecard."""
    report = harness.run_suite(mode="router", limit=5)

    assert report["total_queries"] == 5
    assert "pass_rate_pct" in report
    assert "avg_latency_ms" in report
    assert "peak_rss_mb" in report
    assert report["hardware_budget_passed"] is True

    # Check files on disk
    assert os.path.exists(LATEST_JSON_REPORT)
    assert os.path.exists(LATEST_MD_REPORT)

    with open(LATEST_JSON_REPORT, "r", encoding="utf-8") as f:
        saved_json = json.load(f)
    assert saved_json["total_queries"] == 5

    with open(LATEST_MD_REPORT, "r", encoding="utf-8") as f:
        saved_md = f.read()
    assert "High-Level KPI Summary" in saved_md
    assert "Pass Rate" in saved_md
