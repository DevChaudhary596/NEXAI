"""Frozen inter-service contract for SOLEN AI.

Import from here, never from the submodules directly - that keeps the public
surface reviewable in one place when we bump CONTRACT_VERSION.
"""
from .asr import TranscribeResponse
from .common import (
    CONTRACT_VERSION, BBox, Comparison, ROI, SceneRef, SpectralIndex, Strict, ToolAction,
)
from .geo import Feature, FeatureCollection, FeatureProperties, RasterOverlay
from .query import ConversationTurn, ErrorResponse, Provenance, QueryRequest, QueryResponse, Timings, Uncertainty
from .routing import (
    DETECTION_TARGETS, SEGMENTATION_TARGETS, DetectionCall, RoutingDecision,
    RoutingSource, SegmentationCall, SpectralCall, ToolCall, VQACall,
)
from .tasks import TaskState, TaskStatus
from .upload import FetchSatelliteRequest, SceneListItem, SceneListResponse, SnapshotSceneRequest, UploadResponse
from .watches import (
    AlertListResponse, AlertResponse, AlertStatus, CreateWatchRequest, UpdateAlertRequest,
    WatchableToolCall, WatchListResponse, WatchResponse,
)
from .overpass import OverpassItem, OverpassResponse
from .platform import (
    AddMemberRequest, AuditEventListResponse, AuditEventResponse,
    CreateProjectRequest, CreateWorkspaceRequest, ProjectListResponse,
    ProjectResponse, WorkspaceListResponse, WorkspaceResponse,
)

__all__ = [
    "CONTRACT_VERSION", "BBox", "Comparison", "ROI", "SceneRef", "SpectralIndex",
    "Strict", "ToolAction", "Feature", "FeatureCollection", "FeatureProperties",
    "RasterOverlay", "ErrorResponse", "QueryRequest", "QueryResponse", "Timings", "Provenance", "Uncertainty",
    "ConversationTurn", "TranscribeResponse",
    "DETECTION_TARGETS", "SEGMENTATION_TARGETS", "DetectionCall", "RoutingDecision",
    "RoutingSource", "SegmentationCall", "SpectralCall", "ToolCall", "VQACall",
    "TaskState", "TaskStatus",
    "UploadResponse", "SceneListItem", "SceneListResponse", "FetchSatelliteRequest", "SnapshotSceneRequest",
    "AlertListResponse", "AlertResponse", "AlertStatus", "CreateWatchRequest", "UpdateAlertRequest",
    "WatchableToolCall", "WatchListResponse", "WatchResponse",
    "OverpassItem", "OverpassResponse",
    "AddMemberRequest", "AuditEventListResponse", "AuditEventResponse",
    "CreateProjectRequest", "CreateWorkspaceRequest", "ProjectListResponse",
    "ProjectResponse", "WorkspaceListResponse", "WorkspaceResponse",
]


