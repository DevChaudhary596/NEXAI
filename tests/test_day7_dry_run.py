"""
Day 7 QA Unit Tests: Validation of Final End-to-End Dry Run and Sign-Off Certificate.
Verifies all 3 operational demo tracks pass, QA sign-off certificate is complete,
and backup video demonstration assets are properly rendered.
"""

import json
import os
import pytest

DRY_RUN_JSON = "qa_eval/reports/dry_run_results.json"
SIGNOFF_CERT = "qa_eval/qa_signoff_certificate.md"
DEMO_WALKTHROUGH = "qa_eval/demo_backup_walkthrough.md"
ASSETS_DIR = "qa_eval/demo_assets"


@pytest.fixture(scope="module")
def dry_run_data():
    assert os.path.exists(DRY_RUN_JSON), f"Missing dry run telemetry at {DRY_RUN_JSON}"
    with open(DRY_RUN_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def test_dry_run_all_tracks_passed(dry_run_data):
    """Verify end-to-end dry run verified all 3 tracks with passing status."""
    assert dry_run_data["overall_status"] == "ALL_TRACKS_PASSED"
    tracks = dry_run_data.get("tracks", {})
    assert "track_1_disaster" in tracks
    assert "track_2_agriculture" in tracks
    assert "track_3_infrastructure" in tracks

    for track_key, track_res in tracks.items():
        assert track_res["status"] == "PASS", f"Track {track_key} failed dry run"
        assert track_res["total_latency_ms"] < 6000.0


def test_signoff_certificate_complete():
    """Verify formal QA sign-off certificate exists and has key compliance attestations."""
    assert os.path.exists(SIGNOFF_CERT)
    with open(SIGNOFF_CERT, "r", encoding="utf-8") as f:
        cert_text = f.read()

    assert "QA-SIGN-OFF-WEEK1-SIH26167" in cert_text
    assert "SIH26167" in cert_text
    assert "Member 6" in cert_text
    assert "PRODUCTION READY" in cert_text
    assert "100% Commodity CPU" in cert_text


def test_demo_backup_assets_and_walkthrough():
    """Verify demo backup walkthrough and all 3 visual overlay PNGs exist."""
    assert os.path.exists(DEMO_WALKTHROUGH)
    with open(DEMO_WALKTHROUGH, "r", encoding="utf-8") as f:
        guide_text = f.read()

    assert "Track 1: Disaster Management" in guide_text
    assert "Track 2: Precision Agriculture" in guide_text
    assert "Track 3: Strategic Infrastructure" in guide_text

    expected_assets = [
        "track1_kaziranga_flood_overlay.png",
        "track2_punjab_ndvi_overlay.png",
        "track3_jnpt_vessels_demo.png",
    ]
    for asset_name in expected_assets:
        asset_path = os.path.join(ASSETS_DIR, asset_name)
        assert os.path.exists(asset_path), f"Missing demo asset: {asset_path}"
        assert os.path.getsize(asset_path) > 1000, f"Asset file empty: {asset_path}"
