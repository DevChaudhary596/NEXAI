"""Frozen inter-service contract for SatQuery AI.

Import from here, never from the submodules directly - that keeps the public
surface reviewable in one place when we bump CONTRACT_VERSION.
"""
from .common import (
    CONTRACT_VERSION, BBox, Comparison, ROI, SceneRef, SpectralIndex, Strict, ToolAction,
)
from .geo import Feature, FeatureCollection, FeatureProperties, RasterOverlay
from .query import ErrorResponse, QueryRequest, QueryResponse, Timings
from .routing import (
    DETECTION_TARGETS, SEGMENTATION_TARGETS, DetectionCall, RoutingDecision,
    RoutingSource, SegmentationCall, SpectralCall, ToolCall, VQACall,
)
from .tasks import TaskState, TaskStatus

__all__ = [
    "CONTRACT_VERSION", "BBox", "Comparison", "ROI", "SceneRef", "SpectralIndex",
    "Strict", "ToolAction", "Feature", "FeatureCollection", "FeatureProperties",
    "RasterOverlay", "ErrorResponse", "QueryRequest", "QueryResponse", "Timings",
    "DETECTION_TARGETS", "SEGMENTATION_TARGETS", "DetectionCall", "RoutingDecision",
    "RoutingSource", "SegmentationCall", "SpectralCall", "ToolCall", "VQACall",
    "TaskState", "TaskStatus",
]
