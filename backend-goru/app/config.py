"""Runtime configuration. Env-driven so the same image runs on M1's 4060 and
on M2-M6's CPU laptops with no code change."""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "SATQUERY_", "extra": "ignore"}

    # "mock" runs everywhere and is what CI and the other five members use.
    # "local" loads the real 4-bit Qwen2-VL and requires CUDA.
    # "mlx"   loads 4-bit Qwen2.5-VL through Apple MLX and requires Apple
    #         Silicon. bitsandbytes has no Metal backend, so "local" cannot run
    #         on a Mac at all - this is the demo path on M1's MacBook.
    vlm_backend: str = Field(default="mock", pattern="^(mock|local|mlx)$")

    model_id: str = "Qwen/Qwen2-VL-7B-Instruct"

    # 3B, not 7B, and that is deliberate. A 4-bit 7B is ~4.3 GB of weights
    # before KV cache and visual tokens; on an 8 GB machine that leaves macOS
    # swapping and latency past 20 s. 3B lands near 2 GB and stays demo-safe.
    mlx_model_id: str = "mlx-community/Qwen2.5-VL-3B-Instruct-4bit"

    # A peft/CUDA adapter does NOT load into MLX - the formats differ. For the
    # mlx backend this must point at an MLX-format adapter, or at a merged
    # model converted with mlx_vlm.convert. See scripts/README_LORA.md.
    adapter_path: str | None = None

    # Visual tokens scale with pixel count; an uncapped 4000x4000 GeoTIFF tile
    # OOMs an 8 GB card instantly.
    #
    # 256 * 28*28 = 200704, measured by scripts/profile_mlx.py. On MLX this is
    # a LATENCY lever, not a memory one - across the sweep memory moved 3.34 ->
    # 3.87 GB while latency went 2.8s -> 8.9s. The 4s end-to-end target picks
    # this value; the CUDA lane can afford 768 * 28*28 and should raise it with
    # SATQUERY_MAX_PIXELS.
    #
    # This value MUST match what training used, or answers degrade silently.
    max_pixels: int = 256 * 28 * 28
    min_pixels: int = 64 * 28 * 28

    max_new_tokens: int = 384
    vram_ceiling_gb: float = 5.0

    data_dir: str = os.path.expanduser("~/.satquery/data")
    rules_only_router: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
