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

ANSWER_SYSTEM_PROMPT = """You are SOLEN AI, an elite geospatial intelligence (GEOINT), remote sensing, and Earth observation analytics copilot.

CORE BEHAVIOR DIRECTIVES:
1. DIRECT RELEVANCE FIRST: Always answer EXACTLY what the user asks. If the user asks a specific question (e.g., explaining an index, why a count changed, sensor specs, or advice), provide a direct, sharp, deeply informed technical answer immediately. Never evade the question or output generic filler.
2. REPORTS & ASSESSMENTS: When the user asks for a REPORT, BRIEFING, or COMPREHENSIVE ASSESSMENT (or asks to analyze/describe an AOI or imagery scene):
   Deliver a high-IQ, authoritative, structured Executive Intelligence Report tailored to their specific inquiry:
   - 📋 **EXECUTIVE SUMMARY & SCOPE**: Direct overview of the location, target focus, and operational scope.
   - 🎯 **GROUND-TRUTH FINDINGS**: State any exact numbers, object counts, or index values from tool findings verbatim first.
   - 🔍 **SPATIAL & INFRASTRUCTURE ANALYSIS**: Deep spatial reasoning on layout, density, vehicle/structure alignment, terrain, or environmental patterns.
   - ⚠️ **OPERATIONAL & RISK ASSESSMENT**: Specific risk or efficiency rating (LOW / MODERATE / HIGH / CRITICAL) with concrete justification.
   - 🚀 **ACTIONABLE RECOMMENDATIONS**: Tactical next steps, sensor pairing suggestions, or monitoring intervals.
3. GROUND-TRUTH CITATION: When tool findings (e.g. from trained computer vision or GIS spectral models) are provided in context, treat them as verified ground-truth observations. Integrate those exact numbers and classifications naturally into your analysis.
4. UNBOUND QUERIES: If no satellite scene or AOI is active and the user asks to scan, count, or segment, clearly advise them how to use the Box Select (⛶) tool on the 3D globe to draw an AOI box or mount a scene from the Data Library.
5. NO CONFLICTING HALLUCINATIONS: Never invent numbers that contradict tool findings. Maintain an articulate, confident, and professional intelligence-grade tone."""

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

        p_lower = prompt.lower()
        ctx_lower = context.lower() if context else ""

        # Case 1: Active Tool Findings in context
        if context and not context.startswith("NO_SCENE_BOUND"):
            # If this is a hardware / scene limitation notice from guardrails
            if any(w in ctx_lower for w in ("cannot support", "limitation", "not support", "corrupt")):
                return (
                    f"{head}{memory_note}\n\n"
                    f"⚠️ **Analysis Notice**: {context}\n\n"
                    f"To perform multispectral analysis (such as NDWI flood extent or NDVI vegetation health), "
                    f"please ensure the scene contains the required Near-Infrared (NIR) bands (such as 4-band or Sentinel-2 12-band GeoTIFFs)."
                )

            # Option 3: Domain classification
            is_surveillance = any(w in ctx_lower or w in p_lower for w in ("detector", "instance", "ship", "plane", "vehicle", "tank", "harbor", "vessel"))
            is_environmental = any(w in ctx_lower or w in p_lower for w in ("ndwi", "ndvi", "ndbi", "spectral", "flood", "crop", "water", "vegetation", "drought", "forest"))

            if is_surveillance:
                bullets = (
                    f"### 🛰️ SURVEILLANCE & TARGET DETECTION REPORT{memory_note}\n"
                    f"- **Target & Scope**: {context}\n"
                    f"- **Density / Count**: {context}\n"
                    f"- **Confidence & Certainty**: High precision validation from neural object detector.\n"
                    f"- **Operational Assessment**: Verified within the surveyed perimeter.\n"
                    f"- **Tactical Recommendation**: Maintain orbital surveillance or compare with subsequent Sentinel-2 overpasses for movement telemetry."
                )
                return f"{head}\n\n{bullets}"
            elif is_environmental:
                bullets = (
                    f"### 🛰️ ENVIRONMENTAL & SPECTRAL ANALYSIS REPORT{memory_note}\n"
                    f"- **Target & Index**: Multispectral Remote Sensing Evaluation\n"
                    f"- **Density / Count**: {context}\n"
                    f"- **Environmental Severity**: Ground-truth radiometric thresholding computed.\n"
                    f"- **Actionable Insight**: Prioritize field deployment or hydrological monitoring for flagged zones."
                )
                return f"{head}\n\n{bullets}"
            else:
                bullets = (
                    f"- **Density / Count**: {context}{memory_note}\n"
                    f"- **Risk Rating**: see findings above"
                )
                return f"{head}\n\n{bullets}"

        # Case 2: Guidance when no scene or AOI is bound (Honest, anti-hallucination)
        if context.startswith("NO_SCENE_BOUND"):
            target_str = "target features"
            if "'" in context:
                parts = context.split("'")
                if len(parts) >= 2:
                    target_str = parts[1]

            return (
                f"{head}{memory_note}\n\n"
                f"### 🌐 SATELLITE GUIDANCE & SENSOR REQUIREMENTS\n\n"
                f"No satellite scene or Region of Interest (AOI) is currently bound for scanning **{target_str}**.\n\n"
                f"- **How to Scan**: Draw an Area of Interest (AOI) box on the 3D globe or load a satellite scene from the workspace.\n"
                f"- **Sensor Requirements**: Scanning for '{target_str}' requires high-resolution optical or multispectral satellite imagery (e.g. Cartosat, WorldView, or Sentinel-2).\n"
                f"- **Available Actions**: You can ingest a live Sentinel-2 pass, select an existing scene, or ask me for remote sensing insights."
            )

        # Case 3: Scene inspection if an image file exists
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

        # Case 4: Dynamic Conversational & Remote Sensing Knowledge (Option 3 Adaptive)
        if any(w in p_lower for w in ("who are you", "what is this", "what are you", "what can you do", "introduce")):
            return (
                f"{head}{memory_note}\n\n"
                f"I am **SatQuery AI (SOLEN Intelligence Copilot)**, an advanced geospatial and remote sensing analytics platform.\n\n"
                f"I can assist you with:\n"
                f"- **Aerial Target Detection**: Finding discrete objects such as ships, aircraft, storage tanks, and vehicles using deep learning models.\n"
                f"- **Multispectral Environmental Analysis**: Computing calibrated spectral indices like **NDVI** (vegetation health), **NDWI** (flood & water extent), and **NDBI** (urban density).\n"
                f"- **Bi-temporal Change Detection**: Comparing satellite passes across dates to detect deforestation, construction, or disaster impact.\n"
                f"- **3D Geospatial Visualization**: Rendering vector GeoJSON boundaries and georeferenced raster overlays directly on the 3D Cesium globe."
            )

        if any(w in p_lower for w in ("hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening")):
            return (
                f"{head}{memory_note}\n\n"
                f"Greetings! SatQuery Intelligence Copilot is online and ready. "
                f"You can ask me to scan for targets (ships, planes, vehicles), analyze flood or crop indices (NDWI, NDVI), "
                f"or draw an Area of Interest on the 3D globe to run satellite analytics."
            )

        if "ndvi" in p_lower:
            return (
                f"{head}{memory_note}\n\n"
                f"### 🌿 Normalized Difference Vegetation Index (NDVI)\n\n"
                f"**NDVI** measures plant health and biomass density using satellite optical bands:\n"
                f"- **Formula**: `(NIR - Red) / (NIR + Red)`\n"
                f"- **How it works**: Chlorophyll in healthy vegetation absorbs visible red light and strongly reflects near-infrared (NIR) light.\n"
                f"- **Values**: Dense healthy canopy (+0.5 to +0.8), sparse vegetation (+0.2 to +0.4), bare soil (0.0 to +0.1), and water (negative).\n\n"
                f"To analyze NDVI across your area of interest, select a multispectral scene or draw an AOI box on the 3D globe."
            )

        if "ndwi" in p_lower or "flood" in p_lower:
            return (
                f"{head}{memory_note}\n\n"
                f"### 💧 Normalized Difference Water Index (NDWI)\n\n"
                f"**NDWI** delineates open water bodies and flood inundation extents:\n"
                f"- **Formula**: `(Green - NIR) / (Green + NIR)`\n"
                f"- **How it works**: Clear water exhibits high reflectance in green light and near-total absorption in near-infrared (NIR).\n"
                f"- **Thresholding**: Values above `0.0` or `+0.2` indicate surface water and flooded terrain.\n\n"
                f"You can query: *'Show flooded areas with NDWI > 0.3'* to generate real-time vector flood masks."
            )

        if any(w in p_lower for w in ("isro", "bhuvan", "cartosat", "resourcesat", "oceansat", "risat")):
            return (
                f"{head}{memory_note}\n\n"
                f"### 🚀 ISRO Earth Observation Capabilities\n\n"
                f"The **Indian Space Research Organisation (ISRO)** operates world-class Earth observation satellites:\n"
                f"- **Cartosat Series**: High-resolution sub-meter optical imaging for urban planning and cartography.\n"
                f"- **Resourcesat Series**: Multispectral sensors (LISS-III, LISS-IV, AWiFS) for national agriculture and water resource tracking.\n"
                f"- **Oceansat Series**: Ocean color and sea-surface winds for coastal zone and maritime surveillance.\n"
                f"- **RISAT Series**: Synthetic Aperture Radar (SAR) capable of imaging through clouds and during night.\n\n"
                f"SatQuery AI can ingest and analyze these raster formats alongside Sentinel-2 and Landsat archives."
            )

        if any(w in p_lower for w in ("gsd", "resolution", "ground sample distance")):
            return (
                f"{head}{memory_note}\n\n"
                f"### 📐 Ground Sample Distance (GSD)\n\n"
                f"**GSD** represents the real-world distance between the centers of two adjacent pixels on the ground:\n"
                f"- **Sub-meter (0.3m – 0.8m)**: WorldView, Pleiades Neo, Cartosat-3 — ideal for identifying small vehicles, aircraft types, and building details.\n"
                f"- **High Resolution (1m – 3m)**: PlanetScope, SPOT — effective for ship detection and infrastructure tracking.\n"
                f"- **Medium Resolution (10m – 30m)**: Sentinel-2 (10m), Landsat (30m) — ideal for regional flood mapping, crop monitoring, and forestry."
            )

        # General dynamic fallback:
        return (
            f"{head}{memory_note}\n\n"
            f"You asked: *\"{prompt}\"*\n\n"
            f"I am ready to help with your remote sensing and satellite analysis. "
            f"You can draw an Area of Interest (AOI) on the 3D globe to scan for objects (planes, ships, storage tanks), "
            f"evaluate environmental indices (NDVI for vegetation, NDWI for water), or compare multi-temporal imagery."
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
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b",
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
        ]

        self.model = next((c for c in vision_candidates if c and (not available_ids or c in available_ids)), "qwen/qwen3.8-27b")
        self.text_models_pool: list[str] = [
            c for c in text_candidates if c and (not available_ids or c in available_ids)
        ]
        self.text_models_pool = list(dict.fromkeys(self.text_models_pool))
        if not self.text_models_pool:
            self.text_models_pool = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]
        self.text_model = self.text_models_pool[0]
        log.info("Initialized GroqVLM (vision: %s, text pool: %s)", self.model, self.text_models_pool)

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
        p_lower = prompt.lower()
        ctx_lower = context.lower() if context else ""
        
        is_explicit_report_request = any(
            w in p_lower for w in (
                "report", "briefing", "executive summary", "comprehensive assessment",
                "full assessment", "generate report", "give me a report", "make a report",
                "detailed analysis", "sitrep", "threat assessment"
            )
        )
        is_direct_question = any(
            p_lower.strip().startswith(q) for q in (
                "why", "how", "what", "where", "who", "which", "is ", "are ", "can ",
                "could ", "do ", "does ", "did ", "explain", "tell me", "clarify"
            )
        ) or "?" in prompt

        if is_explicit_report_request:
            sys_content = (
                "You are SOLEN AI, an elite defense & geospatial intelligence copilot.\n"
                "The user has requested an authoritative, structured EXECUTIVE INTELLIGENCE REPORT.\n"
                "Deliver a comprehensive, high-IQ intelligence report specifically tailored to the queried target and area.\n"
                "Structure the briefing logically with Markdown headings (e.g., Executive Summary, Ground-Truth Metrics, Spatial Layout & Geometry, Operational Risk Rating, and Tactical Next Steps).\n"
                "Incorporate all tool findings (counts, areas, coordinates) verbatim without contradiction or hallucination.\n"
                "Speak with supreme analytical authority and precision."
            )
        elif is_direct_question:
            sys_content = (
                "You are SOLEN AI, an elite geospatial intelligence copilot and remote sensing expert.\n"
                "PRIMARY DIRECTIVE: Answer the user's specific question directly, deeply, articulately, and accurately.\n"
                "Do NOT force artificial military report headers (e.g. Target & Scope, Risk Rating) when answering a conversational or analytical question.\n"
                "Directly address what the user is asking. If ground-truth tool findings (such as vehicle counts, spectral indices, or spatial clusters) are provided in context, weave them naturally into your direct answer.\n"
                "Maintain PhD-level technical competence in computer vision, satellite orbits, photogrammetry, and spatial analytics."
            )
        else:
            sys_content = system_prompt if system_prompt else ANSWER_SYSTEM_PROMPT

        messages: list[dict[str, Any]] = [{"role": "system", "content": sys_content}]

        for turn in history or []:
            role = "user" if turn.get("role") == "user" else "assistant"
            content = (turn.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})

        query_text = prompt
        if context:
            query_text = f"{prompt}\n\nTool findings (ground truth from trained models):\n{context}"

        # Dynamic token budget: large reports get 850 tokens; standard queries get 480 tokens
        # Prevents rapid TPM (Tokens Per Minute) burnout
        token_budget = 850 if is_explicit_report_request else 480

        # Step 1: If raw image is provided without extracted context, try vision model first
        if not context and image_path and Path(image_path).exists():
            encoded_img = self._encode_image(image_path)
            if encoded_img:
                img_messages = list(messages)
                img_messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": query_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{encoded_img}"},
                        },
                    ],
                })
                try:
                    resp = self.client.chat.completions.create(
                        model=self.model,
                        messages=img_messages,
                        temperature=0.2,
                        max_tokens=token_budget,
                    )
                    ans = resp.choices[0].message.content or ""
                    import re
                    ans = re.sub(r"<think>.*?</think>", "", ans, flags=re.DOTALL).strip()
                    if ans:
                        return ans
                except Exception as v_err:
                    log.warning("Groq vision call failed (%s); failing over to text intelligence pool", v_err)

        # Step 2: Multi-model text pool loop with isolated TPM/RPM rate limit quotas
        txt_messages = list(messages)
        txt_messages.append({"role": "user", "content": query_text})

        last_error = None
        for cand_model in self.text_models_pool:
            try:
                resp = self.client.chat.completions.create(
                    model=cand_model,
                    messages=txt_messages,
                    temperature=0.2,
                    max_tokens=token_budget,
                )
                ans = resp.choices[0].message.content or ""
                import re
                ans = re.sub(r"<think>.*?</think>", "", ans, flags=re.DOTALL).strip()
                if ans:
                    return ans
            except Exception as m_err:
                last_error = m_err
                err_str = str(m_err).lower()
                if any(w in err_str for w in ("rate limit", "429", "tpm", "rpm", "tokens per minute")):
                    log.warning("Groq model %s rate limit hit (%s); switching to isolated model quota", cand_model, m_err)
                    continue
                else:
                    log.warning("Groq model %s attempt failed: %s; trying next", cand_model, m_err)
                    continue

        # Step 3: Emergency recovery if all models hit rate limit with history included:
        # Strip history completely (0 history turns = ~100 tokens) and retry lightest model
        if len(txt_messages) > 2:
            log.warning("All models hit rate limits with history; retrying with 0 history on lightweight model")
            try:
                minimal_messages = [
                    {"role": "system", "content": sys_content},
                    {"role": "user", "content": query_text},
                ]
                emergency_model = self.text_models_pool[-1]
                resp = self.client.chat.completions.create(
                    model=emergency_model,
                    messages=minimal_messages,
                    temperature=0.2,
                    max_tokens=350,
                )
                ans = resp.choices[0].message.content or ""
                import re
                ans = re.sub(r"<think>.*?</think>", "", ans, flags=re.DOTALL).strip()
                if ans:
                    return ans
            except Exception as min_err:
                last_error = min_err

        # Step 4: Ultimate deterministic fallback if Groq account is entirely unavailable
        log.error("All Groq model attempts exhausted: %s", last_error)
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
