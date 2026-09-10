"""Tenant-owned product contracts. These are separate from the frozen ML API."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from .common import BBox, Strict

WorkspaceRole = Literal["viewer", "analyst", "reviewer", "admin"]
Classification = Literal["unclassified", "restricted", "confidential"]
ProjectTemplate = Literal["flood_response", "crop_monitoring", "maritime_surveillance", "border_security", "custom"]


class CreateWorkspaceRequest(Strict):
    name: str = Field(min_length=2, max_length=120)
    classification: Classification = "unclassified"


class WorkspaceResponse(Strict):
    id: str
    name: str
    classification: Classification
    role: WorkspaceRole
    created_at: datetime


class WorkspaceListResponse(Strict):
    workspaces: list[WorkspaceResponse]


class AddMemberRequest(Strict):
    firebase_uid: str = Field(min_length=1, max_length=128)
    role: WorkspaceRole


class CreateProjectRequest(Strict):
    name: str = Field(min_length=2, max_length=160)
    template: ProjectTemplate = "custom"
    aoi: BBox | None = None
    classification: Classification = "unclassified"


class ProjectResponse(Strict):
    id: str
    workspace_id: str
    name: str
    template: ProjectTemplate
    aoi: BBox | None
    classification: Classification
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(Strict):
    projects: list[ProjectResponse]


class AuditEventResponse(Strict):
    id: str
    event_type: str
    actor_uid: str
    resource_type: str
    resource_id: str
    occurred_at: datetime
    metadata: dict[str, object] = Field(default_factory=dict)


class AuditEventListResponse(Strict):
    events: list[AuditEventResponse]

