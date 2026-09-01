#!/usr/bin/env python3
"""Day 1 (Mac): Apple Silicon sanity check. The MLX counterpart of
scripts/cuda_sanity.py - run this on M1's MacBook, that one on Kaggle.

Prints one report and exits non-zero if the host cannot serve the VLM, so it
can gate CI or a setup step.

  python scripts/mac_sanity.py
"""
from __future__ import annotations

import platform
import shutil
import subprocess
import sys


def _sysctl(key: str) -> str:
    try:
        return subprocess.check_output(["sysctl", "-n", key], text=True).strip()
    except Exception:
        return "?"


def main() -> int:
    ok = True
    print("=" * 62)
    print("SatQuery AI - Apple Silicon sanity")
    print("=" * 62)

    print(f"python           {platform.python_version()}")
    print(f"macOS            {platform.mac_ver()[0]}")
    print(f"chip             {_sysctl('machdep.cpu.brand_string')}")

    if platform.machine() != "arm64":
        print("FAIL  not arm64 - MLX requires Apple Silicon, not Rosetta/Intel")
        print("      -> run the API with SATQUERY_VLM_BACKEND=mock")
        return 1

    try:
        ram_gb = int(_sysctl("hw.memsize")) / 1024**3
    except ValueError:
        ram_gb = 0.0
    print(f"unified memory   {ram_gb:.0f} GB (shared with macOS - not dedicated VRAM)")

    try:
        import mlx.core as mx

        print(f"mlx              {mx.__version__}")
    except ImportError:
        print("FAIL  mlx missing  -> pip install mlx-vlm")
        return 1

    for mod in ("mlx_vlm", "transformers", "jinja2", "PIL"):
        try:
            m = __import__(mod)
            print(f"{mod:16} {getattr(m, '__version__', 'ok')}")
        except ImportError:
            print(f"FAIL  {mod} missing")
            ok = False

    # Real allocation + matmul on the Metal device, not just a version check.
    try:
        mx.reset_peak_memory()
        a = mx.random.normal((4096, 4096))
        mx.eval(a @ a)
        peak = mx.get_peak_memory() / 1024**3
        del a
        mx.clear_cache()
        print(f"metal matmul     OK (peak {peak:.2f} GB, freed)")
    except Exception as exc:
        print(f"FAIL  metal matmul: {exc}")
        ok = False

    # The budget that actually matters. A 4-bit 3B needs ~3.4 GB peak; macOS
    # itself holds 3-4 GB. Under 8 GB total this stops being comfortable.
    free_gb = 0.0
    if shutil.which("vm_stat"):
        try:
            out = subprocess.check_output(["vm_stat"], text=True)
            page = 16384
            free_pages = 0
            for line in out.splitlines():
                if line.startswith(("Pages free", "Pages inactive", "Pages speculative")):
                    free_pages += int(line.split(":")[1].strip().rstrip("."))
            free_gb = free_pages * page / 1024**3
        except Exception:
            pass
    print(f"free memory      {free_gb:.2f} GB")

    if ram_gb < 16:
        print("NOTE  8 GB class machine: use the 3B model, not the 7B.")
        print("      A 4-bit 7B is ~4.3 GB of weights before KV cache and")
        print("      visual tokens, which pushes macOS into swap.")
    if free_gb and free_gb < 4.0:
        print("WARN  under 4 GB free - close Chrome/Xcode before the demo.")

    print("=" * 62)
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
