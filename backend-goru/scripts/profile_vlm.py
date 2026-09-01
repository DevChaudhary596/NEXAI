#!/usr/bin/env python3
"""Day 2: 4-bit VLM profiling against the VRAM ceiling.

Sweeps max_pixels, because that - not the weights - is what varies with input
and what decides whether an 8 GB card survives a real GeoTIFF tile. Prints a
table and exits non-zero if no setting fits the ceiling.

  python scripts/profile_vlm.py --ceiling 4.8
"""
from __future__ import annotations

import argparse
import gc
import sys
import time


def build_test_image(size: int = 2048):
    """Stand-in for a satellite tile; avoids needing real data on Day 2."""
    import numpy as np
    from PIL import Image

    rng = np.random.default_rng(0)
    arr = rng.integers(0, 255, (size, size, 3), dtype=np.uint8)
    return Image.fromarray(arr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2-VL-7B-Instruct")
    ap.add_argument("--ceiling", type=float, default=4.8, help="GB")
    ap.add_argument("--image-size", type=int, default=2048)
    ap.add_argument(
        "--sweep", type=int, nargs="+", default=[256, 512, 768, 1024, 1280],
        help="max_pixels in units of 28*28 patches",
    )
    args = ap.parse_args()

    import torch
    from transformers import AutoProcessor, BitsAndBytesConfig, Qwen2VLForConditionalGeneration

    if not torch.cuda.is_available():
        print("no CUDA - profiling must run on the 4060 or a GPU notebook")
        return 1

    cap = torch.cuda.get_device_capability()
    compute_dtype = torch.bfloat16 if cap[0] >= 8 else torch.float16
    try:
        import flash_attn  # noqa: F401

        attn = "flash_attention_2" if cap[0] >= 8 else "sdpa"
    except ImportError:
        attn = "sdpa"

    print(f"model    {args.model}")
    print(f"gpu      {torch.cuda.get_device_name(0)} (SM {cap[0]}.{cap[1]})")
    print(f"dtype    {compute_dtype} | attn {attn}")
    print(f"ceiling  {args.ceiling} GB\n")

    quant = BitsAndBytesConfig(
        load_in_4bit=True, bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype, bnb_4bit_use_double_quant=True,
    )
    torch.cuda.reset_peak_memory_stats()
    t0 = time.perf_counter()
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        args.model, quantization_config=quant, device_map="auto",
        attn_implementation=attn, torch_dtype=compute_dtype,
    ).eval()
    weights_gb = torch.cuda.max_memory_allocated() / 1024**3
    print(f"weights resident: {weights_gb:.2f} GB (loaded in {time.perf_counter() - t0:.0f}s)\n")

    image = build_test_image(args.image_size)
    print(f"{'max_pixels':>12} {'vis.tokens':>11} {'peak GB':>9} {'latency s':>10}  verdict")
    print("-" * 60)

    passing = []
    for units in args.sweep:
        max_pixels = units * 28 * 28
        try:
            processor = AutoProcessor.from_pretrained(
                args.model, min_pixels=64 * 28 * 28, max_pixels=max_pixels
            )
            messages = [{"role": "user", "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": "Describe the land cover in this scene."},
            ]}]
            text = processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True)
            inputs = processor(
                text=[text], images=[image], padding=True, return_tensors="pt"
            ).to(model.device)
            n_tokens = int(inputs["input_ids"].shape[1])

            torch.cuda.reset_peak_memory_stats()
            torch.cuda.synchronize()
            t = time.perf_counter()
            with torch.inference_mode():
                model.generate(**inputs, max_new_tokens=64, do_sample=False)
            torch.cuda.synchronize()
            latency = time.perf_counter() - t
            peak = torch.cuda.max_memory_allocated() / 1024**3

            verdict = "OK" if peak <= args.ceiling else "OVER CEILING"
            if peak <= args.ceiling:
                passing.append((units, peak, latency))
            print(f"{max_pixels:>12} {n_tokens:>11} {peak:>9.2f} {latency:>10.2f}  {verdict}")

            del inputs
        except torch.cuda.OutOfMemoryError:
            print(f"{max_pixels:>12} {'-':>11} {'OOM':>9} {'-':>10}  OOM")
        finally:
            gc.collect()
            torch.cuda.empty_cache()

    print()
    if not passing:
        print(f"FAIL  nothing fits under {args.ceiling} GB with this model.")
        print("      Options, in order of preference:")
        print("      1. Raise the ceiling - an 8 GB 4060 can serve ~6.5 GB safely.")
        print("      2. Drop to Qwen/Qwen2-VL-2B-Instruct (~2 GB in 4-bit).")
        print("      3. Lower --sweep further (192, 128).")
        return 1

    best = max(passing, key=lambda r: r[0])
    print(f"RECOMMENDED  SATQUERY_MAX_PIXELS={best[0] * 28 * 28}"
          f"  ({best[1]:.2f} GB, {best[2]:.2f}s)")
    print("Use this SAME value when training, or answers degrade silently.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
