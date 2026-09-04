"""Integration test for the live map window / ROI selection pipeline.
Validates:
1. Geographic coordinate conversion in CV Service without 0x0 collapse
2. GIS Service windowed spectral indexing with ROI bounds
3. End-to-end FastAPI query endpoint with ROI for Detection, Spectral, and VQA
"""
import sys
from pathlib import Path
import pytest

# Ensure backend and satquery-gis-engine are importable
ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
GIS_DIR = ROOT_DIR / "satquery-gis-engine" / "src"

for p in [str(BACKEND_DIR), str(GIS_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi.testclient import TestClient
from app.main import app
from app.core.schemas import BBox, QueryRequest, QueryResponse
from app.services.cv_engine.geo import geo_bbox_to_pixel
from app.services.cv import get_cv
from app.services.gis import get_gis
from app.core.schemas.common import Comparison, SpectralIndex


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_geo_bbox_to_pixel_conversion():
    """Verify that geographic degrees lon/lat convert properly through an affine transform."""
    class MockAffine:
        def __invert__(self):
            return self
        def __mul__(self, pt):
            lon, lat = pt
            return (lon - 77.0) / 0.0001, (13.5 - lat) / 0.0001

    transform = MockAffine()
    
    geo_bbox = BBox(west=77.1, south=13.1, east=77.3, north=13.3)
    xmin, ymin, xmax, ymax = geo_bbox_to_pixel(geo_bbox, transform)
    
    # 77.1 is (77.1 - 77.0)/0.0001 = 1000 cols
    # 77.3 is (77.3 - 77.0)/0.0001 = 3000 cols
    # 13.3 is (13.5 - 13.3)/0.0001 = 2000 rows
    # 13.1 is (13.5 - 13.1)/0.0001 = 4000 rows
    assert xmin == 1000
    assert xmax == 3000
    assert ymin == 2000
    assert ymax == 4000
    assert xmax > xmin
    assert ymax > ymin


def test_cv_service_with_roi():
    """Verify CV Service detect with geographic ROI doesn't crash or collapse."""
    cv = get_cv()
    sample_img = ROOT_DIR / "data" / "test_georeferenced_baseball.tif"
    if sample_img.exists():
        fc = cv.detect(
            scene_path=sample_img,
            target="baseball diamond",
            bbox=BBox(west=77.0, south=12.0, east=78.0, north=14.0),
            confidence=0.25
        )
        assert hasattr(fc, "features")


def test_gis_service_with_roi():
    """Verify GIS Service spectral analysis with geographic ROI."""
    gis = get_gis()
    sample_img = ROOT_DIR / "data" / "sample_scenes" / "test_flood_scene.tif"
    roi_bbox = BBox(west=77.20, south=28.47, east=77.22, north=28.50)
    
    fc, overlay, stats = gis.spectral(
        scene_path=sample_img if sample_img.exists() else "demo",
        index=SpectralIndex.NDWI,
        threshold=0.0,
        operator=Comparison.GT,
        bbox=roi_bbox
    )
    assert hasattr(fc, "features")
    assert len(overlay.bounds) == 4
    assert "area_km2" in stats


def test_api_query_detection_with_roi(client):
    """End-to-end API test: detection query with drawn ROI."""
    payload = {
        "prompt": "Count the ships in this area",
        "scene_id": "demo",
        "roi": {
            "type": "bbox",
            "bbox": {"west": 77.2, "south": 28.5, "east": 77.4, "north": 28.7},
            "crs": "EPSG:4326"
        }
    }
    r = client.post("/api/v1/query", json=payload)
    assert r.status_code == 200
    res = QueryResponse.model_validate(r.json())
    assert res.routing.tool_call.action.value == "detection"
    assert res.stats["count"] >= 0
    # Features must land inside the drawn ROI
    b = payload["roi"]["bbox"]
    for feat in res.geojson.features:
        coords = feat.geometry["coordinates"]
        for ring in coords:
            for x, y in ring:
                assert b["west"] <= x <= b["east"]
                assert b["south"] <= y <= b["north"]


def test_api_query_spectral_with_roi(client):
    """End-to-end API test: spectral vegetation query with drawn ROI."""
    payload = {
        "prompt": "Show healthy vegetation in the selected area",
        "scene_id": "demo",
        "roi": {
            "type": "bbox",
            "bbox": {"west": 77.15, "south": 28.45, "east": 77.35, "north": 28.65},
            "crs": "EPSG:4326"
        }
    }
    r = client.post("/api/v1/query", json=payload)
    assert r.status_code == 200
    res = QueryResponse.model_validate(r.json())
    assert res.routing.tool_call.action.value == "spectral"
    assert len(res.overlays) == 1
    assert res.overlays[0].bounds == [77.15, 28.45, 77.35, 28.65]


def test_api_query_vqa_with_roi(client):
    """End-to-end API test: visual question answering with drawn ROI."""
    payload = {
        "prompt": "What do you see in the highlighted region?",
        "scene_id": "demo",
        "roi": {
            "type": "bbox",
            "bbox": {"west": 77.2, "south": 28.5, "east": 77.4, "north": 28.7},
            "crs": "EPSG:4326"
        }
    }
    r = client.post("/api/v1/query", json=payload)
    assert r.status_code == 200
    res = QueryResponse.model_validate(r.json())
    assert res.routing.tool_call.action.value == "general_vqa"
    assert len(res.answer) > 0
