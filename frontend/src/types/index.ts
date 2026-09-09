/**
 * SatQuery AI — Frontend Type Definitions
 *
 * Mirrors the backend Pydantic schemas defined in:
 *   backend/app/core/schemas/common.py
 *   backend/app/core/schemas/query.py
 *   backend/app/core/schemas/geo.py
 *   backend/app/core/schemas/routing.py
 *   backend/app/core/schemas/upload.py
 *
 * CONTRACT_VERSION: 0.1.0
 */

/* ── Primitives ─────────────────────────────────────────────── */

export interface BBox {
  west: number;   // -180..180
  south: number;  // -90..90
  east: number;   // -180..180
  north: number;  // -90..90
}

export interface ROI {
  type: "bbox";
  bbox: BBox;
  crs: "EPSG:4326";
}

/* ── Routing ────────────────────────────────────────────────── */

export type ToolAction = "general_vqa" | "detection" | "segmentation" | "spectral";
export type RoutingSource = "rules" | "vlm" | "fallback";

export type DetectionTarget =
  | "storage_tank" | "ship" | "plane" | "vehicle" | "building"
  | "bridge" | "harbor" | "roundabout" | "helicopter" | "swimming_pool"
  | "all";

export type SegmentationTarget =
  | "water" | "building" | "vegetation" | "road" | "bare_soil";

export type SpectralIndex = "ndvi" | "ndwi" | "ndbi";

export interface VQACall {
  action: "general_vqa";
}

export interface DetectionCall {
  action: "detection";
  target: DetectionTarget;
  confidence: number;
}

export interface SegmentationCall {
  action: "segmentation";
  target: SegmentationTarget;
}

export interface SpectralCall {
  action: "spectral";
  index: SpectralIndex;
  threshold: number;
  operator: "gt" | "lt";
  bi_temporal: boolean;
}

export type ToolCall = VQACall | DetectionCall | SegmentationCall | SpectralCall;

export interface RoutingDecision {
  tool_call: ToolCall;
  confidence: number;
  rationale: string;
  source: RoutingSource;
}

/* ── GeoJSON ────────────────────────────────────────────────── */

export type FeatureSource = "detection" | "segmentation" | "spectral";

export interface FeatureProperties {
  label: string;
  score: number | null;
  area_m2: number | null;
  source: FeatureSource;
  extra: Record<string, unknown>;
}

export interface Feature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: FeatureProperties;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

/* ── Raster Overlay ─────────────────────────────────────────── */

export interface RasterOverlay {
  url: string;
  bounds: [number, number, number, number]; // [west, south, east, north]
  opacity: number;
  legend: Record<string, string>; // value → hex colour
}

/* ── Query ──────────────────────────────────────────────────── */

/** One prior turn, text-only (Day 8 - the image is never re-sent). */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface QueryRequest {
  prompt: string;
  scene_id: string;
  roi?: ROI | null;
  scene_id_b?: string | null;
  history?: ConversationTurn[];
}

export interface Timings {
  route_ms: number;
  tool_ms: number;
  answer_ms: number;
  total_ms: number;
}

export interface QueryResponse {
  contract_version: string;
  answer: string;
  routing: RoutingDecision;
  geojson: FeatureCollection;
  overlays: RasterOverlay[];
  stats: Record<string, number>;
  timings: Timings;
  peak_vram_gb: number | null;
  provenance: Provenance;
  uncertainty: Uncertainty | null;
}

export interface Provenance {
  scene_id: string;
  sha256: string;
  source_filename: string;
  ingested_at: string;
  source_type: string;
  capture_date: string | null;
  source_item_id: string | null;
  bands_used: string[];
  analysis_method: string;
}

export interface Uncertainty {
  metric: string;
  lower: number;
  upper: number;
  method: string;
  caveat: string;
}

/* ── Voice input (Day 10) ──────────────────────────────────────── */

export interface TranscribeResponse {
  text: string;
  backend: string;
}

/* ── Error ──────────────────────────────────────────────────── */

export interface ErrorResponse {
  detail: string;
  code: string;
}

export interface SnapshotSceneRequest {
  image_base64: string;
  bounds: number[];
  label?: string;
  is_roi?: boolean;
}

/* ── Upload ─────────────────────────────────────────────────── */

export interface UploadResponse {
  scene_id: string;
  filename: string;
  size_bytes: number;
  thumbnail_url: string;
  bounds: number[] | null;
  crs: string | null;
  resolution_m: number | null;
  band_count: number | null;
  satellite: string | null;
  capture_date: string | null;
  cloud_cover_pct: number | null;
}

export interface SceneListItem {
  scene_id: string;
  filename: string;
  size_bytes: number;
  thumbnail_url: string;
  uploaded_at: string;
  bounds: number[] | null;
  crs: string | null;
}

export interface SceneListResponse {
  scenes: SceneListItem[];
  total: number;
}

/* ── Watches & Alerts ───────────────────────────────────────── */

// VQA has no stats to diff against a previous pass, so watches can't target it.
export type WatchableToolCall = DetectionCall | SegmentationCall | SpectralCall;

export interface CreateWatchRequest {
  email: string;
  label?: string | null;
  bbox: BBox;
  tool_call: WatchableToolCall;
}

export interface WatchResponse {
  id: string;
  email: string;
  label: string | null;
  bbox: BBox;
  tool_call: WatchableToolCall;
  created_at: string;
  last_checked_at: string | null;
  active: boolean;
}

export type AlertStatus = "open" | "investigating" | "resolved";

export interface AlertResponse {
  id: string;
  watch_id: string;
  created_at: string;
  message: string;
  stats_before: Record<string, number>;
  stats_after: Record<string, number>;
  seen: boolean;
  status: AlertStatus;
  assigned_uid?: string | null;
  triage_notes?: string | null;
}

export interface WatchListResponse {
  watches: WatchResponse[];
}

export interface AlertListResponse {
  alerts: AlertResponse[];
}

export interface OverpassItem {
  satellite: "Sentinel-2A" | "Sentinel-2B";
  pass_time_utc: string;
  local_solar_time: string;
  seconds_until: number;
  human_until: string;
  orbit_direction: "descending" | "ascending";
  sun_elevation_deg: number;
  swath_coverage_pct: number;
}

export interface OverpassResponse {
  center_lon: number;
  center_lat: number;
  next_pass: OverpassItem | null;
  upcoming_passes: OverpassItem[];
}


/* ── Chat UI ────────────────────────────────────────────────── */

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  /** Only present on assistant messages */
  queryResponse?: QueryResponse;
  /** The prompt that produced this assistant message - needed by "Monitor
   * this AOI" / "Export Report" without re-deriving it from message order. */
  question?: string;
  isLoading?: boolean;
  isError?: boolean;
}

/* ── Tenant platform ───────────────────────────────────────── */

export type WorkspaceRole = "viewer" | "analyst" | "reviewer" | "admin";
export type Classification = "unclassified" | "restricted" | "confidential";
export type ProjectTemplate = "flood_response" | "crop_monitoring" | "maritime_surveillance" | "border_security" | "custom";

export interface WorkspaceResponse {
  id: string;
  name: string;
  classification: Classification;
  role: WorkspaceRole;
  created_at: string;
}

export interface WorkspaceListResponse { workspaces: WorkspaceResponse[]; }

export interface CreateProjectRequest {
  name: string;
  template: ProjectTemplate;
  aoi?: BBox | null;
  classification?: Classification;
}

export interface ProjectResponse {
  id: string;
  workspace_id: string;
  name: string;
  template: ProjectTemplate;
  aoi: BBox | null;
  classification: Classification;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse { projects: ProjectResponse[]; }
