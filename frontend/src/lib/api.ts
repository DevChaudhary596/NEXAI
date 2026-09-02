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
} from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const res = await fetch(`${API_BASE}/api/v1/query`, {
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

  const res = await fetch(`${API_BASE}/api/v1/upload`, {
    method: "POST",
    body: form,
  });
  return handleResponse<UploadResponse>(res);
}

/**
 * GET /api/v1/scenes
 * List all uploaded scenes.
 */
export async function listScenes(): Promise<SceneListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/scenes`);
  return handleResponse<SceneListResponse>(res);
}

/**
 * DELETE /api/v1/scenes/:id
 */
export async function deleteScene(sceneId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/scenes/${sceneId}`, {
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
    const res = await fetch(`${API_BASE}/healthz`);
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

export { ApiError };
