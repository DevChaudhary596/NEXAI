"""VLM backends. M1 Days 2, 4 and 6.

Three implementations behind one interface:

  MockVLM      - deterministic, no torch, no GPU. This is what M2-M6 run so the
                 whole API works on a CPU laptop, and what CI uses.
  MLXQwen2VL   - 4-bit Qwen2.5-VL on Apple Silicon via MLX. The demo path: it
                 is the only real backend that runs on M1's MacBook, and the
                 only one guaranteed to be physically present on Day 7.
  LocalQwen2VL - 4-bit Qwen2-VL on CUDA. Better answers, needs an NVIDIA host.

The split is what stops "the backend needs M1's GPU" from becoming a blocker
for five people. Switching is one env var; nothing above this module changes.
"""
from __future__ import annotations

import gc
import logging
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)


class VLMBackend:
    """Interface. `generate_json` is what IntentRouter needs; `answer` is the
    user-facing generation."""

    name: str = "base"

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        raise NotImplementedError

    def answer(
        self, prompt: str, image_path: str | Path | None = None, *, context: str = ""
    ) -> str:
        raise NotImplementedError

    def peak_vram_gb(self) -> float | None:
        return None


class MockVLM(VLMBackend):
    """No-GPU stand-in. Answers are templated but the *shape* is identical to
    the real backend, so integration tests exercise real code paths."""

    name = "mock"

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        # Mirror the router's own rules so mock routing stays coherent.
        from app.services.router import route_by_rules

        query = prompt.rsplit("User query:", 1)[-1].strip()
        decision = route_by_rules(query)
        if decision is None:
            return '{"action":"general_vqa"}'
        return decision.tool_call.model_dump_json()

    def answer(
        self, prompt: str, image_path: str | Path | None = None, *, context: str = ""
    ) -> str:
        head = "*(mock VLM - set SATQUERY_VLM_BACKEND=local on GPU or mlx on Apple Silicon)*"
        if context:
            return f"{head}\n\nBased on the analysis of this scene:\n\n{context}"

        desc_parts = []
        if image_path and Path(image_path).exists():
            try:
                from app.services.cv import get_cv
                cv = get_cv()
                for target in ["plane", "ship", "storage_tank", "vehicle"]:
                    fc = cv.detect(image_path, target, None, 0.35)
                    if fc.count > 0:
                        desc_parts.append(f"{fc.count} {target.replace('_', ' ')}(s)")
            except Exception as exc:
                log.debug("Mock VLM scene inspection fallback: %s", exc)

        if desc_parts:
            summary = ", ".join(desc_parts)
            return (
                f"{head}\n\n"
                f"The satellite scene shows an aerial view containing {summary}. "
                f"You can ask questions like 'how many planes are here?' or 'detect storage tanks' to visualize them on the map."
            )

        return (
            f"{head}\n\n"
            f"I can see the satellite scene. You can ask object detection questions (e.g. planes, ships, tanks, vehicles), "
            f"segmentation queries, or spectral index analyses (NDVI, NDWI) across the scene or within a selected ROI."
        )


def _cuda_capability() -> tuple[int, int] | None:
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        return torch.cuda.get_device_capability()
    except Exception:
        return None


def select_attn_implementation() -> str:
    """flash_attention_2 needs Ampere (SM 8.0+). A T4 is SM 7.5 and will raise
    on the first forward pass - most Qwen2-VL snippets online hardcode it.
    The 4060 is SM 8.9 and supports it, so gate rather than pick one."""
    cap = _cuda_capability()
    if cap is None:
        return "eager"
    if cap[0] >= 8:
        try:
            import flash_attn  # noqa: F401

            return "flash_attention_2"
        except ImportError:
            return "sdpa"
    return "sdpa"


def select_compute_dtype() -> Any:
    """T4 (SM 7.5) has no bf16. Ada does. Choosing wrong is a silent slowdown
    on one side and a hard error on the other."""
    import torch

    cap = _cuda_capability()
    if cap is not None and cap[0] >= 8:
        return torch.bfloat16
    return torch.float16


def detect_accelerator() -> str:
    """"cuda" | "mlx" | "cpu". Decides which allocator vram_scope measures.

    CUDA wins when both are importable so a Linux/Windows GPU host never
    silently reports Metal numbers.
    """
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    try:
        import mlx.core  # noqa: F401

        return "mlx"
    except Exception:
        return "cpu"


@contextmanager
def vram_scope(label: str = "") -> Iterator[dict[str, float]]:
    """Measure peak accelerator memory across a block and hand it back after.

    The empty_cache/collect pair on exit is the Day-6 requirement: without it,
    the allocator holds freed blocks and peak creeps up across sequential
    VLM -> CV -> GIS calls until the fourth query OOMs.

    On Apple Silicon the same contract holds against unified memory, which is
    scarcer than VRAM on a discrete card - 8 GB shared with macOS, not 8 GB
    dedicated. M6's harness reads these numbers, so a Mac run must report real
    figures rather than the 0.0 a CUDA-only implementation returns here.
    """
    stats: dict[str, float] = {"peak_gb": 0.0, "elapsed_s": 0.0}
    accel = detect_accelerator()
    torch = mx = None

    if accel == "cuda":
        import torch

        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
    elif accel == "mlx":
        import mlx.core as mx

        mx.reset_peak_memory()

    start = time.perf_counter()
    try:
        yield stats
    finally:
        if accel == "cuda":
            torch.cuda.synchronize()
            stats["peak_gb"] = torch.cuda.max_memory_allocated() / 1024**3
        elif accel == "mlx":
            stats["peak_gb"] = mx.get_peak_memory() / 1024**3
        stats["elapsed_s"] = time.perf_counter() - start
        gc.collect()
        if accel == "cuda":
            torch.cuda.empty_cache()
        elif accel == "mlx":
            # MLX's buffer cache is the Metal analogue of the CUDA caching
            # allocator: freed blocks stay resident until cleared, which on a
            # shared-memory machine pushes macOS into swap.
            mx.clear_cache()
        if label:
            log.info(
                "[mem:%s] %s peak=%.2f GB in %.2fs",
                accel, label, stats["peak_gb"], stats["elapsed_s"],
            )


class LocalQwen2VL(VLMBackend):
    """4-bit Qwen2-VL. Requires CUDA - never instantiated on the CPU hosts."""

    name = "local"

    def __init__(self, settings: Settings | None = None):
        import torch
        from transformers import (
            AutoProcessor, BitsAndBytesConfig, Qwen2VLForConditionalGeneration,
        )

        self.s = settings or get_settings()
        if not torch.cuda.is_available():
            raise RuntimeError(
                "LocalQwen2VL needs CUDA. Use SATQUERY_VLM_BACKEND=mock on CPU hosts."
            )

        compute_dtype = select_compute_dtype()
        quant = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=compute_dtype,
            bnb_4bit_use_double_quant=True,  # ~0.4 GB saved, no measurable quality cost
        )

        log.info(
            "loading %s | attn=%s | dtype=%s | max_pixels=%d",
            self.s.model_id, select_attn_implementation(), compute_dtype, self.s.max_pixels,
        )
        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            self.s.model_id,
            quantization_config=quant,
            device_map="auto",
            attn_implementation=select_attn_implementation(),
            torch_dtype=compute_dtype,
        )
        # Capping here (not at load) is what keeps a 4000x4000 tile from
        # exploding into tens of thousands of visual tokens.
        self.processor = AutoProcessor.from_pretrained(
            self.s.model_id,
            min_pixels=self.s.min_pixels,
            max_pixels=self.s.max_pixels,
        )

        if self.s.adapter_path:
            from peft import PeftModel

            self.model = PeftModel.from_pretrained(self.model, self.s.adapter_path)
            self.model = self.model.eval()
            log.info("LoRA adapter merged from %s", self.s.adapter_path)

        self.model.eval()
        self._peak = 0.0

    def _build(self, prompt: str, image_path: str | Path | None) -> dict[str, Any]:
        content: list[dict[str, Any]] = []
        if image_path is not None:
            content.append({"type": "image", "image": str(image_path)})
        content.append({"type": "text", "text": prompt})
        messages = [{"role": "user", "content": content}]

        text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        images = None
        if image_path is not None:
            from PIL import Image

            images = [Image.open(image_path).convert("RGB")]
        return self.processor(
            text=[text], images=images, padding=True, return_tensors="pt"
        ).to(self.model.device)

    def _generate(self, inputs: dict[str, Any], max_new_tokens: int, *, greedy: bool) -> str:
        import torch

        with vram_scope("generate") as stats, torch.inference_mode():
            out = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=not greedy,
                temperature=None if greedy else 0.7,
                pad_token_id=self.processor.tokenizer.pad_token_id
                or self.processor.tokenizer.eos_token_id,
            )
        self._peak = max(self._peak, stats["peak_gb"])
        trimmed = out[:, inputs["input_ids"].shape[1]:]
        return self.processor.batch_decode(
            trimmed, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0].strip()

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        # Greedy: routing must be reproducible run to run or M6's benchmark
        # numbers move on their own.
        return self._generate(self._build(prompt, None), max_new_tokens, greedy=True)

    def answer(
        self, prompt: str, image_path: str | Path | None = None, *, context: str = ""
    ) -> str:
        full = prompt if not context else f"{prompt}\n\nTool findings:\n{context}"
        return self._generate(
            self._build(full, image_path), self.s.max_new_tokens, greedy=False
        )

    def peak_vram_gb(self) -> float | None:
        return self._peak or None


class MLXQwen2VL(VLMBackend):
    """4-bit Qwen2.5-VL on Apple Silicon through MLX.

    Why this exists: bitsandbytes has no Metal backend, so `LocalQwen2VL`
    cannot be instantiated on a Mac at all, in any dtype. MLX talks to the
    M-series GPU directly and a 4-bit 3B sits near 2 GB, which is what makes an
    8 GB MacBook a viable host for the Day 7 demo.

    The interface is identical to LocalQwen2VL on purpose - IntentRouter and
    the orchestrator never learn which one they are holding.
    """

    name = "mlx"

    def __init__(self, settings: Settings | None = None):
        import mlx.core as mx
        from mlx_vlm import load
        from mlx_vlm.utils import load_config

        self.s = settings or get_settings()
        self.mx = mx
        model_id = self.s.mlx_model_id

        adapter = self.s.adapter_path or None
        if adapter and not (Path(adapter) / "adapters.safetensors").exists():
            # The failure this catches: a peft adapter trained on Kaggle/CUDA
            # looks like a valid directory but its tensor layout is not MLX's,
            # and `load` fails deep inside with an unhelpful key error.
            raise RuntimeError(
                f"{adapter} does not look like an MLX adapter "
                "(no adapters.safetensors). A peft/CUDA LoRA cannot be loaded "
                "here - merge it into the base on the training host, convert "
                "with `mlx_vlm.convert -q --q-bits 4`, and point "
                "SATQUERY_MLX_MODEL_ID at the result instead."
            )

        log.info(
            "loading %s via MLX | adapter=%s | max_pixels=%d",
            model_id, adapter or "none", self.s.max_pixels,
        )
        with vram_scope("mlx-load"):
            self.model, self.processor = load(model_id, adapter_path=adapter)
            self.config = load_config(model_id)

        self._peak = 0.0

    def _fit(self, image_path: str | Path) -> Path:
        """Downscale to the configured visual-token budget before inference.

        Same lever as `max_pixels` on the CUDA path, applied explicitly here
        because we control the file handed to `generate`. A 4000x4000 GeoTIFF
        tile carries ~20k visual tokens; the model would discard that detail
        anyway, so resizing first is free accuracy-wise and is the single
        biggest latency and memory win on this backend.
        """
        import tempfile

        from PIL import Image

        img = Image.open(image_path).convert("RGB")
        budget = self.s.max_pixels
        if img.width * img.height <= budget:
            return Path(image_path)

        scale = (budget / (img.width * img.height)) ** 0.5
        size = (max(28, int(img.width * scale)), max(28, int(img.height * scale)))
        log.info("resize %s -> %s (max_pixels=%d)", img.size, size, budget)
        img = img.resize(size, Image.LANCZOS)

        tmp = Path(tempfile.mkdtemp(prefix="satquery-")) / "scene.png"
        img.save(tmp)
        return tmp

    def _run(
        self,
        prompt: str,
        image_path: str | Path | None,
        max_tokens: int,
        *,
        greedy: bool,
    ) -> str:
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template

        images: list[str] = []
        if image_path is not None and Path(image_path).exists():
            images = [str(self._fit(image_path))]

        formatted = apply_chat_template(
            self.processor, self.config, prompt, num_images=len(images)
        )

        with vram_scope("mlx-generate") as stats:
            result = generate(
                self.model,
                self.processor,
                formatted,
                image=images or None,
                max_tokens=max_tokens,
                # Greedy for routing: the tool decision must be reproducible or
                # M6's benchmark numbers drift between runs on their own.
                temperature=0.0 if greedy else 0.7,
                verbose=False,
            )

        self._peak = max(self._peak, stats["peak_gb"])
        log.info(
            "[mlx] %d tok @ %.1f tok/s", result.generation_tokens, result.generation_tps
        )
        return result.text.strip()

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        return self._run(prompt, None, max_new_tokens, greedy=True)

    def answer(
        self, prompt: str, image_path: str | Path | None = None, *, context: str = ""
    ) -> str:
        full = prompt if not context else f"{prompt}\n\nTool findings:\n{context}"
        return self._run(full, image_path, self.s.max_new_tokens, greedy=False)

    def peak_vram_gb(self) -> float | None:
        return self._peak or None


_backend: VLMBackend | None = None


def get_vlm() -> VLMBackend:
    """Process-wide singleton. Loading 4-bit weights twice OOMs an 8 GB card."""
    global _backend
    if _backend is None:
        s = get_settings()
        if s.vlm_backend == "local":
            _backend = LocalQwen2VL(s)
        elif s.vlm_backend == "mlx":
            _backend = MLXQwen2VL(s)
        else:
            _backend = MockVLM()
        log.info("VLM backend: %s", _backend.name)
    return _backend


def reset_vlm() -> None:
    """Test hook."""
    global _backend
    _backend = None
