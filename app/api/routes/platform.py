"""Authenticated workspace, membership, project, and audit APIs."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response

from app.core.auth import Principal, require_principal, require_role
from app.core.schemas import (
    AddMemberRequest, AuditEventListResponse, CreateProjectRequest,
    CreateWorkspaceRequest, ProjectListResponse, ProjectResponse,
    WorkspaceListResponse, WorkspaceResponse,
)
from app.services.tenant_store import get_tenant_store

router = APIRouter(prefix="/api/v1", tags=["platform"])


@router.get("/workspaces", response_model=WorkspaceListResponse)
def list_workspaces(principal: Principal = Depends(require_principal)) -> WorkspaceListResponse:
    return WorkspaceListResponse(workspaces=get_tenant_store().list_workspaces(principal.uid))


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=201)
def create_workspace(req: CreateWorkspaceRequest, principal: Principal = Depends(require_principal)) -> WorkspaceResponse:
    return WorkspaceResponse(**get_tenant_store().create_workspace(name=req.name, classification=req.classification, owner_uid=principal.uid))


@router.put("/workspaces/{workspace_id}/members", status_code=204)
def add_member(
    workspace_id: str,
    req: AddMemberRequest,
    principal: Principal = Depends(require_role("admin")),
) -> Response:
    get_tenant_store().add_member(workspace_id=workspace_id, firebase_uid=req.firebase_uid, role=req.role, actor_uid=principal.uid)
    return Response(status_code=204)


@router.get("/projects", response_model=ProjectListResponse)
def list_projects(
    workspace_id: Annotated[str, Header(alias="X-Workspace-ID")],
    _: Principal = Depends(require_role("viewer")),
) -> ProjectListResponse:
    return ProjectListResponse(projects=get_tenant_store().list_projects(workspace_id))


@router.post("/projects", response_model=ProjectResponse, status_code=201)
def create_project(
    req: CreateProjectRequest,
    workspace_id: Annotated[str, Header(alias="X-Workspace-ID")],
    principal: Principal = Depends(require_role("analyst")),
) -> ProjectResponse:
    return ProjectResponse(**get_tenant_store().create_project(
        workspace_id=workspace_id, name=req.name, template=req.template,
        aoi=req.aoi.model_dump() if req.aoi else None,
        classification=req.classification, actor_uid=principal.uid,
    ))


@router.get("/audit-events", response_model=AuditEventListResponse)
def list_audit_events(
    workspace_id: Annotated[str, Header(alias="X-Workspace-ID")],
    _: Principal = Depends(require_role("reviewer")),
    limit: int = Query(default=100, ge=1, le=500),
) -> AuditEventListResponse:
    return AuditEventListResponse(events=get_tenant_store().list_audit_events(workspace_id, limit))
