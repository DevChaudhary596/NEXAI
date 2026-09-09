import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import watch_store


@pytest.fixture
def client():
    return TestClient(app)


def test_alert_triage_lifecycle(client):
    # 1. Create a watch first
    watch = watch_store.create_watch(
        email="analyst@satquery.io",
        label="Test AOI Triage",
        west=76.8,
        south=28.3,
        east=77.5,
        north=28.9,
        tool_call_json=json.dumps({"action": "ndvi_vegetation", "threshold": 0.2}),
    )
    
    # 2. Create an alert for this watch
    alert = watch_store.create_alert(
        watch_id=watch.id,
        message="Vegetation decrease > 15% detected in Sector 4",
        stats_before={"area_km2": 12.4},
        stats_after={"area_km2": 9.8},
    )
    assert alert.status == "open"
    
    # 3. Update status to investigating and assign to user
    res1 = client.patch(
        f"/api/v1/alerts/{alert.id}",
        json={
            "status": "investigating",
            "assigned_uid": "analyst-usr-007",
            "triage_notes": "Assigned to Sentinel team for false-positive filtering",
        },
    )
    assert res1.status_code == 200, res1.text
    data1 = res1.json()
    assert data1["status"] == "investigating"
    assert data1["assigned_uid"] == "analyst-usr-007"
    assert data1["triage_notes"] == "Assigned to Sentinel team for false-positive filtering"
    
    # 4. Update status to resolved
    res2 = client.patch(
        f"/api/v1/alerts/{alert.id}",
        json={
            "status": "resolved",
            "triage_notes": "Confirmed seasonal harvest variation, no illegal clearing detected.",
        },
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "resolved"
    assert data2["assigned_uid"] == "analyst-usr-007"  # preserved
    assert "Confirmed seasonal harvest" in data2["triage_notes"]
    
    # 5. Non-existent alert returns 404
    res_404 = client.patch(
        "/api/v1/alerts/non-existent-alert-999",
        json={"status": "resolved"},
    )
    assert res_404.status_code == 404
