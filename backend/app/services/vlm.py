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
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.core.config import Settings, get_settings

log = logging.getLogger(__name__)

# ── System prompts (M1 Days 9 & 12) ──────────────────────────────────────
#
# Two layers, composed at call time by `build_system_prompt`:
#   1. ANSWER_SYSTEM_PROMPT - always on. Forces the structured bullet format
#      judges and analysts can scan in two seconds, and reiterates the
#      no-hallucinated-numbers rule the orchestrator's `_summarise` already
#      enforces one layer down.
#   2. SCENARIO_SYSTEM_PROMPTS - one of the 3 flagship demo scenarios, picked
#      by `select_scenario` from the routing decision + raw query text.
#      Hardcoded and stable on purpose: these are the exact three scenes M6
#      rehearses, so the wording should not vary run to run.

ANSWER_SYSTEM_PROMPT = """You are SOLEN, an elite AI geospatial and remote sensing defense/civilian intelligence analyst.

Deliver an authoritative, sharp, and structured INTELLIGENCE REPORT for every query.
Never output robotic disclaimers or internal meta-phrases (e.g., never say 'No tool findings were provided' or 'Tool findings are empty'). Speak with direct, professional intelligence authority.

Always format your response using this consistent report structure with bold uppercase field titles:
### 🛰️ SATELLITE GEOSPATIAL INTELLIGENCE BRIEFING
- **TARGET / AREA IMPACTED**: Identify the exact geographic area, facilities, landmarks, and land-use categories visible or queried.
- **SURFACE OBSERVATIONS & INFRASTRUCTURE**: Provide detailed physical and structural observations—roof profiles, road networks, terrain features, vegetation canopy, and surrounding layout.
- **DENSITY & ASSET INVENTORY**: When object detection or spectral figures are provided in tool findings, state the exact count and subclass breakdown verbatim first. If visual-only, provide spatial density and activity pattern observations.
- **RISK RATING**: State the risk level in uppercase (LOW / MODERATE / HIGH / SEVERE) followed by a sharp analytical justification.
- **TACTICAL RECOMMENDATIONS**: Outline practical next steps, required sensor pairs for bi-temporal change detection, or orbital monitoring priorities.

Core Rules:
1. Never invent or contradict numbers from trained neural network models. If provided, state them verbatim.
2. Always maintain the standardized uppercase report structure across all responses.
3. Every sentence must add concrete analytical value."""

SCENARIO_SYSTEM_PROMPTS: dict[str, str] = {
    "flood": """Scenario: Disaster / Flood Assessment. Frame "Area Impacted" as \
flooded/inundated extent, "Density" as the % of the scene or ROI underwater, \
and "Risk Rating" on displacement/infrastructure risk (Low < 5% of area, \
Moderate 5-20%, High 20-50%, Severe > 50%).""",
    "agriculture": """Scenario: Agricultural Stress. Frame "Area Impacted" as \
crop/vegetation extent, "Density" as mean NDVI or the stressed-area fraction, \
and "Risk Rating" on crop health (Low = healthy/NDVI>0.5, Moderate = mild \
stress, High = significant stress, Severe = likely crop failure).""",
    "port_surveillance": """Scenario: Defense / Port Surveillance. Frame "Area \
Impacted" as the harbor/berth area covered, "Density" as vessel or object \
count and rough spacing, and "Risk Rating" on anomalous activity (Low = \
routine traffic, Moderate = elevated count, High = dense/clustered activity, \
Severe = pattern inconsistent with normal traffic) - never claim vessel \
identity or intent, only what is visually/statistically observable.""",
}


def select_scenario(tool_call: Any, prompt: str) -> str | None:
    """Map a routing decision + raw query onto one of the 3 flagship demo
    scenarios, or None for general queries that don't fit any of them.

    Cheap keyword/index matching, deliberately - same "rules first, free,
    cannot hallucinate" philosophy as app/services/router.py's rule pass.
    """
    action = getattr(tool_call, "action", None)
    action_val = getattr(action, "value", action)
    text = prompt.lower()

    if action_val == "spectral":
        index_val = getattr(getattr(tool_call, "index", None), "value", None)
        if index_val == "ndwi" or any(
            w in text for w in ("flood", "flooded", "flooding", "inundat", "disaster")
        ):
            return "flood"
        if index_val == "ndvi" or any(
            w in text for w in ("crop", "agricultur", "farm", "vegetation", "drought")
        ):
            return "agriculture"
        return None

    if action_val in ("detection", "segmentation"):
        target = getattr(tool_call, "target", "") or ""
        if target in ("ship", "harbor") or any(
            w in text for w in ("port", "harbor", "harbour", "vessel", "naval", "dock")
        ):
            return "port_surveillance"
        if any(w in text for w in ("flood", "flooded", "flooding", "inundat", "disaster")):
            return "flood"
        if any(w in text for w in ("crop", "agricultur", "farm", "vegetation", "drought")):
            return "agriculture"

    # General VQA / other queries: trigger scenario if query text strongly indicates one
    if any(w in text for w in ("flood", "flooded", "flooding", "inundat", "disaster")):
        return "flood"
    if any(w in text for w in ("crop", "agricultur", "farm", "vegetation", "drought")):
        return "agriculture"
    if any(w in text for w in ("port", "harbor", "harbour", "vessel", "naval", "dock")):
        return "port_surveillance"

    return None


def build_system_prompt(tool_call: Any, prompt: str) -> str:
    """Compose the base structured-output prompt with a scenario overlay, if
    the query matches one of the 3 flagship demos."""
    scenario = select_scenario(tool_call, prompt)
    if scenario is None:
        return ANSWER_SYSTEM_PROMPT
    return f"{ANSWER_SYSTEM_PROMPT}\n\n{SCENARIO_SYSTEM_PROMPTS[scenario]}"


class VLMBackend:
    """Interface. `generate_json` is what IntentRouter needs; `answer` is the
    user-facing generation."""

    name: str = "base"

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        raise NotImplementedError

    def answer(
        self,
        prompt: str,
        image_path: str | Path | None = None,
        *,
        context: str = "",
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> str:
        """`history` is prior turns as [{"role": "user"|"assistant", "content": ...}],
        oldest first, text-only - the image is bound to the *current* turn
        only (Day 8). `system_prompt` is Day 9/12's structured-output prompt,
        built by `build_system_prompt`."""
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
        self,
        prompt: str,
        image_path: str | Path | None = None,
        *,
        context: str = "",
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> str:
        head = "*(mock VLM - set SATQUERY_VLM_BACKEND=local on GPU or mlx on Apple Silicon)*"
        memory_note = (
            f" (considering {len(history)} prior turn(s) of context)" if history else ""
        )
        if context:
            bullets = f"Based on the analysis of this scene{memory_note}:\n\n{context}"
            if system_prompt:
                # Shape parity with the real backends: a scenario/structured
                # system prompt should visibly change the mock's phrasing too,
                # so tests exercise the same wiring, not just the real model.
                bullets = (
                    f"- **Density / Count**: {context}{memory_note}\n"
                    f"- **Risk Rating**: see findings above"
                )
            return f"{head}\n\n{bullets}"

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
                f"{head}{memory_note}\n\n"
                f"The satellite scene shows an aerial view containing {summary}. "
                f"You can ask questions like 'how many planes are here?' or 'detect storage tanks' to visualize them on the map."
            )

        return (
            f"{head}{memory_note}\n\n"
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

    def _build(
        self,
        prompt: str,
        image_path: str | Path | None,
        *,
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> dict[str, Any]:
        messages: list[dict[str, Any]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        # Text-only prior turns - Day 8's whole point is that these never
        # carry an image, so the KV cache never re-encodes the base crop.
        for turn in history or []:
            messages.append({"role": turn["role"], "content": turn["content"]})

        content: list[dict[str, Any]] = []
        if image_path is not None:
            content.append({"type": "image", "image": str(image_path)})
        content.append({"type": "text", "text": prompt})
        messages.append({"role": "user", "content": content})

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
                use_cache=True,
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
        self,
        prompt: str,
        image_path: str | Path | None = None,
        *,
        context: str = "",
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> str:
        full = prompt if not context else f"{prompt}\n\nTool findings:\n{context}"
        inputs = self._build(full, image_path, history=history, system_prompt=system_prompt)
        return self._generate(inputs, self.s.max_new_tokens, greedy=False)

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

    @staticmethod
    def _compose_text(
        prompt: str, history: list[dict[str, str]] | None, system_prompt: str
    ) -> str:
        """mlx_vlm's `apply_chat_template` helper takes one flat prompt string,
        not a message list - so system prompt and history are folded into
        that string rather than passed as structured turns. Cruder than the
        CUDA path's real multi-message template, but Qwen2.5-VL follows
        clearly-labeled turns in a single user message fine, and this is the
        only demo host guaranteed present on Day 7/Day 8 (M1's MacBook)."""
        parts: list[str] = []
        if system_prompt:
            parts.append(f"[system]\n{system_prompt}")
        for turn in history or []:
            speaker = "User" if turn["role"] == "user" else "Assistant"
            parts.append(f"{speaker}: {turn['content']}")
        parts.append(f"User: {prompt}" if history else prompt)
        return "\n\n".join(parts)

    def _run(
        self,
        prompt: str,
        image_path: str | Path | None,
        max_tokens: int,
        *,
        greedy: bool,
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> str:
        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template

        images: list[str] = []
        if image_path is not None and Path(image_path).exists():
            images = [str(self._fit(image_path))]

        composed = self._compose_text(prompt, history, system_prompt)
        formatted = apply_chat_template(
            self.processor, self.config, composed, num_images=len(images)
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
        self,
        prompt: str,
        image_path: str | Path | None = None,
        *,
        context: str = "",
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> str:
        full = prompt if not context else f"{prompt}\n\nTool findings:\n{context}"
        return self._run(
            full, image_path, self.s.max_new_tokens, greedy=False,
            history=history, system_prompt=system_prompt,
        )

    def peak_vram_gb(self) -> float | None:
        return self._peak or None


class GroqVLM(VLMBackend):
    """Cloud VLM backend powered by Groq's ultra-low latency inference engine.

    Uses Groq's multimodal vision models (llama-3.2-11b-vision-preview) for
    satellite scene analysis and high-intelligence models (llama-3.3-70b-versatile)
    for general questions and query routing. Fuses deterministic trained CV/GIS
    tool findings seamlessly into answers.
    """

    name = "groq"

    def __init__(self, settings: Settings | None = None) -> None:
        self.s = settings or get_settings()
        api_key = (
            self.s.groq_api_key
            or os.getenv("SATQUERY_GROQ_API_KEY")
            or os.getenv("GROQ_API_KEY")
        )
        if not api_key:
            raise ValueError(
                "Groq API key missing. Set SATQUERY_GROQ_API_KEY or GROQ_API_KEY."
            )
        try:
            from groq import Groq

            self.client = Groq(api_key=api_key, max_retries=0, timeout=5.0)
        except ImportError as exc:
            raise ImportError(
                "groq package is not installed. Run `pip install groq`."
            ) from exc

        # Auto-detect best available models on user's Groq account
        available_ids: set[str] = set()
        try:
            m_list = self.client.models.list()
            available_ids = {m.id for m in m_list.data}
        except Exception as e:
            log.debug("Could not query Groq models list: %s", e)

        vision_candidates = [
            self.s.groq_model,
            "qwen/qwen3.8-27b",
            "llama-3.2-11b-vision-preview",
            "llama-3.2-90b-vision-preview",
        ]
        text_candidates = [
            self.s.groq_text_model,
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-120b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ]

        self.model = next((c for c in vision_candidates if c and (not available_ids or c in available_ids)), "qwen/qwen3.8-27b")
        self.text_model = next((c for c in text_candidates if c and (not available_ids or c in available_ids)), self.model)
        log.info("Initialized GroqVLM (vision: %s, text: %s)", self.model, self.text_model)

    def _encode_image(self, image_path: str | Path | None, max_dim: int = 512) -> str | None:
        if not image_path:
            return None
        p = Path(image_path)
        if not p.exists():
            return None
        try:
            import base64
            import io
            from PIL import Image

            try:
                img = Image.open(p)
                if img.mode != "RGB":
                    img = img.convert("RGB")
            except Exception:
                import numpy as np
                import rasterio

                with rasterio.open(str(p)) as src:
                    if src.count >= 3:
                        arr = src.read([1, 2, 3])
                    else:
                        arr = np.repeat(src.read(1)[np.newaxis, :, :], 3, axis=0)
                    if arr.dtype == np.uint16:
                        arr = (arr / 256).astype(np.uint8)
                    elif arr.dtype in (np.float32, np.float64):
                        arr = np.clip(
                            arr * 255 if arr.max() <= 1.0 else arr, 0, 255
                        ).astype(np.uint8)
                    arr = np.transpose(arr, (1, 2, 0))
                    img = Image.fromarray(arr)

            if img.width > max_dim or img.height > max_dim:
                img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=70)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as exc:
            log.warning("Failed to encode image %s for Groq vision: %s", image_path, exc)
            return None

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str:
        try:
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a routing classification engine that strictly outputs valid JSON. "
                        "Output nothing except valid JSON."
                    ),
                },
                {"role": "user", "content": prompt},
            ]
            resp = self.client.chat.completions.create(
                model=self.text_model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.0,
                max_tokens=max_new_tokens,
            )
            return resp.choices[0].message.content.strip()
        except Exception as exc:
            log.warning("Groq JSON generation failed: %s; falling back to rule router", exc)
            return MockVLM().generate_json(prompt, max_new_tokens=max_new_tokens)

    def answer(
        self,
        prompt: str,
        image_path: str | Path | None = None,
        *,
        context: str = "",
        history: list[dict[str, str]] | None = None,
        system_prompt: str = "",
    ) -> str:
        default_sys = (
            "You are SOLEN Intelligence Copilot, an elite AI geospatial, remote sensing, and defense intelligence analyst.\n"
            "Format EVERY response as a structured, executive GEOSPATIAL INTELLIGENCE REPORT.\n"
            "Never output robotic debugging disclaimers (e.g. do NOT say 'Status: No active Tool findings were provided'). Speak with direct intelligence authority.\n\n"
            "Always follow this consistent briefing pattern with uppercase bold headers:\n"
            "### 🛰️ SATELLITE GEOSPATIAL INTELLIGENCE BRIEFING\n"
            "- **TARGET / AREA IMPACTED**: Geographic location, facilities, and land-use categorization.\n"
            "- **SURFACE OBSERVATIONS & INFRASTRUCTURE**: Detailed physical analysis of visible structures, road networks, building footprints, and environmental layout.\n"
            "- **DENSITY & ASSET INVENTORY**: When object detection or spectral counts are provided in findings, state the exact total count and subclass breakdown verbatim first. If visual-only, provide spatial density and activity pattern observations.\n"
            "- **RISK RATING**: State the risk level in uppercase (LOW / MODERATE / HIGH / SEVERE) with sharp analytical justification.\n"
            "- **TACTICAL RECOMMENDATIONS**: Actionable next steps, required sensor pairs for bi-temporal change detection, or orbital monitoring priorities.\n\n"
            "Never contradict or hallucinate conflicting figures. Keep the tone sharp, professional, and military-grade."
        )
        sys_content = f"{default_sys}\n\n{system_prompt}" if system_prompt else default_sys

        messages: list[dict[str, Any]] = [{"role": "system", "content": sys_content}]

        for turn in history or []:
            role = "user" if turn.get("role") == "user" else "assistant"
            content = (turn.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})

        query_text = prompt
        if context:
            query_text = f"{prompt}\n\nTool findings (ground truth from trained models):\n{context}"

        # If tool findings are present (from CV detection or GIS spectral analysis),
        # the specialized engine has already inspected the pixels and extracted the ground truth.
        # Bypass heavy image transmission and route directly to text_model for sub-second responses.
        if context:
            messages.append({"role": "user", "content": query_text})
            model_to_call = self.text_model
        else:
            encoded_img = self._encode_image(image_path)
            if encoded_img:
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": query_text},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{encoded_img}"
                            },
                        },
                    ],
                })
                model_to_call = self.model
            else:
                messages.append({"role": "user", "content": query_text})
                model_to_call = self.text_model

        try:
            resp = self.client.chat.completions.create(
                model=model_to_call,
                messages=messages,
                temperature=0.3,
                max_tokens=self.s.max_new_tokens if self.s.max_new_tokens > 300 else 600,
            )
            ans = resp.choices[0].message.content or ""
            # Strip reasoning model chain-of-thought blocks if present
            import re
            ans = re.sub(r"<think>.*?</think>", "", ans, flags=re.DOTALL).strip()
            return ans
        except Exception as exc:
            # If vision model encountered a rate limit (429) or issue, fallback immediately to text model
            if model_to_call == self.model:
                try:
                    log.warning("Groq vision request failed (%s); instantly trying text model %s", exc, self.text_model)
                    messages[-1]["content"] = query_text
                    resp = self.client.chat.completions.create(
                        model=self.text_model,
                        messages=messages,
                        temperature=0.3,
                        max_tokens=600,
                    )
                    ans = resp.choices[0].message.content or ""
                    import re
                    ans = re.sub(r"<think>.*?</think>", "", ans, flags=re.DOTALL).strip()
                    return ans
                except Exception as text_exc:
                    log.error("Groq fallback text request also failed: %s", text_exc)
            log.error("Groq API error: %s", exc)
            mock_ans = MockVLM().answer(prompt, image_path, context=context, history=history, system_prompt=system_prompt)
            return f"{mock_ans}\n\n*(Notice: Groq inference rate limit reached, falling back to local findings)*"

    def peak_vram_gb(self) -> float | None:
        return None


_backend: VLMBackend | None = None


def get_vlm() -> VLMBackend:
    """Process-wide singleton. Loading 4-bit weights twice OOMs an 8 GB card."""
    global _backend
    if _backend is None:
        s = get_settings()
        has_groq_key = bool(
            s.groq_api_key
            or os.getenv("SATQUERY_GROQ_API_KEY")
            or os.getenv("GROQ_API_KEY")
        )
        if s.vlm_backend == "groq":
            try:
                _backend = GroqVLM(s)
            except Exception as exc:
                log.warning("GroqVLM init failed: %s. Falling back to MockVLM.", exc)
                _backend = MockVLM()
        elif s.vlm_backend == "local":
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
