"""MLX backend tests. M1 Day 1-2 (Mac lane).

These must run without loading the 3B model so CI and M2-M6's machines stay
fast - the model-loading path is covered by scripts/profile_mlx.py instead.
"""
from __future__ import annotations

import platform

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.services.vlm import MLXQwen2VL, detect_accelerator, vram_scope

on_apple = platform.machine() == "arm64"
requires_mlx = pytest.mark.skipif(not on_apple, reason="Apple Silicon only")


def test_config_accepts_mlx_backend():
    assert Settings(vlm_backend="mlx").vlm_backend == "mlx"


def test_config_rejects_unknown_backend():
    with pytest.raises(ValidationError):
        Settings(vlm_backend="cuda")


def test_mlx_model_defaults_to_3b():
    """7B would not survive an 8 GB machine; guard the default against a
    well-meaning bump."""
    assert "3B" in Settings().mlx_model_id


def test_detect_accelerator_returns_known_value():
    assert detect_accelerator() in {"cuda", "mlx", "cpu"}


@requires_mlx
def test_detect_accelerator_finds_mlx_on_apple():
    assert detect_accelerator() == "mlx"


@requires_mlx
def test_vram_scope_reports_real_peak_on_mlx():
    """The bug this guards: a CUDA-only vram_scope silently reports 0.0 on a
    Mac, so M6's harness records no memory data for the whole demo lane."""
    import mlx.core as mx

    with vram_scope("test") as stats:
        a = mx.random.normal((2048, 2048))
        mx.eval(a @ a)

    assert stats["peak_gb"] > 0.0
    assert stats["elapsed_s"] > 0.0


@requires_mlx
def test_peft_adapter_path_is_rejected_with_a_useful_message():
    """A peft/CUDA LoRA directory looks plausible but its tensor layout is not
    MLX's. Fail at construction with instructions, not deep inside mlx_vlm."""
    s = Settings(vlm_backend="mlx", adapter_path="/tmp/definitely-not-an-mlx-adapter")
    with pytest.raises(RuntimeError, match="does not look like an MLX adapter"):
        MLXQwen2VL(s)


@requires_mlx
def test_fit_downscales_to_max_pixels(tmp_path):
    """max_pixels is the latency lever on this backend - if _fit stops
    shrinking, every query slows by ~3x."""
    from PIL import Image

    big = tmp_path / "tile.png"
    Image.new("RGB", (2048, 2048)).save(big)

    s = Settings(vlm_backend="mlx", max_pixels=256 * 28 * 28)
    vlm = MLXQwen2VL.__new__(MLXQwen2VL)  # skip __init__; _fit needs only .s
    vlm.s = s

    out = Image.open(vlm._fit(big))
    assert out.width * out.height <= s.max_pixels
    assert out.size != (2048, 2048)


@requires_mlx
def test_fit_leaves_small_images_alone(tmp_path):
    from PIL import Image

    small = tmp_path / "small.png"
    Image.new("RGB", (256, 256)).save(small)

    vlm = MLXQwen2VL.__new__(MLXQwen2VL)
    vlm.s = Settings(vlm_backend="mlx", max_pixels=256 * 28 * 28)

    assert vlm._fit(small) == small  # no copy, no resave


def test_healthz_reports_accelerator():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        body = c.get("/healthz").json()
    assert body["accelerator"] in {"cuda", "mlx", "cpu"}
