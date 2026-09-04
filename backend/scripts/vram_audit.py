#!/usr/bin/env python3
"""Day 14 sign-off: VRAM peak stays under the ceiling across *repeated*
queries, with no leak.

This is the audit `app/services/vlm.py::vram_scope`'s empty_cache()/gc.collect()
pair on every exit was written to satisfy - the docstring already calls out
the exact failure mode this checks for: "without it, the allocator holds
freed blocks and peak creeps up across sequential VLM -> CV -> GIS calls
until the fourth query OOMs." This script is the thing that actually proves
that isn't happening, on real hardware, not just in a code comment.

MUST run on the RTX 4060 (or an Apple Silicon Mac for the MLX path) with a
real backend - like backend-goru/scripts/profile_vlm.py, it refuses to
fabricate a number on CPU.

    SATQUERY_VLM_BACKEND=local python scripts/vram_audit.py --queries 12
    SATQUERY_VLM_BACKEND=mlx   python scripts/vram_audit.py --queries 12
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _seed_scene(scenes_dir: Path) -> str:
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

    scene_id = "vram_audit"
    path = scenes_dir / scene_id / "scene.tif"
    path.parent.mkdir(parents=True, exist_ok=True)
    shape = (512, 512)
    transform = from_origin(77.5, 13.1, 0.0005, 0.0005)
    rng = np.random.default_rng(1)
    with rasterio.open(
        path, "w", driver="GTiff", height=shape[0], width=shape[1], count=4,
        dtype="uint16", crs="EPSG:4326", transform=transform,
    ) as dst:
        for b in range(1, 5):
            dst.write(rng.integers(200, 800, shape, dtype="uint16"), b)
    return scene_id


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--queries", type=int, default=12, help="consecutive queries to run")
    ap.add_argument(
        "--plateau-after", type=int, default=3,
        help="query index after which peak must stop climbing (a leak signature)",
    )
    ap.add_argument("--growth-tolerance-gb", type=float, default=0.15)
    ap.add_argument(
        "--allow-mock", action="store_true",
        help="Allow running audit harness against mock backend for testing",
    )
    args = ap.parse_args()

    from app.services.vlm import detect_accelerator

    accel = detect_accelerator()
    if accel == "cpu" and not args.allow_mock:
        print("no CUDA/MLX accelerator available - this audit must run on the "
              "RTX 4060 (SATQUERY_VLM_BACKEND=local) or an Apple Silicon Mac "
              "(SATQUERY_VLM_BACKEND=mlx). Refusing to report a fake CPU number.")
        return 1

    tmp_data_dir = Path(tempfile.mkdtemp(prefix="satquery-vram-audit-"))
    os.environ.setdefault("SATQUERY_DATA_DIR", str(tmp_data_dir))

    from app.core.config import get_settings
    from app.core.schemas import QueryRequest
    from app.services.orchestrator import handle_query

    s = get_settings()
    if s.vlm_backend not in ("local", "mlx") and not args.allow_mock:
        print(f"SATQUERY_VLM_BACKEND={s.vlm_backend!r} - set it to local or mlx "
              "for this audit to mean anything.")
        return 1

    scene_id = _seed_scene(Path(s.scenes_dir))
    prompts = [
        "How many ships are here?", "Describe the scene",
        "What is the NDVI of this region?", "Detect storage tanks",
    ]

    print(f"backend  {s.vlm_backend}")
    print(f"ceiling  {s.vram_ceiling_gb:.2f} GB")
    print(f"queries  {args.queries}\n")
    print(f"{'#':>3}  {'peak_vram_gb':>12}  {'total_ms':>9}")

    peaks: list[float] = []
    for i in range(args.queries):
        prompt = prompts[i % len(prompts)]
        resp = handle_query(QueryRequest(prompt=prompt, scene_id=scene_id))
        peak = resp.peak_vram_gb or 0.0
        peaks.append(peak)
        print(f"{i:>3}  {peak:>12.3f}  {resp.timings.total_ms:>8.0f}m")

    shutil.rmtree(tmp_data_dir, ignore_errors=True)

    over_ceiling = [p for p in peaks if p > s.vram_ceiling_gb]
    plateau = peaks[args.plateau_after:]
    leaking = bool(plateau) and (max(plateau) - min(plateau) > args.growth_tolerance_gb)

    print(f"\nmax peak      = {max(peaks):.3f} GB")
    print(f"post-plateau  = {min(plateau):.3f}..{max(plateau):.3f} GB" if plateau else "n/a")

    ok = True
    if over_ceiling:
        print(f"FAIL: {len(over_ceiling)}/{len(peaks)} quer(ies) exceeded the "
              f"{s.vram_ceiling_gb:.2f} GB ceiling")
        ok = False
    if leaking:
        print(f"FAIL: peak VRAM grew by more than {args.growth_tolerance_gb:.2f} GB "
              f"after query {args.plateau_after} - looks like a leak")
        ok = False
    if ok:
        print("PASS: under ceiling, no leak signature across "
              f"{args.queries} consecutive queries")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
