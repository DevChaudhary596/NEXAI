#!/usr/bin/env python3
"""Day 1: CUDA sanity check. Run on the 4060 AND in the Kaggle/Colab notebook.

Prints one report and exits non-zero if the host cannot train or serve, so it
can gate a CI step or a notebook cell.
"""
from __future__ import annotations

import sys


def main() -> int:
    ok = True
    print("=" * 62)
    print("SatQuery AI - CUDA sanity")
    print("=" * 62)

    try:
        import torch
    except ImportError:
        print("FAIL  torch not installed")
        return 1

    print(f"torch            {torch.__version__}")
    print(f"cuda build       {torch.version.cuda}")

    if not torch.cuda.is_available():
        print("FAIL  no CUDA device visible")
        print("      -> CPU host: run the API with SATQUERY_VLM_BACKEND=mock")
        return 1

    n = torch.cuda.device_count()
    print(f"devices          {n}")
    for i in range(n):
        prop = torch.cuda.get_device_properties(i)
        cap = f"{prop.major}.{prop.minor}"
        print(f"  [{i}] {prop.name}  {prop.total_memory / 1024**3:.1f} GB  SM {cap}")

    major = torch.cuda.get_device_capability()[0]
    if major >= 8:
        print("dtype            bf16 supported (Ampere+)")
    else:
        print("dtype            fp16 ONLY - this GPU has no bf16 (pre-Ampere, e.g. T4)")
        print("                 -> set fp16=True, bf16=False in TrainingArguments")

    try:
        import flash_attn  # noqa: F401

        has_fa = True
    except ImportError:
        has_fa = False
    attn = "flash_attention_2" if (major >= 8 and has_fa) else "sdpa"
    print(f"attn impl        {attn}")
    if major < 8:
        print("                 -> flash_attention_2 will RAISE on this GPU. Do not")
        print("                    copy it from a Qwen2-VL snippet; use sdpa.")

    try:
        import bitsandbytes as bnb

        print(f"bitsandbytes     {bnb.__version__}")
    except ImportError:
        print("FAIL  bitsandbytes missing - no 4-bit quantisation")
        ok = False

    for mod in ("transformers", "peft", "accelerate"):
        try:
            print(f"{mod:16} {__import__(mod).__version__}")
        except ImportError:
            print(f"FAIL  {mod} missing")
            ok = False

    # Real allocation + matmul, not just a version check.
    try:
        torch.cuda.reset_peak_memory_stats()
        a = torch.randn(4096, 4096, device="cuda", dtype=torch.float16)
        (a @ a).sum().item()
        torch.cuda.synchronize()
        peak = torch.cuda.max_memory_allocated() / 1024**3
        del a
        torch.cuda.empty_cache()
        print(f"matmul smoke     OK (peak {peak:.2f} GB, freed)")
    except Exception as exc:
        print(f"FAIL  matmul: {exc}")
        ok = False

    free, total = torch.cuda.mem_get_info()
    print(f"free VRAM        {free / 1024**3:.2f} / {total / 1024**3:.2f} GB")
    if free / 1024**3 < 5.0:
        print("WARN  under 5 GB free - close other processes before profiling")

    print("=" * 62)
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
