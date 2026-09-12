"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Compass,
  BarChart3,
  Scan,
  GitCompare,
  Clock,
  Folder,
  Database,
  FileText,
  UploadCloud,
  Check,
  Play,
  Download,
  Trash2,
  Plus,
  Sliders,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  Crosshair,
  Navigation,
  AlertTriangle,
  Crop,
  Lock,
} from "lucide-react";

export interface DetectedZoneItem {
  id: string;
  zoneNumber: number;
  label: string;
  areaM2: number;
  areaKm2: number;
  areaHectares: number;
  centerLon: number;
  centerLat: number;
  coordsFormatted: string;
  spanMeters: number;
}
import { NavItemKey } from "./Sidebar";
import {
  listWatches,
  createWatch,
  deleteWatch,
  uploadScene,
  queryScene,
  listScenes,
  deleteScene,
  fetchSatelliteScene,
  createSnapshotScene,
} from "@/lib/api";
import { exportIntelligenceReport } from "@/lib/pdfReport";
import type { FlyToTarget } from "./Cesium3DView";
import type {
  WatchResponse,
  UploadResponse,
  FeatureCollection,
  RasterOverlay,
  ROI,
  SceneListItem,
  ProjectResponse,
} from "@/types";

interface WorkspaceModalProps {
  activeTab: NavItemKey;
  onClose: () => void;
  onTabChange?: (tab: NavItemKey) => void;
  onFlyTo: (target: FlyToTarget) => void;
  onApplyGeoJSON: (geojson: FeatureCollection) => void;
  onApplyOverlay: (overlays: RasterOverlay[]) => void;
  onUploadSuccess: (scene: UploadResponse) => void;
  onAskAI: (prompt: string) => void;
  onSelectScene?: (sceneId: string, bounds: number[] | null, filename?: string) => void;
  onUnmountScene?: () => void;
  currentSceneId: string | null;
  roi: ROI | null;
  projects?: ProjectResponse[];
  onStartDrawAOI?: () => void;
  onCaptureLiveViewport?: () => Promise<{
    image_base64: string;
    bounds: number[];
    label?: string;
    is_roi?: boolean;
  } | null>;
}

// Global Hotspots for "Explore" (Top-down Nadir Satellite View: pitch: -90)
const GLOBAL_HOTSPOTS = [
  {
    id: "sfo",
    name: "San Francisco Int'l Airport & Bay",
    category: "Aviation Infrastructure",
    coords: { lon: -122.375, lat: 37.619, height: 3500, pitch: -90 },
    desc: "Active runways, taxiways, and San Francisco maritime traffic.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
  {
    id: "suez",
    name: "Suez Canal Maritime Corridor",
    category: "Maritime Chokepoint",
    coords: { lon: 32.2654, lat: 30.5852, height: 12000, pitch: -90 },
    desc: "Global container shipping artery connecting Red Sea and Mediterranean.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
  {
    id: "rotterdam",
    name: "Port of Rotterdam Maasvlakte",
    category: "Industrial Port",
    coords: { lon: 4.0205, lat: 51.9544, height: 8500, pitch: -90 },
    desc: "Europe's largest sea harbor, crude oil terminals and automated container cranes.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
  {
    id: "haneda",
    name: "Tokyo Haneda Airport (HND)",
    category: "Aviation Infrastructure",
    coords: { lon: 139.7798, lat: 35.5494, height: 5000, pitch: -90 },
    desc: "Offshore four-runway complex on Tokyo Bay with intense passenger traffic.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
  {
    id: "amazon",
    name: "Amazon Basin Deforestation Arc",
    category: "Environmental Crisis",
    coords: { lon: -62.2159, lat: -3.4653, height: 28000, pitch: -90 },
    desc: "Active logging frontiers, road expansion, and canopy depletion.",
    sensor: "Landsat-9 OLI-2",
    resolution: "15m GSD",
  },
  {
    id: "everest",
    name: "Mount Everest & Khumbu Glacier",
    category: "Glacial & Cryosphere",
    coords: { lon: 86.925, lat: 27.9881, height: 16000, pitch: -90 },
    desc: "Himalayan peak topography, serac crevasses, and glacial lake expansion.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
  {
    id: "mumbai",
    name: "Mumbai JNPT & Harbor Offshore",
    category: "Maritime & Port",
    coords: { lon: 72.8777, lat: 19.076, height: 12000, pitch: -90 },
    desc: "Naval dockyards, oil tanker anchorage, and coastal transport arteries.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
  {
    id: "dubai",
    name: "Dubai Palm Jumeirah & Coast",
    category: "Coastal Infrastructure",
    coords: { lon: 55.139, lat: 25.1124, height: 7500, pitch: -90 },
    desc: "Artificial archipelago land reclamation and coastal sediment dynamics.",
    sensor: "Sentinel-2 MSI",
    resolution: "10m GSD",
  },
];

function WorkspaceFeatureLocked({
  featureName,
  description,
  roadmapPoints,
  icon: Icon,
  onExploreLive,
  onClose,
}: {
  featureName: string;
  description: string;
  roadmapPoints: string[];
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onExploreLive: () => void;
  onClose: () => void;
}) {
  return (
    <div className="workspace-locked-state">
      <div className="workspace-locked-card">
        <div className="workspace-locked-badge">
          <Lock size={12} className="text-amber-400 shrink-0" />
          <span>FEATURE LOCKED · COMING SOON</span>
        </div>

        <div className="workspace-locked-icon-halo">
          <Icon size={38} className="text-amber-400" />
        </div>

        <h3 className="workspace-locked-title">{featureName} is Under Active Construction</h3>
        <p className="workspace-locked-desc">{description}</p>

        <div className="workspace-locked-roadmap">
          <h4 className="workspace-locked-roadmap-title">What to expect in the upcoming release:</h4>
          <ul className="workspace-locked-roadmap-list">
            {roadmapPoints.map((point, i) => (
              <li key={i} className="workspace-locked-roadmap-item">
                <span className="workspace-locked-roadmap-dot" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="workspace-locked-actions">
          <button
            type="button"
            onClick={onExploreLive}
            className="workspace-locked-primary-btn"
          >
            <Scan size={15} />
            <span>Switch to Live Object Detections</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="workspace-locked-secondary-btn"
          >
            <X size={14} />
            <span>Return to Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceModal({
  activeTab,
  onClose,
  onTabChange,
  onFlyTo,
  onApplyGeoJSON,
  onApplyOverlay,
  onUploadSuccess,
  onAskAI,
  onSelectScene,
  onUnmountScene,
  currentSceneId,
  roi,
  projects = [],
  onStartDrawAOI,
  onCaptureLiveViewport,
}: WorkspaceModalProps) {
  useEffect(() => {
    if (!activeTab || activeTab === "dashboard") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, onClose]);

  // ── Explore State ──────────────────────────────────────────────
  const [activeLayers, setActiveLayers] = useState({
    trueColor: true,
    falseColorNIR: false,
    nightLights: false,
    orbitTracks: true,
    terrainElevation: true,
  });

  // ── Analysis (Spectral Indices) State ──────────────────────────
  const [selectedIndex, setSelectedIndex] = useState<"ndvi" | "ndwi" | "nbr">("ndvi");
  const [indexThreshold, setIndexThreshold] = useState(0.4);
  const [isCalculatingIndex, setIsCalculatingIndex] = useState(false);
  const [indexResult, setIndexResult] = useState<{
    areaKm2: number;
    meanVal: number;
    pctCover: string;
  } | null>(null);
  const [computedTarget, setComputedTarget] = useState<FlyToTarget | null>(null);
  const [detectedZones, setDetectedZones] = useState<DetectedZoneItem[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zoneSearchQuery, setZoneSearchQuery] = useState<string>("");
  const [zoneSortBy, setZoneSortBy] = useState<"area-desc" | "area-asc" | "number">("area-desc");
  const [zonePage, setZonePage] = useState<number>(1);
  const ZONE_PAGE_SIZE = 8;

  // ── Target Detection State ─────────────────────────────────────
  const [selectedClasses, setSelectedClasses] = useState<string[]>([
    "vehicles",
    "aviation",
    "vessels",
    "storage_tanks",
  ]);
  const [confidenceCutoff, setConfidenceCutoff] = useState(0.35);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionPage, setDetectionPage] = useState(1);
  const [detectionPageSize, setDetectionPageSize] = useState<number>(50);
  const [filterClass, setFilterClass] = useState<string>("all");
  const [detectionResults, setDetectionResults] = useState<{
    totalCount: number;
    classes: { name: string; count: number; color: string }[];
    detectionsList: { id: string; label: string; conf: number; lat: number; lon: number }[];
  } | null>(null);

  // Derived filtered & paginated detections list
  const displayedDetections = useMemo(() => {
    if (!detectionResults) return [];
    let list = detectionResults.detectionsList;
    if (filterClass !== "all") {
      list = list.filter((d) => d.label.toLowerCase().includes(filterClass.toLowerCase()));
    }
    return list;
  }, [detectionResults, filterClass]);

  const totalDetectionPages = Math.max(1, Math.ceil(displayedDetections.length / detectionPageSize));
  const pagedDetections = useMemo(() => {
    const start = (detectionPage - 1) * detectionPageSize;
    return displayedDetections.slice(start, start + detectionPageSize);
  }, [displayedDetections, detectionPage, detectionPageSize]);

  // ── Bi-Temporal Compare State ──────────────────────────────────
  const [compareSceneIdA, setCompareSceneIdA] = useState("");
  const [compareSceneIdB, setCompareSceneIdB] = useState("");
  const [compareFetchDateA, setCompareFetchDateA] = useState("");
  const [compareFetchDateB, setCompareFetchDateB] = useState("");
  const [compareIndex, setCompareIndex] = useState<"ndvi" | "ndwi" | "ndbi">("ndvi");
  const [isComparing, setIsComparing] = useState(false);
  const [fetchingComparePass, setFetchingComparePass] = useState<"A" | "B" | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareOutput, setCompareOutput] = useState<{
    changedAreaKm2: number;
    threshold: number;
    changePolygons: number;
    answer: string;
  } | null>(null);

  // ── Monitor (Watches) State ────────────────────────────────────
  const [watches, setWatches] = useState<WatchResponse[]>([]);
  const [loadingWatches, setLoadingWatches] = useState(false);
  const [newWatchLabel, setNewWatchLabel] = useState("");
  const [newWatchEmail, setNewWatchEmail] = useState("analyst@solen.ai");
  const [newWatchType, setNewWatchType] = useState<"flood" | "fire" | "vessel">("flood");
  const [watchSubmitting, setWatchSubmitting] = useState(false);

  // ── Data Library (Uploads & STAC) State ─────────────────────────
  const [uploading, setUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [catalogFilter, setCatalogFilter] = useState("");
  const [scenes, setScenes] = useState<SceneListItem[]>([]);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [fetchingSatellite, setFetchingSatellite] = useState(false);
  const [satBBox, setSatBBox] = useState({
    west: -122.42,
    south: 37.58,
    east: -122.34,
    north: 37.64,
  });

  // ── Projects State ─────────────────────────────────────────────
  const [projectSearch, setProjectSearch] = useState("");

  // Load scenes from backend GET /api/v1/scenes
  const loadScenes = useCallback(async () => {
    setLoadingScenes(true);
    try {
      const res = await listScenes();
      setScenes(res.scenes);
    } catch (err) {
      console.error("Failed to load scenes from backend:", err);
    } finally {
      setLoadingScenes(false);
    }
  }, []);

  const handleDeleteScene = async (e: React.MouseEvent, sceneIdToDelete: string) => {
    e.stopPropagation();
    try {
      await deleteScene(sceneIdToDelete);
      setScenes((prev) => prev.filter((s) => s.scene_id !== sceneIdToDelete));
      if (sceneIdToDelete === currentSceneId) {
        onUnmountScene?.();
      }
    } catch (err) {
      console.error("Failed to delete scene:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "data-library" || activeTab === "compare") {
      loadScenes();
    }
  }, [activeTab, loadScenes]);

  useEffect(() => {
    if (activeTab !== "compare") return;
    if (currentSceneId) {
      setCompareSceneIdA((prev) => prev || currentSceneId);
    }
  }, [activeTab, currentSceneId]);

  // Load watches when Monitor tab opens
  useEffect(() => {
    if (activeTab === "monitor") {
      setLoadingWatches(true);
      listWatches("analyst@solen.ai")
        .then((res) => {
          setWatches(res.watches);
        })
        .catch((err) => {
          console.error("Failed to load watches from backend:", err);
        })
        .finally(() => setLoadingWatches(false));
    }
  }, [activeTab]);

  // Resolve the active scene dynamically: currentSceneId -> or backing scene if ROI drawn
  // NEVER silently fall back to random database scenes if no reference (AOI or scene) is active!
  const getEffectiveSceneId = async (): Promise<string | null> => {
    if (currentSceneId) return currentSceneId;
    if (roi && onCaptureLiveViewport) {
      try {
        const snap = await onCaptureLiveViewport();
        if (snap && snap.image_base64) {
          const registered = await createSnapshotScene({
            image_base64: snap.image_base64,
            bounds: snap.bounds,
            label: snap.label,
            is_roi: snap.is_roi,
          });
          onSelectScene?.(registered.scene_id, null, registered.filename);
          return registered.scene_id;
        }
      } catch (e) {
        console.warn("Could not capture AOI snapshot, falling back:", e);
      }
    }
    if (roi) {
      if (scenes && scenes.length > 0) return scenes[0].scene_id;
      try {
        const res = await listScenes();
        if (res.scenes && res.scenes.length > 0) {
          setScenes(res.scenes);
          return res.scenes[0].scene_id;
        }
      } catch (e) {
        console.warn("Could not load scenes for ROI fallback:", e);
      }
    }
    // No active mounted scene and no drawn ROI - cannot run empty!
    return null;
  };

  // Memoized filtered & sorted detected zones for Spectral Index analysis
  const filteredAndSortedZones = useMemo(() => {
    let list = [...detectedZones];

    if (zoneSearchQuery.trim()) {
      const q = zoneSearchQuery.toLowerCase().trim();
      list = list.filter(
        (z) =>
          z.label.toLowerCase().includes(q) ||
          z.coordsFormatted.toLowerCase().includes(q) ||
          z.id.toLowerCase().includes(q) ||
          String(z.zoneNumber).includes(q) ||
          `${z.centerLat.toFixed(4)}, ${z.centerLon.toFixed(4)}`.includes(q)
      );
    }

    if (zoneSortBy === "area-desc") {
      list.sort((a, b) => b.areaM2 - a.areaM2);
    } else if (zoneSortBy === "area-asc") {
      list.sort((a, b) => a.areaM2 - b.areaM2);
    } else if (zoneSortBy === "number") {
      list.sort((a, b) => a.zoneNumber - b.zoneNumber);
    }

    return list;
  }, [detectedZones, zoneSearchQuery, zoneSortBy]);

  const totalZonePages = Math.ceil(filteredAndSortedZones.length / ZONE_PAGE_SIZE) || 1;
  const pagedZones = useMemo(() => {
    const start = (zonePage - 1) * ZONE_PAGE_SIZE;
    return filteredAndSortedZones.slice(start, start + ZONE_PAGE_SIZE);
  }, [filteredAndSortedZones, zonePage, ZONE_PAGE_SIZE]);

  const handleFlyToZone = (zone: DetectedZoneItem) => {
    setSelectedZoneId(zone.id);
    const altitude = Math.max(500, Math.min(zone.spanMeters * 3.0, 1600));
    onFlyTo({
      lon: zone.centerLon,
      lat: zone.centerLat,
      height: altitude,
      pitch: -90,
    });
    onClose();
  };

  const handleFlyToOverview = () => {
    if (computedTarget) {
      onFlyTo(computedTarget);
      onClose();
    } else if (detectedZones.length > 0) {
      const avgLon = detectedZones.reduce((s, z) => s + z.centerLon, 0) / detectedZones.length;
      const avgLat = detectedZones.reduce((s, z) => s + z.centerLat, 0) / detectedZones.length;
      onFlyTo({
        lon: avgLon,
        lat: avgLat,
        height: 2500,
        pitch: -90,
      });
      onClose();
    }
  };

  // Handler: Run Spectral Computation (100% Real GDAL/Rasterio GIS Engine)
  const handleRunSpectralIndex = async () => {
    setIsCalculatingIndex(true);
    setIndexResult(null);
    setDetectedZones([]);
    setZonePage(1);
    try {
      const activeScene = await getEffectiveSceneId();
      if (!activeScene) {
        alert("Spatial reference required: Please draw an Area of Interest (AOI) box on the 3D globe or mount a satellite scene from the Data Library first.");
        setIsCalculatingIndex(false);
        return;
      }
      const res = await queryScene({
        scene_id: activeScene,
        prompt: `Compute ${selectedIndex.toUpperCase()} index with threshold > ${indexThreshold}. Highlight anomalous pixels and compute surface area in square kilometers.`,
        roi: roi || undefined,
      });

      let flyTarget: FlyToTarget | null = null;
      const zonesList: DetectedZoneItem[] = [];

      if (res.geojson && res.geojson.features && res.geojson.features.length > 0) {
        onApplyGeoJSON(res.geojson);
        let clusterMinLon = 180, clusterMaxLon = -180, clusterMinLat = 90, clusterMaxLat = -90;
        let hasCoords = false;

        res.geojson.features.forEach((feat, idx) => {
          let ringCoords: number[][] = [];
          if (feat.geometry?.type === "Polygon" && feat.geometry.coordinates?.[0]?.length) {
            ringCoords = feat.geometry.coordinates[0];
          } else if (feat.geometry?.type === "MultiPolygon" && feat.geometry.coordinates?.[0]?.[0]?.length) {
            ringCoords = feat.geometry.coordinates[0][0];
          }

          let centerLon = 0;
          let centerLat = 0;
          let zMinLon = 180, zMaxLon = -180, zMinLat = 90, zMaxLat = -90;

          if (ringCoords.length > 0) {
            let sumLon = 0;
            let sumLat = 0;
            for (const pt of ringCoords) {
              const [lon, lat] = pt;
              sumLon += lon;
              sumLat += lat;
              zMinLon = Math.min(zMinLon, lon);
              zMaxLon = Math.max(zMaxLon, lon);
              zMinLat = Math.min(zMinLat, lat);
              zMaxLat = Math.max(zMaxLat, lat);
              clusterMinLon = Math.min(clusterMinLon, lon);
              clusterMaxLon = Math.max(clusterMaxLon, lon);
              clusterMinLat = Math.min(clusterMinLat, lat);
              clusterMaxLat = Math.max(clusterMaxLat, lat);
              hasCoords = true;
            }
            centerLon = sumLon / ringCoords.length;
            centerLat = sumLat / ringCoords.length;
          } else if (feat.geometry?.type === "Point" && feat.geometry.coordinates) {
            centerLon = feat.geometry.coordinates[0];
            centerLat = feat.geometry.coordinates[1];
            zMinLon = zMaxLon = centerLon;
            zMinLat = zMaxLat = centerLat;
            clusterMinLon = Math.min(clusterMinLon, centerLon);
            clusterMaxLon = Math.max(clusterMaxLon, centerLon);
            clusterMinLat = Math.min(clusterMinLat, centerLat);
            clusterMaxLat = Math.max(clusterMaxLat, centerLat);
            hasCoords = true;
          }

          const spanDegrees = Math.max(Math.abs(zMaxLon - zMinLon), Math.abs(zMaxLat - zMinLat), 0.0005);
          const spanMeters = spanDegrees * 111000;

          let areaM2 = 0;
          if (typeof feat.properties?.area_m2 === "number") {
            areaM2 = feat.properties.area_m2;
          } else if (typeof feat.properties?.extra?.area_m2 === "number") {
            areaM2 = feat.properties.extra.area_m2;
          } else {
            areaM2 = Math.round(Math.abs(zMaxLon - zMinLon) * 111000 * Math.abs(zMaxLat - zMinLat) * 111000 * 0.7);
          }

          const areaKm2 = +(areaM2 / 1_000_000).toFixed(4);
          const areaHectares = +(areaM2 / 10_000).toFixed(2);
          const latDir = centerLat >= 0 ? "N" : "S";
          const lonDir = centerLon >= 0 ? "E" : "W";
          const coordsFormatted = `${Math.abs(centerLat).toFixed(4)}° ${latDir}, ${Math.abs(centerLon).toFixed(4)}° ${lonDir}`;

          zonesList.push({
            id: `zone-${idx + 1}`,
            zoneNumber: idx + 1,
            label: `${selectedIndex.toUpperCase()} Sector #${String(idx + 1).padStart(2, "0")}`,
            areaM2: Math.round(areaM2),
            areaKm2,
            areaHectares,
            centerLon: +centerLon.toFixed(6),
            centerLat: +centerLat.toFixed(6),
            coordsFormatted,
            spanMeters: Math.round(spanMeters),
          });
        });

        if (hasCoords) {
          const span = Math.max(Math.abs(clusterMaxLon - clusterMinLon), Math.abs(clusterMaxLat - clusterMinLat), 0.01);
          flyTarget = {
            lon: (clusterMinLon + clusterMaxLon) / 2,
            lat: (clusterMinLat + clusterMaxLat) / 2,
            height: Math.max(1200, Math.min(span * 111000 * 2.2, 50000)),
            pitch: -90,
          };
        }
      }

      if (res.overlays && res.overlays.length > 0) {
        onApplyOverlay(res.overlays);
        if (!flyTarget && res.overlays[0].bounds && res.overlays[0].bounds.length === 4) {
          const [west, south, east, north] = res.overlays[0].bounds;
          const span = Math.max(Math.abs(east - west), Math.abs(north - south), 0.01);
          flyTarget = {
            lon: (west + east) / 2,
            lat: (south + north) / 2,
            height: Math.max(1400, Math.min(span * 111000 * 1.8, 50000)),
            pitch: -90,
          };
        }
      }

      const foundScene = scenes.find((s) => s.scene_id === activeScene);
      if (!flyTarget && foundScene && foundScene.bounds && foundScene.bounds.length === 4) {
        const [west, south, east, north] = foundScene.bounds;
        const span = Math.max(Math.abs(east - west), Math.abs(north - south), 0.01);
        flyTarget = {
          lon: (west + east) / 2,
          lat: (south + north) / 2,
          height: Math.max(1800, Math.min(span * 111000 * 1.8, 50000)),
          pitch: -90,
        };
      }

      if (flyTarget) {
        setComputedTarget(flyTarget);
        // Note: Do NOT auto-fly here so the user can review zones and choose where to navigate
      }

      setDetectedZones(zonesList);

      if (onSelectScene && activeScene && activeScene !== currentSceneId) {
        onSelectScene(activeScene, null, foundScene?.filename);
      }

      const area = typeof res.stats?.area_km2 === "number" ? res.stats.area_km2 : 0;
      const mean = typeof res.stats?.mean_index === "number" ? res.stats.mean_index : 0;
      const polyCount = typeof res.stats?.polygon_count === "number" ? res.stats.polygon_count : (res.geojson?.features?.length ?? 0);

      setIndexResult({
        areaKm2: +area.toFixed(2),
        meanVal: +mean.toFixed(2),
        pctCover: polyCount > 0 ? `${polyCount} distinct zones` : "Thresholded area",
      });
      onAskAI(`Spectral index ${selectedIndex.toUpperCase()} computed on scene ${activeScene} (threshold: > ${indexThreshold}). Surface area: ${area.toFixed(2)} km² across ${polyCount} regions.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Computation failed";
      alert(`Index Computation Error: ${msg}`);
    } finally {
      setIsCalculatingIndex(false);
    }
  };

  // Handler: Run CV Detections (100% Real YOLOv8-OBB Inference with SAHI)
  const handleRunDetection = async () => {
    setIsDetecting(true);
    setDetectionResults(null);
    try {
      const activeScene = await getEffectiveSceneId();
      if (!activeScene) {
        alert("Spatial reference required: Please draw an Area of Interest (AOI) box on the 3D globe or mount a satellite scene from the Data Library first.");
        setIsDetecting(false);
        return;
      }
      // Map selectedClasses to specific target prompts
      let targetsPrompt = "maritime vessels, aircraft, storage tanks, ground vehicles";
      if (selectedClasses.length === 1) {
        const id = selectedClasses[0];
        if (id === "vehicles") targetsPrompt = "vehicles";
        else if (id === "aviation") targetsPrompt = "planes";
        else if (id === "vessels") targetsPrompt = "ships";
        else if (id === "storage_tanks") targetsPrompt = "storage tanks";
        else targetsPrompt = id;
      } else if (selectedClasses.length > 0) {
        const mapped = selectedClasses.map((c) => {
          if (c === "vehicles") return "vehicles";
          if (c === "aviation") return "aircraft";
          if (c === "vessels") return "ships";
          if (c === "storage_tanks") return "storage tanks";
          return c;
        });
        targetsPrompt = mapped.join(", ");
      }

      const res = await queryScene({
        scene_id: activeScene,
        prompt: `Detect and count ${targetsPrompt} with confidence threshold > ${confidenceCutoff}.`,
        roi: roi || undefined,
      });

      const rawFeatures = res.geojson?.features || [];
      const features = rawFeatures.filter((f) => {
        // 1. Enforce confidence threshold strictly against user's slider
        const score = typeof f.properties?.score === "number" ? f.properties.score : 0.5;
        if (score < confidenceCutoff) {
          return false;
        }

        // 2. Strict category matching - NEVER let unrelated DOTA classes (like basketball court) through!
        const lbl = (f.properties?.label || "").toLowerCase();
        return selectedClasses.some((id) => {
          if (id === "vehicles") return lbl.includes("vehicle") || lbl.includes("car") || lbl.includes("truck") || lbl.includes("sedan") || lbl.includes("van") || lbl.includes("bus");
          if (id === "aviation") return lbl.includes("plane") || lbl.includes("aircraft") || lbl.includes("jet") || lbl.includes("airliner");
          if (id === "vessels") return lbl.includes("ship") || lbl.includes("vessel") || lbl.includes("boat") || lbl.includes("cargo") || lbl.includes("tanker");
          if (id === "storage_tanks") return lbl.includes("tank") || lbl.includes("silo") || lbl.includes("storage");
          return false;
        });
      });

      if (features.length > 0) {
        onApplyGeoJSON({
          type: "FeatureCollection",
          features,
        });
      }

      const classMap: Record<string, number> = {};
      features.forEach((f) => {
        const lbl = (f.properties?.label || "target").toLowerCase();
        classMap[lbl] = (classMap[lbl] || 0) + 1;
      });

      const colorPalette = ["#38bdf8", "#f59e0b", "#10b981", "#a855f7", "#ec4899", "#06b6d4"];
      const classes = Object.entries(classMap).map(([name, count], idx) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        count,
        color: colorPalette[idx % colorPalette.length],
      }));

      const detectionsList = features.map((f, i) => {
        let lon = 0;
        let lat = 0;
        if (f.geometry?.type === "Polygon" && f.geometry.coordinates?.[0]?.length) {
          const ring = f.geometry.coordinates[0];
          lon = ring.reduce((sum: number, pt: number[]) => sum + pt[0], 0) / ring.length;
          lat = ring.reduce((sum: number, pt: number[]) => sum + pt[1], 0) / ring.length;
        } else if (f.geometry?.type === "Point") {
          lon = f.geometry.coordinates[0];
          lat = f.geometry.coordinates[1];
        }
        return {
          id: `det-${i + 1}`,
          label: `${f.properties?.label || "Target"} #${i + 1}`,
          conf: typeof f.properties?.score === "number" ? +f.properties.score.toFixed(2) : 0.85,
          lat: +lat.toFixed(5),
          lon: +lon.toFixed(5),
        };
      });

      const totalCount = features.length || (typeof res.stats?.count === "number" ? res.stats.count : 0);
      setDetectionResults({
        totalCount,
        classes,
        detectionsList,
      });
      setDetectionPage(1);

      onAskAI(`Target detection inference completed on scene ${activeScene}. Identified ${totalCount} target(s) across ${classes.length} class(es).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Detection failed";
      alert(`Detection Inference Error: ${msg}`);
    } finally {
      setIsDetecting(false);
    }
  };

  // Handler: Run Bi-Temporal Compare (requires two real scene IDs)
  const parseSceneCaptureDate = (sc: SceneListItem): string | null => {
    if (sc.capture_date) return sc.capture_date.slice(0, 10);
    const fromName = sc.filename.match(/(\d{4}-\d{2}-\d{2})/);
    return fromName ? fromName[1] : null;
  };

  const formatCoord = (value: number, axis: "lat" | "lon") => {
    const abs = Math.abs(value).toFixed(4);
    if (axis === "lat") return `${abs}°${value >= 0 ? "N" : "S"}`;
    return `${abs}°${value >= 0 ? "E" : "W"}`;
  };

  const formatBBoxLabel = (bbox: { west: number; south: number; east: number; north: number }) =>
    `${formatCoord(bbox.south, "lat")}–${formatCoord(bbox.north, "lat")}, ${formatCoord(bbox.west, "lon")}–${formatCoord(bbox.east, "lon")}`;

  const compareAoi = useMemo(() => {
    if (roi?.bbox) {
      return { source: "roi" as const, bbox: roi.bbox };
    }
    const sceneA = scenes.find((s) => s.scene_id === compareSceneIdA);
    const sceneB = scenes.find((s) => s.scene_id === compareSceneIdB);
    const bounds = sceneA?.bounds ?? sceneB?.bounds ?? null;
    if (bounds && bounds.length === 4) {
      const [west, south, east, north] = bounds;
      return {
        source: "scene" as const,
        bbox: { west, south, east, north },
      };
    }
    return null;
  }, [roi, scenes, compareSceneIdA, compareSceneIdB]);

  const compareSceneA = scenes.find((s) => s.scene_id === compareSceneIdA) ?? null;
  const compareSceneB = scenes.find((s) => s.scene_id === compareSceneIdB) ?? null;

  const handleFetchComparePass = async (pass: "A" | "B") => {
    if (!compareAoi) {
      setCompareError(
        "Set a place first: draw an AOI on the globe, or select a catalog scene that already has bounds."
      );
      return;
    }
    const targetDate = pass === "A" ? compareFetchDateA : compareFetchDateB;
    if (!targetDate) {
      setCompareError(`Choose a target capture date for Pass ${pass}, then fetch Sentinel-2 for this AOI.`);
      return;
    }
    setFetchingComparePass(pass);
    setCompareError(null);
    try {
      const res = await fetchSatelliteScene(compareAoi.bbox, targetDate);
      onUploadSuccess(res);
      await loadScenes();
      if (pass === "A") setCompareSceneIdA(res.scene_id);
      else setCompareSceneIdB(res.scene_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Satellite fetch failed";
      setCompareError(msg);
    } finally {
      setFetchingComparePass(null);
    }
  };

  const handleRunCompare = async () => {
    if (!compareSceneIdA || !compareSceneIdB) {
      setCompareError("Select both Pass A (baseline) and Pass B (observation) scenes.");
      return;
    }
    if (compareSceneIdA === compareSceneIdB) {
      setCompareError("Pass A and Pass B must be two different scenes.");
      return;
    }

    setIsComparing(true);
    setCompareOutput(null);
    setCompareError(null);
    try {
      const indexName = compareIndex.toUpperCase();
      const dateA = compareSceneA ? parseSceneCaptureDate(compareSceneA) : null;
      const dateB = compareSceneB ? parseSceneCaptureDate(compareSceneB) : null;
      const dateClause =
        dateA && dateB
          ? ` comparing ${dateA} (baseline) with ${dateB} (observation)`
          : "";

      const res = await queryScene({
        scene_id: compareSceneIdA,
        scene_id_b: compareSceneIdB,
        roi: roi || undefined,
        prompt: `Run bi-temporal ${indexName} change detection${dateClause}. Segment surface differences and calculate changed area.`,
      });

      if (res.geojson && res.geojson.features.length > 0) {
        onApplyGeoJSON(res.geojson);
      }
      if (res.overlays && res.overlays.length > 0) {
        onApplyOverlay(res.overlays);
      }

      const changedArea =
        typeof res.stats?.changed_area_km2 === "number"
          ? res.stats.changed_area_km2
          : typeof res.stats?.area_km2 === "number"
            ? res.stats.area_km2
            : 0;
      const polyCount =
        typeof res.stats?.polygon_count === "number"
          ? res.stats.polygon_count
          : (res.geojson?.features?.length ?? 0);
      const threshold =
        typeof res.stats?.threshold === "number" ? res.stats.threshold : 0;

      const aoiCenter = compareAoi
        ? {
            lon: (compareAoi.bbox.west + compareAoi.bbox.east) / 2,
            lat: (compareAoi.bbox.south + compareAoi.bbox.north) / 2,
          }
        : null;
      if (aoiCenter) {
        const span = compareAoi
          ? Math.max(
              Math.abs(compareAoi.bbox.east - compareAoi.bbox.west),
              Math.abs(compareAoi.bbox.north - compareAoi.bbox.south),
              0.01
            )
          : 0.05;
        setComputedTarget({
          lon: aoiCenter.lon,
          lat: aoiCenter.lat,
          height: Math.max(1500, Math.min(span * 111000 * 1.8, 50000)),
          pitch: -90,
        });
      }

      setCompareOutput({
        changedAreaKm2: +changedArea.toFixed(2),
        threshold,
        changePolygons: Math.round(polyCount),
        answer: res.answer,
      });
      onAskAI(
        `Bi-temporal ${indexName} comparison completed` +
          (dateA && dateB ? ` (${dateA} → ${dateB})` : "") +
          (compareAoi ? ` over AOI ${formatBBoxLabel(compareAoi.bbox)}` : "") +
          `. Detected surface delta: ${changedArea.toFixed(2)} km² across ${Math.round(polyCount)} zones.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Comparison failed";
      setCompareError(msg);
    } finally {
      setIsComparing(false);
    }
  };

  // Handler: Create Watch (Live SQLite Persistence)
  const handleCreateWatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWatchLabel.trim()) return;
    setWatchSubmitting(true);
    try {
      const targetBBox = roi ? roi.bbox : { west: 72.8, south: 18.9, east: 73.0, north: 19.1 };
      const newWatch = await createWatch({
        email: newWatchEmail,
        label: newWatchLabel,
        bbox: targetBBox,
        tool_call: {
          action: "spectral",
          index: newWatchType === "flood" ? "ndwi" : "ndvi",
          threshold: 0.0,
          operator: "gt",
          bi_temporal: true,
        },
      });
      setWatches((prev) => [newWatch, ...prev]);
      setNewWatchLabel("");
      onAskAI(`Autonomous surveillance watch registered for "${newWatch.label}". Monitoring Sentinel-2 constellation passes.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create watch";
      alert(`Watch Creation Error: ${msg}`);
    } finally {
      setWatchSubmitting(false);
    }
  };

  // Handler: Delete Watch
  const handleDeleteWatch = async (watchId: string) => {
    try {
      await deleteWatch(watchId);
      setWatches((prev) => prev.filter((w) => w.id !== watchId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete watch";
      alert(`Delete Watch Error: ${msg}`);
    }
  };

  // Handler: Fetch On-Demand Live Sentinel-2 Pass (STAC)
  const handleFetchSatellitePass = async () => {
    setFetchingSatellite(true);
    setUploadSuccessMsg(null);
    try {
      const res = await fetchSatelliteScene(satBBox);
      onUploadSuccess(res);
      setUploadSuccessMsg(`Live Sentinel-2 Pass Ingested: ${res.filename} (${(res.size_bytes / (1024 * 1024)).toFixed(1)} MB, ${res.cloud_cover_pct?.toFixed(1) ?? "0"}% clouds)`);
      onAskAI(`Fetched live Sentinel-2 pass: ${res.filename}. Cloud cover: ${res.cloud_cover_pct?.toFixed(1) ?? "0"}%. Ready for analysis.`);
      await loadScenes();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch satellite pass";
      setUploadSuccessMsg(`Fetch Error: ${msg}`);
    } finally {
      setFetchingSatellite(false);
    }
  };

  // Handler: File Upload to Data Library
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadSuccessMsg(null);
    try {
      const sceneRes = await uploadScene(file);
      onUploadSuccess(sceneRes);
      setUploadSuccessMsg(`Successfully ingested: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
      onAskAI(`Ingested new satellite scene: ${file.name}. Initialized CRS and pyramid tiles.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadSuccessMsg(`Upload Error: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  // Get Tab Metadata
  const getTabHeader = () => {
    switch (activeTab) {
      case "explore":
        return {
          title: "Satellite Constellation & Global Hotspots",
          sub: "Browse planetary satellite feeds, toggle spectral layers, and fly to high-resolution observation sectors.",
          icon: Compass,
        };
      case "analysis":
        return {
          title: "Spectral & GIS Analysis Hub",
          sub: "Calculate empirical vegetation, hydrological, and burn severity indices across calibrated multi-spectral bands.",
          icon: BarChart3,
        };
      case "detections":
        return {
          title: "Computer Vision Object Detection Command",
          sub: "Run fine-tuned oriented bounding box (OBB) inference for vessels, aviation aircraft, and energy infrastructure.",
          icon: Scan,
        };
      case "compare":
        return {
          title: "Bi-Temporal Surface Change Detection",
          sub: "Feature Locked: Multi-pass Sentinel-2 delta analysis and surface change detection is coming soon in the next release.",
          icon: GitCompare,
          isLocked: true,
        };
      case "monitor":
        return {
          title: "Autonomous Persistent Sentinel Watches",
          sub: "Feature Locked: Automated cron-driven surveillance triggers and alert feeds are coming soon in the next release.",
          icon: Clock,
          isLocked: true,
        };
      case "projects":
        return {
          title: "Investigation Projects Portfolio",
          sub: "Organize, review, and collaborate on multi-mission geospatial intelligence investigations.",
          icon: Folder,
          isLocked: false,
        };
      case "data-library":
        return {
          title: "Upload & Satellite Scene Ingestion",
          sub: "Upload native raster GeoTIFF files (.tif, .tiff), ingest Sentinel-2 / PlanetScope scenes, and manage catalog pyramids.",
          icon: UploadCloud,
          isLocked: false,
        };
      case "reports":
        return {
          title: "Intelligence Dossiers & Export Center",
          sub: "Feature Locked: Multi-page operational mission briefings and PDF dossier generation is coming soon in the next release.",
          icon: FileText,
          isLocked: true,
        };
      default:
        return {
          title: "SOLEN Workspace",
          sub: "Enterprise remote sensing platform.",
          icon: Compass,
          isLocked: false,
        };
    }
  };

  const { title, sub, icon: HeaderIcon, isLocked } = getTabHeader();

  if (!activeTab || activeTab === "dashboard") return null;

  return (
    <div className="workspace-modal-overlay" onClick={onClose}>
      <div
        className="workspace-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ────────────────────────────────────────── */}
        <div className="workspace-modal-header">
          <div className="workspace-modal-header__left">
            <div className={`workspace-modal-header__icon ${isLocked ? "workspace-modal-header__icon--locked" : ""}`}>
              {isLocked ? (
                <Lock size={20} color="#f59e0b" />
              ) : (
                <HeaderIcon size={22} color="#22d3ee" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="workspace-modal-header__title">{title}</h2>
                {isLocked && (
                  <span className="workspace-header__coming-soon-badge">
                    <Lock size={10} />
                    COMING SOON
                  </span>
                )}
              </div>
              <p className="workspace-modal-header__sub">{sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="workspace-modal-close-pill-btn"
              title="Close workspace (Esc)"
              aria-label="Close workspace"
            >
              <span>Close</span>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Modal Body Content ─────────────────────────────────── */}
        <div className="workspace-modal-body">
          {/* ═════════════════════════════════════════════════════════
              TAB: EXPLORE
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "explore" && (
            <div className="workspace-explore">
              {/* Layer Toggles Card */}
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <Layers size={16} color="#38bdf8" />
                  <span className="workspace-card__title">Constellation Layer Controls</span>
                </div>
                <div className="workspace-layer-toggles">
                  <label className="workspace-toggle-item">
                    <input
                      type="checkbox"
                      checked={activeLayers.trueColor}
                      onChange={(e) =>
                        setActiveLayers({ ...activeLayers, trueColor: e.target.checked })
                      }
                    />
                    <div>
                      <div className="workspace-toggle-lbl">Sentinel-2 True Color (RGB)</div>
                      <div className="workspace-toggle-sub">10m natural visible spectrum reflection</div>
                    </div>
                  </label>

                  <label className="workspace-toggle-item">
                    <input
                      type="checkbox"
                      checked={activeLayers.falseColorNIR}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setActiveLayers({ ...activeLayers, falseColorNIR: checked });
                        if (checked) {
                          onAskAI("Toggled False Color NIR (Bands 8-4-3) to highlight biomass density and vegetation vigor.");
                        }
                      }}
                    />
                    <div>
                      <div className="workspace-toggle-lbl">NIR False Color (Bands 8-4-3)</div>
                      <div className="workspace-toggle-sub">Accentuates photosynthetic canopy biomass in red</div>
                    </div>
                  </label>

                  <label className="workspace-toggle-item">
                    <input
                      type="checkbox"
                      checked={activeLayers.nightLights}
                      onChange={(e) =>
                        setActiveLayers({ ...activeLayers, nightLights: e.target.checked })
                      }
                    />
                    <div>
                      <div className="workspace-toggle-lbl">VIIRS Day/Night Band (Night Lights)</div>
                      <div className="workspace-toggle-sub">Urban nocturnal radiance and blackout detection</div>
                    </div>
                  </label>

                  <label className="workspace-toggle-item">
                    <input
                      type="checkbox"
                      checked={activeLayers.orbitTracks}
                      onChange={(e) =>
                        setActiveLayers({ ...activeLayers, orbitTracks: e.target.checked })
                      }
                    />
                    <div>
                      <div className="workspace-toggle-lbl">Live Satellite Orbit Traces</div>
                      <div className="workspace-toggle-sub">Real-time SGP4 orbital propagation (S2A, Landsat-9)</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Hotspots Section */}
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <MapPin size={16} color="#34d399" />
                  <span className="workspace-card__title">Priority Observation Hotspots</span>
                  <span className="workspace-card__badge">8 Active Sectors</span>
                </div>

                <div className="workspace-hotspots-grid">
                  {GLOBAL_HOTSPOTS.map((spot) => (
                    <div
                      key={spot.id}
                      className="workspace-hotspot-item"
                      onClick={() => {
                        onFlyTo(spot.coords);
                        onClose();
                        onAskAI(`Observing ${spot.name}. Sourced from ${spot.sensor} at ${spot.resolution}.`);
                      }}
                    >
                      <div className="workspace-hotspot-item__meta">
                        <span className="workspace-hotspot-category">{spot.category}</span>
                        <h4 className="workspace-hotspot-name">{spot.name}</h4>
                        <p className="workspace-hotspot-desc">{spot.desc}</p>
                      </div>

                      <div className="workspace-hotspot-item__footer">
                        <span className="workspace-hotspot-sensor">{spot.sensor}</span>
                        <div className="workspace-hotspot-fly-btn">
                          <span>Fly To</span>
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: ANALYSIS (Spectral Indices)
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "analysis" && (
            <div className="workspace-analysis">
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <Sliders size={16} color="#22d3ee" />
                  <span className="workspace-card__title">Select Multispectral Index</span>
                </div>

                {/* Spatial Reference Status Card */}
                {roi ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <Crosshair size={16} className="text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                          <span>Spatial Reference: Drawn AOI</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">Active</span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                          Bounding Box: {roi.bbox.south.toFixed(4)}°N, {roi.bbox.west.toFixed(4)}°E → {roi.bbox.north.toFixed(4)}°N, {roi.bbox.east.toFixed(4)}°E
                        </div>
                      </div>
                    </div>
                    {onStartDrawAOI && (
                      <button
                        type="button"
                        onClick={onStartDrawAOI}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
                        title="Redraw Area of Interest on 3D globe"
                      >
                        <Crop size={12} className="text-emerald-400" />
                        <span>Redraw AOI</span>
                      </button>
                    )}
                  </div>
                ) : currentSceneId ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <Layers size={16} className="text-cyan-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                          <span>Spatial Reference: Mounted Satellite Scene</span>
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">Mounted</span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono mt-0.5 truncate max-w-[320px]">
                          Scene ID: {currentSceneId}
                        </div>
                      </div>
                    </div>
                    {onStartDrawAOI && (
                      <button
                        type="button"
                        onClick={onStartDrawAOI}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
                        title="Crop a localized sub-region AOI"
                      >
                        <Crop size={12} className="text-cyan-400" />
                        <span>Crop AOI Box</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/40 mb-3.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-amber-300">Spatial Reference Required</div>
                        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                          Spectral index computation cannot run without a target reference. Please draw an <strong>Area of Interest (AOI) box on the 3D globe</strong> or select a satellite scene from the Data Library.
                        </p>
                        <div className="flex items-center gap-2 mt-2.5">
                          {onStartDrawAOI && (
                            <button
                              type="button"
                              onClick={onStartDrawAOI}
                              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-500/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02]"
                            >
                              <Crop size={14} className="text-amber-300" />
                              <span>Draw AOI on 3D Globe</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="workspace-indices-grid">
                  {[
                    {
                      id: "ndvi",
                      name: "NDVI — Vegetation Vigor",
                      formula: "(NIR - Red) / (NIR + Red)",
                      desc: "Assesses photosynthetic activity, crop health, and forest canopy vitality.",
                    },
                    {
                      id: "ndwi",
                      name: "NDWI — Water & Floods",
                      formula: "(Green - NIR) / (Green + NIR)",
                      desc: "Delineates open water boundaries, river inundation, and wetland flooding.",
                    },
                    {
                      id: "nbr",
                      name: "NBR — Burn Severity",
                      formula: "(NIR - SWIR) / (NIR + SWIR)",
                      desc: "Highlights wildfire scars and post-fire ecological recovery stages.",
                    },
                    {
                      id: "ndmi",
                      name: "NDMI — Moisture Index",
                      formula: "(NIR - SWIR1) / (NIR + SWIR1)",
                      desc: "Determines canopy water content and drought vulnerability.",
                    },
                    {
                      id: "ndbi",
                      name: "NDBI — Built-up Index",
                      formula: "(SWIR - NIR) / (SWIR + NIR)",
                      desc: "Isolates impervious concrete surfaces, urban sprawl, and settlements.",
                    },
                  ].map((idx) => (
                    <div
                      key={idx.id}
                      onClick={() => setSelectedIndex(idx.id as any)}
                      className={`workspace-index-card ${
                        selectedIndex === idx.id ? "workspace-index-card--active" : ""
                      }`}
                    >
                      <div className="workspace-index-card__top">
                        <span className="workspace-index-card__name">{idx.name}</span>
                        <code className="workspace-index-card__formula">{idx.formula}</code>
                      </div>
                      <p className="workspace-index-card__desc">{idx.desc}</p>
                    </div>
                  ))}
                </div>

                {/* Slider */}
                <div className="workspace-threshold-box">
                  <div className="workspace-threshold-box__header">
                    <span>Sensitivity / Index Threshold:</span>
                    <strong className="text-cyan-400">{indexThreshold.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min="-0.5"
                    max="0.9"
                    step="0.05"
                    value={indexThreshold}
                    onChange={(e) => setIndexThreshold(parseFloat(e.target.value))}
                    className="workspace-range-slider"
                  />
                  <div className="workspace-threshold-box__scale">
                    <span>-0.5 (Barren/Water)</span>
                    <span>0.0</span>
                    <span>0.4 (Moderate)</span>
                    <span>0.9 (Dense Biomass)</span>
                  </div>
                </div>

                {/* Action button */}
                <div className="workspace-action-row">
                  <button
                    type="button"
                    onClick={handleRunSpectralIndex}
                    disabled={isCalculatingIndex || (!roi && !currentSceneId)}
                    className="workspace-primary-btn disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!roi && !currentSceneId ? "Spatial reference required: Please draw an AOI on the globe or mount a scene first" : undefined}
                  >
                    {isCalculatingIndex ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Computing Raster Index…</span>
                      </>
                    ) : !roi && !currentSceneId ? (
                      <>
                        <AlertTriangle size={15} className="text-amber-400" />
                        <span>Spatial Reference Required (Draw AOI First)</span>
                      </>
                    ) : (
                      <>
                        <Play size={15} />
                        <span>Compute {selectedIndex.toUpperCase()} Layer</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Output Stats & Distinct Zones Directory */}
                {indexResult && (
                  <div className="workspace-results-box">
                    {/* Top Status & Master Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 pb-3 border-b border-slate-800/80">
                      <div>
                        <div className="flex items-center gap-2">
                          <Check size={16} className="text-emerald-400 shrink-0" />
                          <span className="text-xs font-bold text-emerald-400 tracking-wide uppercase">
                            Scan Complete — {detectedZones.length > 0 ? `${detectedZones.length} Distinct Zones Detected` : "Layer Ready on Globe"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {detectedZones.length > 0
                            ? "Review coordinates below and select any zone to fly directly to it, or view the full overview."
                            : "The computed spectral overlay is active on the globe."}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleFlyToOverview}
                        className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 transition-all flex items-center gap-2 cursor-pointer shrink-0 shadow-lg shadow-emerald-950/40"
                        title="Fly out to view all detected zones at once"
                      >
                        <Navigation size={13} className="text-emerald-400" />
                        <span>✈️ Fly to Full Cluster ({detectedZones.length > 0 ? `${detectedZones.length} Zones` : "Overview"})</span>
                      </button>
                    </div>

                    {/* Stats Grid */}
                    <div className="workspace-results-grid">
                      <div className="workspace-stat-item">
                        <span className="workspace-stat-lbl">Total Detected Area</span>
                        <span className="workspace-stat-val text-emerald-400">
                          {indexResult.areaKm2} km²
                        </span>
                      </div>
                      <div className="workspace-stat-item">
                        <span className="workspace-stat-lbl">Mean Index Value</span>
                        <span className="workspace-stat-val text-cyan-400">
                          {indexResult.meanVal}
                        </span>
                      </div>
                      <div className="workspace-stat-item">
                        <span className="workspace-stat-lbl">Distinct Zones</span>
                        <span className="workspace-stat-val text-amber-400">
                          {detectedZones.length > 0 ? `${detectedZones.length} zones` : indexResult.pctCover}
                        </span>
                      </div>
                    </div>

                    {/* Distinct Zones Menu & Coordinates Directory */}
                    {detectedZones.length > 0 ? (
                      <div className="mt-3 pt-3 border-t border-slate-800/80">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-200 tracking-wide">
                              🎯 Choose Zone to Fly to:
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-emerald-500/30">
                              {filteredAndSortedZones.length} zones
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Filter input */}
                            <div className="relative">
                              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Filter zones / coords..."
                                value={zoneSearchQuery}
                                onChange={(e) => {
                                  setZoneSearchQuery(e.target.value);
                                  setZonePage(1);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (pagedZones.length > 0) {
                                      handleFlyToZone(pagedZones[0]);
                                    }
                                  }
                                }}
                                className="pl-7 pr-2.5 py-1 text-xs bg-slate-900/90 border border-slate-700/80 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 w-44"
                              />
                            </div>

                            {/* Sort select */}
                            <select
                              value={zoneSortBy}
                              onChange={(e) => setZoneSortBy(e.target.value as any)}
                              className="py-1 px-2 text-xs bg-slate-900/90 border border-slate-700/80 rounded-md text-slate-300 focus:outline-none focus:border-emerald-500/60 cursor-pointer"
                            >
                              <option value="area-desc">Largest Area</option>
                              <option value="area-asc">Smallest Area</option>
                              <option value="number">Zone # Order</option>
                            </select>
                          </div>
                        </div>

                        {/* Zone Cards List */}
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {pagedZones.map((zone) => (
                            <div
                              key={zone.id}
                              className={`flex items-center justify-between p-2.5 rounded-lg border transition-all gap-3 group ${
                                selectedZoneId === zone.id
                                  ? "bg-emerald-950/40 border-emerald-500/60 shadow-md shadow-emerald-950/30"
                                  : "bg-slate-900/70 hover:bg-slate-800/80 border-slate-800/90 hover:border-emerald-500/40"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-[11px] font-bold font-mono px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                                  #{String(zone.zoneNumber).padStart(2, "0")}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-200 truncate">
                                      {zone.label}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60 shrink-0">
                                      {zone.areaM2 >= 10000 ? `${zone.areaKm2} km²` : `${zone.areaM2.toLocaleString()} m²`}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
                                    <MapPin size={11} className="text-emerald-400/70 shrink-0" />
                                    <span>{zone.coordsFormatted}</span>
                                    <span className="text-[10px] text-slate-500">({zone.centerLat.toFixed(5)}, {zone.centerLon.toFixed(5)})</span>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleFlyToZone(zone)}
                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm group-hover:scale-105"
                                title={`Fly to ${zone.label} at (${zone.coordsFormatted})`}
                              >
                                <span>Fly to Zone</span>
                                <Crosshair size={13} className="text-emerald-400" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Pagination */}
                        {totalZonePages > 1 && (
                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                            <span>
                              Showing {(zonePage - 1) * ZONE_PAGE_SIZE + 1}–{Math.min(zonePage * ZONE_PAGE_SIZE, filteredAndSortedZones.length)} of {filteredAndSortedZones.length} zones
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={zonePage <= 1}
                                onClick={() => setZonePage((p) => Math.max(1, p - 1))}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-[11px]"
                              >
                                <ChevronLeft size={13} />
                                <span>Prev</span>
                              </button>
                              <span className="px-2 text-[11px] font-mono text-slate-300">
                                {zonePage} / {totalZonePages}
                              </span>
                              <button
                                type="button"
                                disabled={zonePage >= totalZonePages}
                                onClick={() => setZonePage((p) => Math.min(totalZonePages, p + 1))}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 text-[11px]"
                              >
                                <span>Next</span>
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800/60">
                        The computed {selectedIndex.toUpperCase()} overlay is actively projected onto the satellite scene. Click <strong>&quot;Fly to Full Cluster&quot;</strong> to inspect the highlighted regions.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: DETECTIONS (CV Object Detection)
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "detections" && (
            <div className="workspace-detections">
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <Scan size={16} color="#fb923c" />
                  <span className="workspace-card__title">YOLOv8-OBB Detection Classes</span>
                </div>

                {/* Spatial Reference Status Card */}
                {roi ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <Crosshair size={16} className="text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                          <span>Spatial Reference: Drawn AOI</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">Active</span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                          Bounding Box: {roi.bbox.south.toFixed(4)}°N, {roi.bbox.west.toFixed(4)}°E → {roi.bbox.north.toFixed(4)}°N, {roi.bbox.east.toFixed(4)}°E
                        </div>
                      </div>
                    </div>
                    {onStartDrawAOI && (
                      <button
                        type="button"
                        onClick={onStartDrawAOI}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
                        title="Redraw Area of Interest on 3D globe"
                      >
                        <Crop size={12} className="text-emerald-400" />
                        <span>Redraw AOI</span>
                      </button>
                    )}
                  </div>
                ) : currentSceneId ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 mb-3.5">
                    <div className="flex items-center gap-2.5">
                      <Layers size={16} className="text-cyan-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                          <span>Spatial Reference: Mounted Satellite Scene</span>
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">Mounted</span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-mono mt-0.5 truncate max-w-[320px]">
                          Scene ID: {currentSceneId}
                        </div>
                      </div>
                    </div>
                    {onStartDrawAOI && (
                      <button
                        type="button"
                        onClick={onStartDrawAOI}
                        className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
                        title="Crop a localized sub-region AOI"
                      >
                        <Crop size={12} className="text-cyan-400" />
                        <span>Crop AOI Box</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/40 mb-3.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-amber-300">Spatial Reference Required</div>
                        <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                          Satellite object detection and target counting cannot run without a target reference. Please draw an <strong>Area of Interest (AOI) box on the 3D globe</strong> or mount a satellite scene from the Data Library.
                        </p>
                        <div className="flex items-center gap-2 mt-2.5">
                          {onStartDrawAOI && (
                            <button
                              type="button"
                              onClick={onStartDrawAOI}
                              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-500/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02]"
                            >
                              <Crop size={14} className="text-amber-300" />
                              <span>Draw AOI on 3D Globe</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="workspace-classes-grid">
                  {[
                    { id: "vessels", label: "Maritime Vessels (Cargo, Tanker, Fishing)", icon: "🚢" },
                    { id: "aviation", label: "Commercial Aviation (Airliner, Cargo, Jet)", icon: "✈️" },
                    { id: "storage_tanks", label: "Energy Tanks (Floating & Fixed Roof)", icon: "🛢️" },
                    { id: "vehicles", label: "Ground Transport (Cars, Trucks, Rail Cars)", icon: "🚛" },
                  ].map((cls) => {
                    const isSelected = selectedClasses.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className={`workspace-class-pill ${
                          isSelected ? "workspace-class-pill--active" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedClasses([...selectedClasses, cls.id]);
                            } else {
                              setSelectedClasses(selectedClasses.filter((c) => c !== cls.id));
                            }
                          }}
                        />
                        <span className="workspace-class-icon">{cls.icon}</span>
                        <span className="workspace-class-label">{cls.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="workspace-threshold-box">
                  <div className="workspace-threshold-box__header">
                    <span>Confidence Cutoff Threshold:</span>
                    <strong className="text-orange-400">{(confidenceCutoff * 100).toFixed(0)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="0.95"
                    step="0.05"
                    value={confidenceCutoff}
                    onChange={(e) => setConfidenceCutoff(parseFloat(e.target.value))}
                    className="workspace-range-slider"
                  />
                </div>

                <div className="workspace-action-row">
                  <button
                    type="button"
                    onClick={handleRunDetection}
                    disabled={isDetecting || selectedClasses.length === 0 || (!roi && !currentSceneId)}
                    className="workspace-primary-btn disabled:opacity-40 disabled:cursor-not-allowed"
                    title={!roi && !currentSceneId ? "Spatial reference required: Please draw an AOI on the globe or mount a scene first" : undefined}
                  >
                    {isDetecting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Running YOLO-OBB Inference…</span>
                      </>
                    ) : !roi && !currentSceneId ? (
                      <>
                        <AlertTriangle size={15} className="text-amber-400" />
                        <span>Spatial Reference Required (Draw AOI First)</span>
                      </>
                    ) : (
                      <>
                        <Scan size={15} />
                        <span>Run Target Detection Inference</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Detection Output */}
                {detectionResults && (
                  <div className="workspace-results-box">
                    <div className="workspace-results-box__title">
                      Inference Found: {detectionResults.totalCount} Targets
                    </div>
                    <div className="workspace-detection-chips">
                      <div
                        onClick={() => {
                          setFilterClass("all");
                          setDetectionPage(1);
                        }}
                        className={`workspace-detection-chip cursor-pointer transition-all ${
                          filterClass === "all" ? "workspace-detection-chip--active ring-1 ring-cyan-400 bg-cyan-950/60 text-cyan-200" : "hover:bg-slate-800/80"
                        }`}
                        title="Show all detected targets"
                      >
                        <span className="workspace-detection-chip__dot" style={{ backgroundColor: "#38bdf8" }} />
                        <span>All:</span>
                        <strong>{detectionResults.totalCount}</strong>
                      </div>

                      {detectionResults.classes.map((c) => {
                        const isActive = filterClass.toLowerCase() === c.name.toLowerCase();
                        return (
                          <div
                            key={c.name}
                            onClick={() => {
                              setFilterClass(isActive ? "all" : c.name.toLowerCase());
                              setDetectionPage(1);
                            }}
                            className={`workspace-detection-chip cursor-pointer transition-all ${
                              isActive ? "workspace-detection-chip--active ring-1 ring-cyan-400 bg-cyan-950/60 text-cyan-200" : "hover:bg-slate-800/80"
                            }`}
                            title={`Filter table by ${c.name}`}
                          >
                            <span
                              className="workspace-detection-chip__dot"
                              style={{ backgroundColor: c.color }}
                            />
                            <span>{c.name}:</span>
                            <strong>{c.count}</strong>
                          </div>
                        );
                      })}
                    </div>

                    <div className="workspace-detection-table-wrap">
                      <table className="workspace-detection-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Class Classification</th>
                            <th>Confidence</th>
                            <th>Coordinates</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedDetections.map((d) => (
                            <tr key={d.id}>
                              <td><code>{d.id}</code></td>
                              <td>{d.label}</td>
                              <td className="text-emerald-400">{(d.conf * 100).toFixed(1)}%</td>
                              <td>
                                {Math.abs(d.lat) <= 90 && Math.abs(d.lon) <= 180
                                  ? `${Math.abs(d.lat).toFixed(4)}°${d.lat >= 0 ? "N" : "S"}, ${Math.abs(d.lon).toFixed(4)}°${d.lon >= 0 ? "E" : "W"}`
                                  : `UTM: ${d.lat.toFixed(0)}m N, ${d.lon.toFixed(0)}m E`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* ── Pagination & Page Navigation Controls ────── */}
                    <div className="workspace-pagination-bar">
                      <div className="workspace-pagination-info">
                        Showing <strong>{displayedDetections.length === 0 ? 0 : (detectionPage - 1) * detectionPageSize + 1}</strong>–<strong>{Math.min(detectionPage * detectionPageSize, displayedDetections.length)}</strong> of <strong>{displayedDetections.length}</strong> targets
                      </div>

                      <div className="workspace-pagination-controls">
                        <div className="workspace-pagination-size">
                          <span>Rows:</span>
                          <select
                            value={detectionPageSize}
                            onChange={(e) => {
                              setDetectionPageSize(Number(e.target.value));
                              setDetectionPage(1);
                            }}
                            className="workspace-page-select"
                          >
                            <option value={50}>50 / page</option>
                            <option value={100}>100 / page</option>
                            <option value={200}>200 / page</option>
                            <option value={500}>500 / page</option>
                            <option value={10000}>Show All ({displayedDetections.length})</option>
                          </select>
                        </div>

                        <div className="workspace-pagination-nav">
                          <button
                            type="button"
                            disabled={detectionPage <= 1}
                            onClick={() => setDetectionPage((p) => Math.max(1, p - 1))}
                            className="workspace-page-btn"
                            title="Previous Page"
                          >
                            <ChevronLeft size={14} />
                            <span>Prev</span>
                          </button>

                          <span className="workspace-page-indicator">
                            Page {detectionPage} of {totalDetectionPages}
                          </span>

                          <button
                            type="button"
                            disabled={detectionPage >= totalDetectionPages}
                            onClick={() => setDetectionPage((p) => Math.min(totalDetectionPages, p + 1))}
                            className="workspace-page-btn"
                            title="Next Page"
                          >
                            <span>Next</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: COMPARE (Bi-Temporal Change Detection) [LOCKED]
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "compare" && (
            <WorkspaceFeatureLocked
              featureName="Bi-Temporal Change Detection"
              description="Automated pixel-level delta comparison across multi-pass Sentinel-2 and commercial satellite constellations is currently locked for algorithmic optimization."
              roadmapPoints={[
                "Automated cloud-shadow masking and coregistration alignment across temporal passes",
                "Delta indices computation (NDVI vegetation gain/loss, NDWI flood inundation, NDBI urban growth)",
                "Pixel-level change threshold segmentation with polygon vector export",
              ]}
              icon={GitCompare}
              onExploreLive={() => (onTabChange ? onTabChange("detections") : onClose())}
              onClose={onClose}
            />
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: MONITOR (Automated Watches) [LOCKED]
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "monitor" && (
            <WorkspaceFeatureLocked
              featureName="Autonomous Sentinel Watches"
              description="Autonomous orbital overpass monitoring and automated event triggers are currently locked pending cloud cron orchestration rollout."
              roadmapPoints={[
                "Scheduled Sentinel-2 overpass polling against user-drawn AOI bounding boxes",
                "Automatic threshold alert triggers (flood inundation, maritime vessel clusters, deforestation)",
                "Instant webhook, Slack, and email notifications with snapshot previews",
              ]}
              icon={Clock}
              onExploreLive={() => (onTabChange ? onTabChange("detections") : onClose())}
              onClose={onClose}
            />
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: PROJECTS (Portfolio)
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "projects" && (
            <div className="workspace-projects">
              <div className="workspace-card">
                <div className="workspace-card__header-search">
                  <div className="workspace-search-box">
                    <Search size={15} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="Search projects by name, location or status..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="workspace-search-input"
                    />
                  </div>
                </div>

                <div className="workspace-projects-grid">
                  {projects.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2 col-span-full border border-dashed border-slate-800 rounded-xl bg-slate-900/40">
                      <FolderGit2 size={32} className="text-slate-600 mb-1" />
                      <span className="text-slate-300 font-semibold">No Projects in Current Workspace</span>
                      <p className="text-[11px] text-slate-500 max-w-sm">
                        Create a project to bind an Area of Interest (AOI), classification level, and persistent audit trail.
                      </p>
                    </div>
                  ) : (
                    projects
                      .filter((p) =>
                        p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
                        p.template.toLowerCase().includes(projectSearch.toLowerCase())
                      )
                      .map((proj) => {
                        const dateStr = new Date(proj.created_at).toLocaleDateString();
                        const centerLon = proj.aoi ? (proj.aoi.west + proj.aoi.east) / 2 : 77.2090;
                        const centerLat = proj.aoi ? (proj.aoi.south + proj.aoi.north) / 2 : 28.6139;
                        return (
                          <div key={proj.id} className="workspace-project-card">
                            <div className="workspace-project-card__info" style={{ padding: "16px" }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="workspace-status-badge workspace-status-badge--completed">
                                  {proj.classification}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">{proj.template}</span>
                              </div>
                              <h4 className="workspace-project-card__title">{proj.name}</h4>
                              <span className="workspace-project-card__loc">
                                <MapPin size={12} /> {proj.aoi ? `${centerLat.toFixed(2)}°, ${centerLon.toFixed(2)}°` : "Global AOI"}
                              </span>
                              <span className="workspace-project-card__date">{dateStr}</span>

                              <button
                                type="button"
                                onClick={() => {
                                  if (proj.aoi) {
                                    onFlyTo({
                                      lon: centerLon,
                                      lat: centerLat,
                                      height: 8000,
                                      pitch: -90,
                                    });
                                  }
                                  onClose();
                                  onAskAI(`Investigate active project ${proj.name} (${proj.template}).`);
                                }}
                                className="workspace-project-open-btn"
                              >
                                <span>Open Investigation</span>
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: DATA LIBRARY (Scene Ingestion & Uploads)
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "data-library" && (
            <div className="workspace-datalib">
              {/* Dropzone */}
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <UploadCloud size={16} color="#38bdf8" />
                  <span className="workspace-card__title">Ingest Custom Satellite GeoTIFF / GeoJSON</span>
                </div>

                <label className="workspace-dropzone">
                  <input
                    type="file"
                    accept=".tif,.tiff,.geotiff,.geojson,.json"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    style={{ display: "none" }}
                    className="workspace-dropzone__input"
                  />
                  <UploadCloud size={38} color="#22d3ee" className="mb-2" />
                  <div className="workspace-dropzone__title">
                    {uploading ? "Ingesting & Creating COG Pyramids…" : "Click or Drag & Drop Raster GeoTIFF"}
                  </div>
                  <p className="workspace-dropzone__sub">
                    Supports Cloud-Optimized GeoTIFF (COG), Sentinel-2 SAFE packages, and AOI GeoJSON
                  </p>
                  <div className="workspace-dropzone__badges">
                    <span className="workspace-format-badge">.TIF</span>
                    <span className="workspace-format-badge">.TIFF</span>
                    <span className="workspace-format-badge">.GEOTIFF</span>
                    <span className="workspace-format-badge">.GEOJSON</span>
                  </div>
                  <span className="workspace-dropzone__browse-btn">
                    Select Local File to Upload
                  </span>
                </label>

                {uploadSuccessMsg && (
                  <div className="workspace-upload-status">
                    <Check size={16} color="#10b981" />
                    <span>{uploadSuccessMsg}</span>
                  </div>
                )}
              </div>

              {/* On-Demand Live Sentinel-2 STAC Ingestion */}
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <RefreshCw size={16} color="#38bdf8" />
                  <span className="workspace-card__title">On-Demand Sentinel-2 STAC Ingest</span>
                  <span className="workspace-card__badge">Live Copernicus Constellation</span>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Directly query Microsoft Planetary Computer / Copernicus STAC API for the freshest low-cloud Sentinel-2 MSI pass covering your area of interest.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 font-semibold block mb-1">West Lon</label>
                    <input
                      type="number"
                      step="0.01"
                      value={satBBox.west}
                      onChange={(e) => setSatBBox((p) => ({ ...p, west: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 font-semibold block mb-1">South Lat</label>
                    <input
                      type="number"
                      step="0.01"
                      value={satBBox.south}
                      onChange={(e) => setSatBBox((p) => ({ ...p, south: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 font-semibold block mb-1">East Lon</label>
                    <input
                      type="number"
                      step="0.01"
                      value={satBBox.east}
                      onChange={(e) => setSatBBox((p) => ({ ...p, east: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-400 font-semibold block mb-1">North Lat</label>
                    <input
                      type="number"
                      step="0.01"
                      value={satBBox.north}
                      onChange={(e) => setSatBBox((p) => ({ ...p, north: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={fetchingSatellite}
                    onClick={handleFetchSatellitePass}
                    className="flex-1 py-2 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded flex items-center justify-center gap-2 transition"
                  >
                    {fetchingSatellite ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    <span>{fetchingSatellite ? "Ingesting Sentinel-2 Scene…" : "Fetch Live Sentinel-2 Pass"}</span>
                  </button>

                  {roi && (
                    <button
                      type="button"
                      onClick={() => setSatBBox(roi.bbox)}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 rounded font-medium transition"
                      title="Use active ROI drawn on globe"
                    >
                      Use ROI
                    </button>
                  )}
                </div>
              </div>

              {/* Ingested Scenes Catalog */}
              <div className="workspace-card">
                <div className="workspace-card__title-row">
                  <Database size={16} color="#10b981" />
                  <span className="workspace-card__title">Available Ingested Scene Catalog</span>
                  <span className="workspace-card__badge">{scenes.length} GeoTIFFs Ingested</span>
                </div>

                {/* Filter Input */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search scenes by filename, ID, or CRS projection..."
                    value={catalogFilter}
                    onChange={(e) => setCatalogFilter(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {loadingScenes ? (
                  <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <RefreshCw size={18} className="animate-spin text-cyan-400" />
                    <span>Loading ingested raster catalog from storage engine…</span>
                  </div>
                ) : (
                  <div className="workspace-catalog-list">
                    {scenes
                      .filter((s) =>
                        s.filename.toLowerCase().includes(catalogFilter.toLowerCase()) ||
                        s.scene_id.toLowerCase().includes(catalogFilter.toLowerCase()) ||
                        (s.crs && s.crs.toLowerCase().includes(catalogFilter.toLowerCase()))
                      )
                      .slice(0, 30)
                      .map((sc) => {
                        const sizeMb = (sc.size_bytes / (1024 * 1024)).toFixed(1);
                        const uploadDate = new Date(sc.uploaded_at).toLocaleDateString();
                        const isMounted = sc.scene_id === currentSceneId;
                        const boundsText = sc.bounds && sc.bounds.length === 4
                          ? `${sc.bounds[1].toFixed(2)}°N, ${sc.bounds[0].toFixed(2)}°E to ${sc.bounds[3].toFixed(2)}°N, ${sc.bounds[2].toFixed(2)}°E`
                          : null;

                        return (
                          <div key={sc.scene_id} className="workspace-catalog-item">
                            <div className="workspace-catalog-item__info">
                              <div className="flex items-center gap-2">
                                <h4 className="workspace-catalog-item__title">{sc.filename}</h4>
                                {isMounted && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                    Mounted Active
                                  </span>
                                )}
                              </div>
                              <div className="workspace-catalog-item__meta">
                                <span className="font-mono text-[11px] text-cyan-400">{sc.scene_id.slice(0, 18)}…</span>
                                <span>•</span>
                                <span>{sizeMb} MB</span>
                                <span>•</span>
                                <span>{sc.crs || "EPSG:32648"}</span>
                                <span>•</span>
                                <span className="text-slate-400">{uploadDate}</span>
                                {boundsText && (
                                  <>
                                    <span>•</span>
                                    <span className="text-slate-400 font-mono text-[10px]">{boundsText}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isMounted ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUnmountScene?.();
                                  }}
                                  className="workspace-catalog-unmount-btn"
                                  title="Unmount and clear this scene overlay from the 3D globe"
                                >
                                  <X size={13} />
                                  <span>Unmount</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (sc.bounds && sc.bounds.length === 4) {
                                      const centerLon = (sc.bounds[0] + sc.bounds[2]) / 2;
                                      const centerLat = (sc.bounds[1] + sc.bounds[3]) / 2;
                                      const span = Math.max(
                                        Math.abs(sc.bounds[2] - sc.bounds[0]),
                                        Math.abs(sc.bounds[3] - sc.bounds[1])
                                      );
                                      const height = Math.max(2000, span * 111000 * 1.5);
                                      onFlyTo({ lon: centerLon, lat: centerLat, height, pitch: -90 });
                                    }
                                    onSelectScene?.(sc.scene_id, sc.bounds, sc.filename);
                                    onClose();
                                    onAskAI(`Mounted scene: ${sc.filename} (${sc.scene_id}). Ready for target detection and spectral analysis.`);
                                  }}
                                  className="workspace-catalog-mount-btn"
                                  title="Mount this GeoTIFF raster onto 3D globe"
                                >
                                  <Play size={13} />
                                  <span>Mount on Globe</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => handleDeleteScene(e, sc.scene_id)}
                                className="workspace-catalog-delete-btn"
                                title="Delete scene from storage"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════
              TAB: REPORTS (Intelligence Dossiers) [LOCKED]
             ═════════════════════════════════════════════════════════ */}
          {activeTab === "reports" && (
            <WorkspaceFeatureLocked
              featureName="Intelligence Dossiers & Export Center"
              description="Automated multi-page intelligence dossier export and classified briefing report generation is currently locked for final PDF rendering certification."
              roadmapPoints={[
                "Formal PDF mission briefings with executive summary, metadata provenance, and bounding boxes",
                "High-resolution raster map inserts with calibrated scale bars and North arrows",
                "Classification watermarks (Unclassified, Restricted, Secret) and chain-of-custody hashes",
              ]}
              icon={FileText}
              onExploreLive={() => (onTabChange ? onTabChange("detections") : onClose())}
              onClose={onClose}
            />
          )}

        </div>
      </div>
    </div>
  );
}
