#!/usr/bin/env python3
"""Day 11: end-to-end query latency against the <4s target.

Unlike backend-goru/scripts/profile_vlm.py (which isolates raw VLM.generate()
across a max_pixels sweep), this drives the *whole* pipeline - route -> tool
-> answer, through the same `handle_query` the API calls - because route_ms
and tool_ms are not free, and Day 11's budget is the total, not just
generation time.

Runs against whatever SATQUERY_VLM_BACKEND is already configured. With the
default `mock` backend this validates the harness and prints real route/tool
timings (both CPU-bound, so representative), but answer_ms is near-zero and
not evidence of the <4s target - that number only means something run with
SATQUERY_VLM_BACKEND=local or =mlx on the actual demo hardware.

    SATQUERY_VLM_BACKEND=local python scripts/profile_latency.py
    SATQUERY_VLM_BACKEND=mlx   python scripts/profile_latency.py --ceiling-ms 4000
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Prompts chosen to hit each tool path plus general VQA, mirroring the 3
# flagship scenarios from Day 12 so this doubles as a smoke test for them.
SAMPLE_QUERIES = [
    "How many ships are in this scene?",
    "Show flooded areas above 0.5 NDWI",
    "What is the crop health (NDVI) like here?",
    "Describe what you see in this image",
]


def _seed_scene(scenes_dir: Path) -> str:
    """A small 4-band synthetic scene, same convention as tests/conftest.py's
    `_write_multiband_tif` - real enough for the VLM/CV/GIS code paths to run
    against, without needing a real GeoTIFF checked into the repo."""
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

    scene_id = "latency_probe"
    path = scenes_dir / scene_id / "scene.tif"
    path.parent.mkdir(parents=True, exist_ok=True)

    shape = (256, 256)
    transform = from_origin(77.5, 13.1, 0.001, 0.001)
    rng = np.random.default_rng(0)
    with rasterio.open(
        path, "w", driver="GTiff", height=shape[0], width=shape[1], count=4,
        dtype="uint16", crs="EPSG:4326", transform=transform,
    ) as dst:
        for b in range(1, 5):
            dst.write(rng.integers(200, 800, shape, dtype="uint16"), b)
    return scene_id


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ceiling-ms", type=float, default=4000.0)
    args = ap.parse_args()

    tmp_data_dir = Path(tempfile.mkdtemp(prefix="satquery-latency-"))
    os.environ.setdefault("SATQUERY_DATA_DIR", str(tmp_data_dir))

    from app.core.config import get_settings
    from app.core.schemas import QueryRequest
    from app.services.orchestrator import handle_query

    s = get_settings()
    scene_id = _seed_scene(Path(s.scenes_dir))

    print(f"backend        {s.vlm_backend}")
    print(f"max_new_tokens {s.max_new_tokens}")
    print(f"ceiling        {args.ceiling_ms:.0f} ms\n")

    header = f"{'query':<45} {'route':>8} {'tool':>8} {'answer':>8} {'total':>8}"
    print(header)
    print("-" * len(header))

    worst = 0.0
    for q in SAMPLE_QUERIES:
        resp = handle_query(QueryRequest(prompt=q, scene_id=scene_id))
        t = resp.timings
        worst = max(worst, t.total_ms)
        print(
            f"{q[:44]:<45} {t.route_ms:>7.0f}m {t.tool_ms:>7.0f}m "
            f"{t.answer_ms:>7.0f}m {t.total_ms:>7.0f}m"
        )

    shutil.rmtree(tmp_data_dir, ignore_errors=True)

    print(f"\nworst total_ms = {worst:.0f}")
    if s.vlm_backend == "mock":
        print("mock backend - answer_ms is not representative; run with "
              "SATQUERY_VLM_BACKEND=local or mlx on real hardware for a real number.")
        return 0
    if worst > args.ceiling_ms:
        print(f"FAIL: worst case {worst:.0f}ms exceeds {args.ceiling_ms:.0f}ms ceiling")
        return 1
    print("PASS: under ceiling")
    return 0


if __name__ == "__main__":
    sys.exit(main())
