"""Intent router. M1 Day 5.

Two-stage by design:

  1. A deterministic rule pass handles the queries we can classify with
     certainty. It is free, ~10us, and cannot hallucinate.
  2. Anything the rules decline falls through to the VLM, whose generation is
     validated against `RoutingDecision`. Invalid JSON gets exactly one repair
     attempt, then we degrade to general VQA rather than raising.

Rules-first is not a shortcut around the VLM - it is what keeps the demo
deterministic. Every judge-facing query in M6's 50-query matrix should land in
stage 1; stage 2 exists so an unrehearsed question still does something sane.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Protocol

from pydantic import TypeAdapter, ValidationError

from app.core.schemas import RoutingDecision, RoutingSource, ToolCall
from app.core.schemas.common import Comparison, SpectralIndex
from app.core.schemas.routing import (
    DetectionCall, SegmentationCall, SpectralCall, VQACall,
)

log = logging.getLogger(__name__)
_tool_adapter: TypeAdapter[ToolCall] = TypeAdapter(ToolCall)

# --- lexicon -----------------------------------------------------------------
# Surface form -> canonical target. Plurals and the two-word variants matter:
# users type "storage tanks", the schema says "storage_tank".
DETECTION_SYNONYMS: dict[str, str] = {
    "storage tank": "storage_tank", "storage tanks": "storage_tank",
    "oil tank": "storage_tank", "oil tanks": "storage_tank", "tank": "storage_tank",
    "tanks": "storage_tank", "silo": "storage_tank", "silos": "storage_tank",
    "ship": "ship", "ships": "ship", "boat": "ship", "boats": "ship",
    "vessel": "ship", "vessels": "ship",
    "plane": "plane", "planes": "plane", "aircraft": "plane",
    "airplane": "plane", "airplanes": "plane", "jet": "plane", "jets": "plane",
    "vehicle": "vehicle", "vehicles": "vehicle", "car": "vehicle", "cars": "vehicle",
    "truck": "vehicle", "trucks": "vehicle",
    "building": "building", "buildings": "building", "house": "building",
    "houses": "building", "structure": "building", "structures": "building",
    "bridge": "bridge", "bridges": "bridge",
    "harbor": "harbor", "harbors": "harbor", "harbour": "harbor", "port": "harbor",
    "roundabout": "roundabout", "roundabouts": "roundabout",
    "helicopter": "helicopter", "helicopters": "helicopter",
    "swimming pool": "swimming_pool", "swimming pools": "swimming_pool",
    "pool": "swimming_pool", "pools": "swimming_pool",
}

SEGMENTATION_SYNONYMS: dict[str, str] = {
    "water": "water", "water body": "water", "water bodies": "water",
    "lake": "water", "lakes": "water", "river": "water", "rivers": "water",
    "building": "building", "buildings": "building", "rooftop": "building",
    "rooftops": "building",
    "vegetation": "vegetation", "forest": "vegetation", "trees": "vegetation",
    "canopy": "vegetation",
    "road": "road", "roads": "road", "highway": "road", "highways": "road",
    "bare soil": "bare_soil", "barren": "bare_soil", "soil": "bare_soil",
}

# Index keyword sets. Ordered by specificity when scanned.
SPECTRAL_KEYWORDS: dict[SpectralIndex, tuple[str, ...]] = {
    SpectralIndex.NDWI: (
        "ndwi", "water", "flood", "flooded", "flooding", "inundat", "submerged",
        "moisture", "wetland", "waterlogged",
    ),
    SpectralIndex.NDVI: (
        "ndvi", "vegetation", "crop", "crops", "farm", "farmland", "agricultur",
        "greenery", "green cover", "plant health", "crop health", "biomass",
        "forest cover", "drought", "yield",
    ),
    SpectralIndex.NDBI: (
        "ndbi", "built-up", "built up", "builtup", "urban", "urbanis", "urbaniz",
        "impervious", "settlement", "concrete", "construction", "sprawl",
    ),
}

_COUNT_VERBS = re.compile(
    r"\b(how many|count|number of|find|locate|detect|identify|spot|list all|"
    r"how much of|are there any|show me all)\b"
)
_SEGMENT_VERBS = re.compile(
    r"\b(segment|mask|outline|delineate|trace|extent of|boundary|boundaries|"
    r"footprint|silhouette|exact shape)\b"
)
_AREA_WORDS = re.compile(r"\b(area|areas|coverage|extent|region|regions|zone|zones)\b")
_BITEMPORAL = re.compile(
    r"\b(change|changed|changes|before and after|compared to|since|difference|"
    r"differences|bi-temporal|bitemporal|over time|expansion|loss|gain)\b"
)
_VQA_OPENERS = re.compile(
    # Stems take \w* because a trailing \b cannot match mid-word: bare "summar"
    # never matches "summarise".
    r"^\s*(what|describ\w*|explain\w*|summar\w*|caption\w*|"
    r"tell me about|is this|does this|can you see|what kind|what type)\b"
)
# "above 0.4", "> 0.35", "below -0.1", "less than 0.2"
_THRESHOLD = re.compile(
    r"(?P<op>above|over|greater than|more than|>|below|under|less than|<)\s*"
    r"(?P<val>-?\d*\.?\d+)"
)


class SupportsRouting(Protocol):
    """Minimal surface the router needs from a VLM backend."""

    def generate_json(self, prompt: str, *, max_new_tokens: int = 128) -> str: ...


def _best_match(text: str, table: dict[str, str]) -> str | None:
    """Pick the head noun of the query.

    Ordered by (earliest mention, then longest surface form). Position must
    dominate length: in "count the ships in the harbor" the object is the ship,
    while "harbor" is only the location - a pure longest-match picks the wrong
    one. Length breaks ties at the same offset so "storage tanks" beats the
    bare "tanks" nested inside it.
    """
    best: tuple[int, int, str] | None = None
    for surface, canonical in table.items():
        m = re.search(rf"\b{re.escape(surface)}\b", text)
        if m is None:
            continue
        cand = (m.start(), -len(surface), canonical)
        if best is None or cand < best:
            best = cand
    return best[2] if best else None


def _extract_threshold(text: str) -> tuple[float | None, Comparison]:
    m = _THRESHOLD.search(text)
    if not m:
        return None, Comparison.GT
    op = m.group("op")
    comparison = Comparison.LT if op in {"below", "under", "less than", "<"} else Comparison.GT
    try:
        val = float(m.group("val"))
    except ValueError:
        return None, comparison
    return (val if -1.0 <= val <= 1.0 else None), comparison


def _detect_index(text: str) -> SpectralIndex | None:
    """First index whose keywords appear. NDWI is checked first because flood
    queries are the highest-value demo track and 'water' is unambiguous."""
    for index, keywords in SPECTRAL_KEYWORDS.items():
        if any(k in text for k in keywords):
            return index
    return None


def route_by_rules(prompt: str) -> RoutingDecision | None:
    """Deterministic pass. Returns None when it is not confident."""
    text = prompt.lower().strip()

    # 1. Explicit segmentation verbs win outright - "segment the water" is a
    #    mask request even though 'water' is also an NDWI trigger.
    if _SEGMENT_VERBS.search(text):
        target = _best_match(text, SEGMENTATION_SYNONYMS)
        if target:
            return RoutingDecision(
                tool_call=SegmentationCall(target=target),
                confidence=0.95,
                rationale=f"segmentation verb + target '{target}'",
                source=RoutingSource.RULES,
            )

    # 2. Counting verb + a detectable object -> YOLO. Checked before spectral so
    #    "how many buildings" is a detection, not an NDBI query.
    if _COUNT_VERBS.search(text):
        target = _best_match(text, DETECTION_SYNONYMS)
        if target:
            return RoutingDecision(
                tool_call=DetectionCall(target=target),
                confidence=0.95,
                rationale=f"count/find verb + object '{target}'",
                source=RoutingSource.RULES,
            )

    # 3. Spectral index keywords, optionally bi-temporal.
    index = _detect_index(text)
    if index is not None:
        threshold, operator = _extract_threshold(text)
        defaults = {SpectralIndex.NDVI: 0.3, SpectralIndex.NDWI: 0.0, SpectralIndex.NDBI: 0.0}
        call = SpectralCall(
            index=index,
            threshold=threshold if threshold is not None else defaults[index],
            operator=operator,
            bi_temporal=bool(_BITEMPORAL.search(text)),
        )
        return RoutingDecision(
            tool_call=call,
            confidence=0.9,
            rationale=(
                f"{index.value} keyword"
                + (" + change wording" if call.bi_temporal else "")
                + (f" + explicit threshold {threshold}" if threshold is not None else "")
            ),
            source=RoutingSource.RULES,
        )

    # 4. A bare detectable noun with an area word is ambiguous -> let the VLM
    #    decide. A bare noun on its own is a detection.
    target = _best_match(text, DETECTION_SYNONYMS)
    if target and not _AREA_WORDS.search(text) and not _VQA_OPENERS.search(text):
        return RoutingDecision(
            tool_call=DetectionCall(target=target),
            confidence=0.8,
            rationale=f"bare object mention '{target}'",
            source=RoutingSource.RULES,
        )

    # 5. Clear descriptive openers with no tool signal -> VQA.
    if _VQA_OPENERS.search(text) and not target:
        return RoutingDecision(
            tool_call=VQACall(),
            confidence=0.85,
            rationale="descriptive opener, no tool signal",
            source=RoutingSource.RULES,
        )

    return None


ROUTER_SYSTEM_PROMPT = """You are the tool router for a satellite-imagery assistant.
Reply with ONE JSON object and nothing else. No prose, no markdown fence.

Schemas (pick exactly one):
{"action":"general_vqa"}
{"action":"detection","target":<one of: storage_tank ship plane vehicle building bridge harbor roundabout helicopter swimming_pool>,"confidence":0.25}
{"action":"segmentation","target":<one of: water building vegetation road bare_soil>}
{"action":"spectral","index":<ndvi|ndwi|ndbi>,"threshold":<-1..1>,"operator":<gt|lt>,"bi_temporal":<true|false>}

Guidance: counting or locating discrete objects -> detection. Asking for the
precise outline or mask of a surface -> segmentation. Vegetation health, water
extent, flooding, or built-up area -> spectral. Anything descriptive -> general_vqa.

User query: """


def _parse_tool_json(raw: str) -> ToolCall | None:
    """Pull the first JSON object out of a generation and validate it."""
    start, depth = raw.find("{"), 0
    if start == -1:
        return None
    for i in range(start, len(raw)):
        depth += (raw[i] == "{") - (raw[i] == "}")
        if depth == 0:
            try:
                return _tool_adapter.validate_python(json.loads(raw[start : i + 1]))
            except (json.JSONDecodeError, ValidationError) as exc:
                log.debug("router json rejected: %s", exc)
                return None
    return None


class IntentRouter:
    def __init__(self, vlm: SupportsRouting | None = None, *, rules_only: bool = False):
        self.vlm = vlm
        self.rules_only = rules_only

    def route(self, prompt: str) -> RoutingDecision:
        decision = route_by_rules(prompt)
        if decision is not None:
            return decision

        if self.rules_only or self.vlm is None:
            return RoutingDecision(
                tool_call=VQACall(),
                confidence=0.4,
                rationale="no rule matched; VLM routing unavailable",
                source=RoutingSource.FALLBACK,
            )

        for attempt in range(2):
            instruction = ROUTER_SYSTEM_PROMPT + prompt
            if attempt == 1:
                instruction += "\n\nYour previous reply was not valid JSON. Emit ONLY the JSON object."
            try:
                call = _parse_tool_json(self.vlm.generate_json(instruction))
            except Exception as exc:  # backend failure must not 500 the request
                log.warning("VLM routing call failed: %s", exc)
                break
            if call is not None:
                return RoutingDecision(
                    tool_call=call,
                    confidence=0.7,
                    rationale=f"VLM classification (attempt {attempt + 1})",
                    source=RoutingSource.VLM,
                )

        return RoutingDecision(
            tool_call=VQACall(),
            confidence=0.3,
            rationale="VLM produced no valid tool call; degraded to VQA",
            source=RoutingSource.FALLBACK,
        )
