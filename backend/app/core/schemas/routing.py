"""Intent router output. M1 Day 5 deliverable.

The router's ONLY legal output is a `RoutingDecision`. The `tool_call` field is
a discriminated union on `action`, so a malformed VLM generation fails
validation here rather than halfway through M2's or M3's service.
"""
from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import Field

from .common import Comparison, SpectralIndex, Strict, ToolAction

# Detection vocabulary. Constrained on purpose: an open-vocabulary target would
# let the VLM emit a class YOLOv8n-OBB was never trained on, which surfaces as a
# silent empty result rather than an error. M2 owns this list.
DetectionTarget = Literal[
    "storage_tank", "ship", "plane", "vehicle", "building",
    "bridge", "harbor", "roundabout", "helicopter", "swimming_pool",
]
DETECTION_TARGETS: tuple[str, ...] = tuple(DetectionTarget.__args__)

SegmentationTarget = Literal["water", "building", "vegetation", "road", "bare_soil"]
SEGMENTATION_TARGETS: tuple[str, ...] = tuple(SegmentationTarget.__args__)


class VQACall(Strict):
    """No tool. The VLM answers from the imagery alone."""

    action: Literal[ToolAction.GENERAL_VQA] = ToolAction.GENERAL_VQA


class DetectionCall(Strict):
    """-> M2: YOLOv8n-OBB + SAHI tiling."""

    action: Literal[ToolAction.DETECTION] = ToolAction.DETECTION
    target: DetectionTarget
    confidence: float = Field(default=0.25, ge=0.0, le=1.0)


class SegmentationCall(Strict):
    """-> M2: FastSAM CPU segmentation."""

    action: Literal[ToolAction.SEGMENTATION] = ToolAction.SEGMENTATION
    target: SegmentationTarget


class SpectralCall(Strict):
    """-> M3: vectorized NumPy index math + threshold mask."""

    action: Literal[ToolAction.SPECTRAL] = ToolAction.SPECTRAL
    index: SpectralIndex
    threshold: float = Field(default=0.3, ge=-1.0, le=1.0)
    operator: Comparison = Comparison.GT
    bi_temporal: bool = Field(
        default=False,
        description="If true, M3 differences scene_b against scene. Requires scene_b on the request.",
    )


ToolCall = Annotated[
    Union[VQACall, DetectionCall, SegmentationCall, SpectralCall],
    Field(discriminator="action"),
]


class RoutingSource(str, Enum):
    RULES = "rules"
    VLM = "vlm"
    FALLBACK = "fallback"


class RoutingDecision(Strict):
    tool_call: ToolCall
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = Field(max_length=500)
    source: RoutingSource
