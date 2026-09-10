/**
 * SatQuery AI — API Client
 *
 * Communicates with the FastAPI backend (M5).
 * Backend routes defined in: backend/app/main.py
 */
import type {
  QueryRequest,
  QueryResponse,
  ErrorResponse,
  UploadResponse,
  SceneListResponse,
  BBox,
  CreateWatchRequest,
  WatchResponse,
  WatchListResponse,
  AlertListResponse,
  AlertResponse,
  AlertStatus,
  OverpassResponse,
  TranscribeResponse,
  WorkspaceListResponse,
  WorkspaceResponse,
  ProjectListResponse,
  ProjectResponse,
  CreateProjectRequest,
  SnapshotSceneRequest,
} from "@/types";


const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type IdentityTokenProvider = () => Promise<string | null>;
let identityTokenProvider: IdentityTokenProvider | null = null;
let activeWorkspaceId: string | null = null;

/** Registered by AuthProvider. Tokens are refreshed by Firebase on demand. */
export function configureApiIdentity(provider: IdentityTokenProvider): void {
  identityTokenProvider = provider;
}

export function configureActiveWorkspace(workspaceId: string | null): void {
  activeWorkspaceId = workspaceId;
}

async function apiFetch(path: string, init: RequestInit = {}, workspaceId?: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = identityTokenProvider ? await identityTokenProvider() : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (workspaceId || activeWorkspaceId) headers.set("X-Workspace-ID", workspaceId || activeWorkspaceId!);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

/* ── Helpers ────────────────────────────────────────────────── */

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ErrorResponse | null = null;
    try {
      body = (await res.json()) as ErrorResponse;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(
      res.status,
      body?.code ?? "unknown",
      body?.detail ?? `Request failed with status ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

/* ── Public API ─────────────────────────────────────────────── */

/**
 * POST /api/v1/query
 * Main entry point. Sends prompt + scene_id + optional ROI.
 */
export async function queryScene(
  req: QueryRequest
): Promise<QueryResponse> {
  const res = await apiFetch(`/api/v1/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<QueryResponse>(res);
}

/**
 * POST /api/v1/upload
 * Upload a GeoTIFF file. Returns scene_id for subsequent queries.
 */
export async function uploadScene(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await apiFetch(`/api/v1/upload`, {
    method: "POST",
    body: form,
  });
  return handleResponse<UploadResponse>(res);
}

/**
 * POST /api/v1/transcribe
 * Send a recorded voice clip, get back a transcript to drop into the chat
 * input. Day 10.
 */
export async function transcribeAudio(blob: Blob): Promise<TranscribeResponse> {
  const form = new FormData();
  const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "wav";
  form.append("file", blob, `clip.${ext}`);

  const res = await apiFetch(`/api/v1/transcribe`, {
    method: "POST",
    body: form,
  });
  return handleResponse<TranscribeResponse>(res);
}

/**
 * POST /api/v1/scenes/fetch-satellite
 * Fetch the freshest low-cloud Sentinel-2 pass for an AOI — no GeoTIFF
 * upload required. Same response shape as uploadScene().
 */
export async function fetchSatelliteScene(bbox: BBox): Promise<UploadResponse> {
  const res = await apiFetch(`/api/v1/scenes/fetch-satellite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bbox }),
  });
  return handleResponse<UploadResponse>(res);
}

/**
 * POST /api/v1/scenes/snapshot
 * Register a georeferenced GeoTIFF scene on the fly from a live viewport
 * or user-drawn AOI bounding box snapshot.
 */
export async function createSnapshotScene(
  req: SnapshotSceneRequest
): Promise<UploadResponse> {
  const res = await apiFetch(`/api/v1/scenes/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<UploadResponse>(res);
}

/**
 * GET /api/v1/scenes
 * List all uploaded scenes.
 */
export async function listScenes(): Promise<SceneListResponse> {
  const res = await apiFetch(`/api/v1/scenes`);
  return handleResponse<SceneListResponse>(res);
}

/**
 * DELETE /api/v1/scenes/:id
 */
export async function deleteScene(sceneId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/scenes/${sceneId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "delete_failed", "Failed to delete scene");
  }
}

/**
 * GET /healthz
 */
export async function healthCheck(): Promise<boolean> {
  try {
  const res = await apiFetch(`/healthz`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build the tile layer URL template for Leaflet.
 * M5's tile route: GET /api/v1/tiles/{scene_id}/{z}/{x}/{y}.png
 */
export function getTileUrl(sceneId: string, layer: string = "rgb"): string {
  return `${API_BASE}/api/v1/tiles/${sceneId}/{z}/{x}/{y}.png?layer=${layer}`;
}

/**
 * Build the thumbnail URL for a scene.
 */
export function getThumbnailUrl(sceneId: string): string {
  return `${API_BASE}/api/v1/scenes/${sceneId}/thumbnail`;
}

/* ── Watches & Alerts ───────────────────────────────────────── */

/**
 * POST /api/v1/watches
 * Register an AOI + tool call to be re-checked against future Sentinel-2
 * passes. Alerts fire when the recomputed stats move meaningfully.
 */
export async function createWatch(
  req: CreateWatchRequest
): Promise<WatchResponse> {
  const res = await apiFetch(`/api/v1/watches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return handleResponse<WatchResponse>(res);
}

/**
 * GET /api/v1/watches?email=...
 */
export async function listWatches(email: string): Promise<WatchListResponse> {
  const res = await apiFetch(`/api/v1/watches?email=${encodeURIComponent(email)}`);
  return handleResponse<WatchListResponse>(res);
}

/**
 * DELETE /api/v1/watches/:id
 */
export async function deleteWatch(watchId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/watches/${watchId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "delete_failed", "Failed to delete watch");
  }
}

/**
 * GET /api/v1/alerts?email=...
 */
export async function listAlerts(email: string): Promise<AlertListResponse> {
  const res = await apiFetch(`/api/v1/alerts?email=${encodeURIComponent(email)}`);
  return handleResponse<AlertListResponse>(res);
}

/**
 * POST /api/v1/alerts/:id/seen
 */
export async function markAlertSeen(alertId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/alerts/${alertId}/seen`, {
    method: "POST",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "mark_seen_failed", "Failed to mark alert seen");
  }
}

/**
 * PATCH /api/v1/alerts/:id
 * Triage or assign an alert.
 */
export async function updateAlert(
  alertId: string,
  updates: {
    status?: AlertStatus;
    assigned_uid?: string | null;
    triage_notes?: string | null;
    seen?: boolean;
  }
): Promise<AlertResponse> {
  const res = await apiFetch(`/api/v1/alerts/${alertId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return handleResponse<AlertResponse>(res);
}

/**
 * GET /api/v1/overpass
 * Get predicted Sentinel-2 overpasses for an AOI.
 */
export async function getUpcomingOverpasses(bbox: BBox, days = 14): Promise<OverpassResponse> {
  const params = new URLSearchParams({
    west: String(bbox.west),
    south: String(bbox.south),
    east: String(bbox.east),
    north: String(bbox.north),
    days: String(days),
  });
  const res = await apiFetch(`/api/v1/overpass?${params.toString()}`);
  return handleResponse<OverpassResponse>(res);
}

export { ApiError };


/* ── Tenant platform API ───────────────────────────────────── */

export async function listWorkspaces(): Promise<WorkspaceListResponse> {
  return handleResponse<WorkspaceListResponse>(await apiFetch("/api/v1/workspaces"));
}

export async function createWorkspace(name: string, classification: WorkspaceResponse["classification"] = "unclassified"): Promise<WorkspaceResponse> {
  return handleResponse<WorkspaceResponse>(await apiFetch("/api/v1/workspaces", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, classification }),
  }));
}

export async function listWorkspaceProjects(workspaceId: string): Promise<ProjectListResponse> {
  return handleResponse<ProjectListResponse>(await apiFetch("/api/v1/projects", {}, workspaceId));
}

export async function createWorkspaceProject(workspaceId: string, request: CreateProjectRequest): Promise<ProjectResponse> {
  return handleResponse<ProjectResponse>(await apiFetch("/api/v1/projects", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  }, workspaceId));
}

/* ── AI Engine & Groq Configuration ────────────────────────── */

export interface AIStatus {
  backend: string;
  active_backend_name: string;
  groq_configured: boolean;
  vision_model: string;
  text_model: string;
}

export async function getAIStatus(): Promise<AIStatus> {
  const res = await apiFetch("/api/v1/ai/status");
  return handleResponse<AIStatus>(res);
}

export async function configureGroqKey(apiKey: string): Promise<{ status: string; backend: string; message: string }> {
  const res = await apiFetch("/api/v1/ai/groq-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  return handleResponse<{ status: string; backend: string; message: string }>(res);
}

export async function removeGroqKey(): Promise<{ status: string; message: string }> {
  const res = await apiFetch("/api/v1/ai/groq-key", {
    method: "DELETE",
  });
  return handleResponse<{ status: string; message: string }>(res);
}

