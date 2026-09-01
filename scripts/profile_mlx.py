#!/usr/bin/env python3
"""Day 2 (Mac): max_pixels sweep against the memory ceiling, on MLX.

The MLX counterpart of scripts/profile_vlm.py. Same premise: it is not the
weights that vary with input, it is the visual-token count, and that is what
decides whether an 8 GB shared-memory machine stays out of swap on a real
GeoTIFF tile.

  python scripts/profile_mlx.py --ceiling 5.0
"""
from __future__ import annotations

import argparse
import gc
import sys
import time
from pathlib import Path

# Run as `python scripts/profile_mlx.py` from backend/ without installing.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def build_test_image(size: int = 2048):
    """Stand-in for a satellite tile; avoids needing real data on Day 2."""
    import numpy as np
    from PIL import Image

    rng = np.random.default_rng(0)
    return Image.fromarray(rng.integers(0, 255, (size, size, 3), dtype=np.uint8))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=None, help="defaults to settings.mlx_model_id")
    ap.add_argument("--ceiling", type=float, default=5.0, help="GB")
    ap.add_argument(
        "--max-latency", type=float, default=4.0,
        help="seconds; the answer-generation budget. On Apple Silicon this "
             "binds long before the memory ceiling does.",
    )
    ap.add_argument("--image-size", type=int, default=2048)
    ap.add_argument("--max-tokens", type=int, default=64)
    ap.add_argument(
        "--sweep", type=int, nargs="+", default=[256, 512, 768, 1024, 1280],
        help="max_pixels in units of 28*28 patches",
    )
    args = ap.parse_args()

    import platform

    if platform.machine() != "arm64":
        print("not Apple Silicon - use scripts/profile_vlm.py on a CUDA host")
        return 1

    import mlx.core as mx

    from app.config import get_settings
    from app.services.vlm import MLXQwen2VL

    settings = get_settings()
    if args.model:
        settings.mlx_model_id = args.model

    print(f"model    {settings.mlx_model_id}")
    print(f"chip     {platform.processor() or 'Apple Silicon'} (Metal)")
    print(f"ceiling  {args.ceiling} GB (unified memory, shared with macOS)\n")

    mx.reset_peak_memory()
    t0 = time.perf_counter()
    vlm = MLXQwen2VL(settings)
    weights_gb = mx.get_peak_memory() / 1024**3
    print(f"weights resident: {weights_gb:.2f} GB (loaded in {time.perf_counter() - t0:.0f}s)\n")

    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="satquery-profile-")) / "tile.png"
    build_test_image(args.image_size).save(tmp)

    print(f"{'max_pixels':>12} {'~side px':>9} {'peak GB':>9} {'latency s':>10}  verdict")
    print("-" * 58)

    passing = []
    for units in args.sweep:
        max_pixels = units * 28 * 28
        settings.max_pixels = max_pixels
        vlm.s.max_pixels = max_pixels
        side = int(max_pixels**0.5)
        try:
            mx.reset_peak_memory()
            t = time.perf_counter()
            vlm._run("Describe the land cover in this scene.", tmp,
                     args.max_tokens, greedy=True)
            latency = time.perf_counter() - t
            peak = mx.get_peak_memory() / 1024**3

            fits = peak <= args.ceiling
            if fits:
                passing.append((units, peak, latency))
            print(f"{max_pixels:>12} {side:>9} {peak:>9.2f} {latency:>10.2f}  "
                  f"{'OK' if fits else 'OVER CEILING'}")
        except Exception as exc:
            print(f"{max_pixels:>12} {side:>9} {'-':>9} {'-':>10}  FAIL {type(exc).__name__}")
        finally:
            gc.collect()
            mx.clear_cache()

    print()
    if not passing:
        print(f"FAIL  nothing fits under {args.ceiling} GB.")
        print("      1. Lower --sweep (192, 128).")
        print("      2. Close Chrome - on 8 GB the ceiling is what macOS leaves you.")
        return 1

    # Unlike the CUDA path, memory is nearly flat across this sweep on MLX
    # while latency roughly triples. Recommending "largest that fits in RAM"
    # would hand the demo a 9-second query. Latency is the binding constraint
    # here, so pick the sharpest image that still answers inside the budget.
    in_budget = [r for r in passing if r[2] <= args.max_latency]
    if in_budget:
        best = max(in_budget, key=lambda r: r[0])
        note = f"fits both {args.ceiling} GB and {args.max_latency}s"
    else:
        best = min(passing, key=lambda r: r[2])
        note = (f"NOTHING met the {args.max_latency}s budget - this is the "
                f"fastest option. Close background apps and re-run.")

    print(f"RECOMMENDED  SATQUERY_MAX_PIXELS={best[0] * 28 * 28}"
          f"  ({best[1]:.2f} GB, {best[2]:.2f}s)")
    print(f"             {note}")
    print("Use this SAME value when training, or answers degrade silently.")

    slowest = max(passing, key=lambda r: r[2])
    if slowest[2] > 2 * best[2]:
        print(f"\nNOTE  memory is flat across this sweep ({passing[0][1]:.2f}-"
              f"{slowest[1]:.2f} GB) but latency is not "
              f"({best[2]:.1f}s -> {slowest[2]:.1f}s). On Apple Silicon"
              f" max_pixels buys sharpness at the cost of speed, not memory.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
