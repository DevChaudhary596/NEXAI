"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Box, Map as MapIcon } from "lucide-react";

import Sidebar, { NavItemKey } from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import CenterUnderGlobe from "@/components/CenterUnderGlobe";
import { QuickActionKey } from "@/components/QuickActions";
import AIAssistantPanel from "@/components/AIAssistantPanel";
import FooterBar from "@/components/FooterBar";
import CesiumErrorBoundary from "@/components/CesiumErrorBoundary";
import { ProgressBar } from "@/components/LoadingSkeleton";
import WorkspaceModal from "@/components/WorkspaceModal";
import MetricModal from "@/components/MetricModal";
import {
  NotificationsDrawer,
  ProfileModal,
  CommandPalette,
} from "@/components/HeaderModals";
import { searchPlaces } from "@/lib/geocode";
import { configureActiveWorkspace, createWorkspace, healthCheck, listWorkspaceProjects, listWorkspaces } from "@/lib/api";
import type {
  ROI,
  FeatureCollection,
  RasterOverlay,
  QueryResponse,
  UploadResponse,
  ProjectResponse,
} from "@/types";
import type { FlyToTarget, LiveViewportCapture } from "@/components/Cesium3DView";
import { useAuth } from "@/components/AuthProvider";
import type { Classification, WorkspaceResponse } from "@/types";

// Lazy-load MapPanel to avoid SSR issues with Leaflet
const MapPanel = dynamic(() => import("@/components/MapPanel"), {
  ssr: false,
  loading: () => (
    <div className="globe-fallback">
      <MapIcon size={36} className="globe-fallback-icon" />
      <span>Loading 2D Map…</span>
    </div>
  ),
});

// Lazy-load Cesium3DView — Cesium touches window/DOM at import time
const Cesium3DView = dynamic(() => import("@/components/Cesium3DView"), {
  ssr: false,
  loading: () => (
    <div className="globe-fallback">
      <Box size={36} className="globe-fallback-icon" />
      <span>Loading Interactive 3D Earth…</span>
    </div>
  ),
});

const DEFAULT_FLAGSHIP_PROJECTS: ProjectResponse[] = [
  {
    id: "proj_brahmaputra_flood",
    workspace_id: "default",
    name: "Brahmaputra Basin Flood Inundation & Embankment Breach Analysis",
    template: "flood_response",
    classification: "unclassified",
    aoi: { west: 93.50, south: 26.65, east: 94.25, north: 27.15 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "proj_himalayan_glof",
    workspace_id: "default",
    name: "Himalayan Glacial Lake Outburst (GLOF) Early Warning",
    template: "custom",
    classification: "restricted",
    aoi: { west: 88.16, south: 27.88, east: 88.24, north: 27.94 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "proj_kutch_maritime",
    workspace_id: "default",
    name: "Gulf of Kutch Maritime Border & Dark Vessel Interdiction",
    template: "maritime_surveillance",
    classification: "confidential",
    aoi: { west: 69.10, south: 22.70, east: 69.50, north: 23.05 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function Home() {
  const { logout } = useAuth();
  // Connection state
  const [isOnline, setIsOnline] = useState(true);

  // Active navigation & section tabs
  const [activeTab, setActiveTab] = useState<NavItemKey>("dashboard");
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [isGlobeFullScreen, setIsGlobeFullScreen] = useState(false);

  // Camera flight target for the 3D globe
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);

  // Query prefill for AI Assistant
  const [prefillQuery, setPrefillQuery] = useState<string | undefined>(undefined);

  // Scene state
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState<string | null>(null);
  const [sceneBounds, setSceneBounds] = useState<number[] | null>(null);
  const [scene, setScene] = useState<UploadResponse | null>(null);

  // Map interaction state
  const [roi, setROI] = useState<ROI | null>(null);
  const captureLiveSceneRef = useRef<(() => Promise<LiveViewportCapture | null>) | null>(null);

  const handleCaptureLiveViewport = useCallback(async () => {
    if (captureLiveSceneRef.current) {
      return await captureLiveSceneRef.current();
    }
    return null;
  }, []);

  // Query response state for map layers
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [overlays, setOverlays] = useState<RasterOverlay[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);

  // Modals state
  const [selectedMetric, setSelectedMetric] = useState<"objects" | "area" | "accuracy" | "monitors" | null>(null);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectResponse[]>(DEFAULT_FLAGSHIP_PROJECTS);
  const [latestResponse, setLatestResponse] = useState<QueryResponse | null>(null);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Day / Night Theme state
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("satquery_theme");
    if (saved === "light" || document.documentElement.classList.contains("light-theme")) {
      setIsLightMode(true);
      document.documentElement.classList.add("light-theme");
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    if (isLightMode) {
      document.documentElement.classList.remove("light-theme");
      localStorage.setItem("satquery_theme", "dark");
      setIsLightMode(false);
    } else {
      document.documentElement.classList.add("light-theme");
      localStorage.setItem("satquery_theme", "light");
      setIsLightMode(true);
    }
  }, [isLightMode]);

  useEffect(() => {
    void listWorkspaces().then((response) => {
      setWorkspaces(response.workspaces);
      const stored = window.localStorage.getItem("satquery.active-workspace");
      const selected = response.workspaces.find((workspace) => workspace.id === stored) ?? response.workspaces[0];
      setActiveWorkspaceId(selected?.id ?? null);
      configureActiveWorkspace(selected?.id ?? null);
    }).catch(() => {
      // The workspace switcher shows the real API failure on creation. Avoid
      // turning a temporary API outage into a fabricated workspace selection.
      setWorkspaces([]);
      setActiveWorkspaceId(null);
    });
  }, []);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    configureActiveWorkspace(workspaceId);
    window.localStorage.setItem("satquery.active-workspace", workspaceId);
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setProjects(DEFAULT_FLAGSHIP_PROJECTS);
      return;
    }
    void listWorkspaceProjects(activeWorkspaceId)
      .then((response) => {
        if (response.projects && response.projects.length > 0) {
          setProjects(response.projects);
        } else {
          setProjects(DEFAULT_FLAGSHIP_PROJECTS);
        }
      })
      .catch(() => setProjects(DEFAULT_FLAGSHIP_PROJECTS));
  }, [activeWorkspaceId]);

  const createNewWorkspace = useCallback(async (name: string, classification: Classification) => {
    const workspace = await createWorkspace(name, classification);
    setWorkspaces((current) => [...current, workspace]);
    selectWorkspace(workspace.id);
  }, [selectWorkspace]);

  // Health check on mount
  useEffect(() => {
    const check = async () => {
      const online = await healthCheck();
      setIsOnline(online);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut ⌘K and Escape for Fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCmdPaletteOpen(true);
      }
      if (e.key === "Escape") {
        setIsGlobeFullScreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleToggleFullScreen = useCallback(() => {
    setIsGlobeFullScreen((prev) => !prev);
  }, []);

  const handleResetGlobe = useCallback(() => {
    setFlyToTarget({ lon: 77.2090, lat: 28.6139, height: 16000000, pitch: -90 });
  }, []);

  // Handle scene upload
  const handleUploadComplete = useCallback((response: UploadResponse) => {
    setSceneId(response.scene_id);
    setSceneName(response.filename);
    setSceneBounds(response.bounds);
    setScene(response);
    setGeojson(null);
    setOverlays([]);
    setROI(null);
  }, []);

  // Handle query response
  const handleQueryResponse = useCallback((response: QueryResponse) => {
    setLatestResponse(response);
    if (response.geojson && response.geojson.features.length > 0) {
      setGeojson(response.geojson);
    }
    if (response.overlays && response.overlays.length > 0) {
      setOverlays(response.overlays);
    }
  }, []);

  // Clear ROI
  const handleClearROI = useCallback(() => {
    setROI(null);
  }, []);

  // Global Search Handler: Flies the 3D globe to any airport, city, or place
  const handleGlobalSearch = useCallback(async (query: string) => {
    try {
      const results = await searchPlaces(query, 3);
      if (results && results.length > 0) {
        const best = results[0];
        setFlyToTarget({
          lon: best.lon,
          lat: best.lat,
          height: 3500,
          pitch: -90,
        });
        setPrefillQuery(`Analyze recent satellite observations and surface changes for ${best.displayName}`);
      }
    } catch {
      // Fallback
    }
  }, []);

  const handleSelectProject = useCallback((project: ProjectResponse) => {
    if (project.aoi) {
      setFlyToTarget({
        lon: (project.aoi.west + project.aoi.east) / 2,
        lat: (project.aoi.south + project.aoi.north) / 2,
        height: 25000,
        pitch: -90,
      });
    }
    setPrefillQuery(`Analyze recent satellite observations and surface changes for ${project.name}`);
  }, []);

  const handleUnmountScene = useCallback(() => {
    setSceneId(null);
    setSceneBounds(null);
    setSceneName(null);
    setScene(null);
    setOverlays([]);
    setGeojson(null);
  }, []);

  // Handle Quick Action Click
  const handleQuickAction = useCallback((key: QuickActionKey) => {
    if (key === "count_objects") {
      setActiveTab("detections");
    } else if (key === "detect_changes") {
      setActiveTab("compare");
    } else if (key === "analyze_terrain") {
      setActiveTab("analysis");
    } else if (key === "ndvi_vegetation") {
      setActiveTab("analysis");
    } else if (key === "ndwi_flood_extent") {
      setActiveTab("analysis");
      setPrefillQuery("Compute NDWI flood-water extent for the selected scene and ROI.");
    } else if (key === "track_infrastructure") {
      setActiveTab("detections");
    } else if (key === "upload_scene") {
      setActiveTab("data-library");
    } else if (key === "custom_query") {
      setPrefillQuery("Generate an executive remote sensing intelligence overview of this region.");
      document.querySelector<HTMLInputElement>(".native-chat-input-field")?.focus();
    }
  }, []);

  // Handle Metric Card Click
  const handleMetricClick = useCallback((metricKey: string) => {
    setSelectedMetric(metricKey as any);
  }, []);

  // Handle Sidebar Navigation
  const handleTabChange = useCallback((tab: NavItemKey) => {
    setActiveTab(tab);
    if (tab === "explore") {
      setFlyToTarget({ lon: 77.2090, lat: 28.6139, height: 16000000, pitch: -90 });
    }
  }, []);

  return (
    <div className={`theme-dashboard-wrapper ${isGlobeFullScreen ? "theme-dashboard-wrapper--fullscreen-globe" : ""}`}>
      {/* Top Progress Bar during queries */}
      <ProgressBar visible={isQuerying} />

      {/* Main Workspace Layout */}
      <div className="theme-dashboard-body">
        {/* Column 1: Left Navigation Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Main Content Area (Unified TopNav + Columns Grid) */}
        <div className="theme-main-area">
          {/* Top Navigation Bar spanning across center and right columns */}
          <TopNav
            onSearchSubmit={handleGlobalSearch}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onWorkspaceSelect={selectWorkspace}
            onWorkspaceCreate={createNewWorkspace}
            isLightMode={isLightMode}
            onToggleTheme={handleToggleTheme}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
            onOpenProfile={() => setIsProfileOpen(true)}
          />

          {/* Grid containing Center Command Center and Right Intelligence Panel */}
          <div className="theme-columns-grid">
            {/* Column 2: Center Command Center (Hero Globe + Metrics + Projects & Quick Actions) */}
            <div className="theme-center-column">
              {/* Center Hero: 3D Interactive Earth Globe (or 2D Map) */}
              <div className={`theme-hero-card ${isGlobeFullScreen ? "theme-hero-card--fullscreen" : ""}`}>
                {viewMode === "3d" ? (
                  <CesiumErrorBoundary
                    fallback={
                      <MapPanel
                        sceneId={sceneId}
                        sceneBounds={sceneBounds}
                        scene={scene}
                        roi={roi}
                        onROIChange={setROI}
                        geojson={geojson}
                        overlays={overlays}
                      />
                    }
                  >
                    <Cesium3DView
                      sceneId={sceneId}
                      sceneBounds={sceneBounds}
                      sceneName={sceneName}
                      geojson={geojson}
                      overlays={overlays}
                      flyToTarget={flyToTarget}
                      onTargetReached={() => setFlyToTarget(null)}
                      onFallbackTo2D={() => setViewMode("2d")}
                      isFullScreen={isGlobeFullScreen}
                      onToggleFullScreen={handleToggleFullScreen}
                      onUnmountScene={handleUnmountScene}
                      roi={roi}
                      onROIChange={setROI}
                      onRegisterCapture={(fn) => {
                        captureLiveSceneRef.current = fn;
                      }}
                    />
                  </CesiumErrorBoundary>
                ) : (
                  <MapPanel
                    sceneId={sceneId}
                    sceneBounds={sceneBounds}
                    scene={scene}
                    roi={roi}
                    onROIChange={setROI}
                    geojson={geojson}
                    overlays={overlays}
                  />
                )}
              </div>

              {/* Section directly under our globe (Image 3): 4 Metric Cards + Recent Projects + Quick Actions */}
              <CenterUnderGlobe
                onMetricClick={handleMetricClick}
                onSelectProject={handleSelectProject}
                onViewAll={() => setActiveTab("projects")}
                onQuickAction={handleQuickAction}
                projects={projects}
                latestResponse={latestResponse}
                roi={roi}
              />
            </div>

            {/* Column 3: Right Intelligence Panel (AI Assistant + Mission + Quote) */}
            <aside className="theme-right-column">
              <AIAssistantPanel
                sceneId={sceneId}
                sceneName={sceneName}
                scene={scene}
                sceneBounds={sceneBounds}
                roi={roi}
                onClearROI={handleClearROI}
                onQueryResponse={handleQueryResponse}
                setIsQuerying={setIsQuerying}
                prefillQuery={prefillQuery}
                onClearPrefill={() => setPrefillQuery(undefined)}
                onOpenCommandPalette={() => setIsCmdPaletteOpen(true)}
                onOpenNotifications={() => setIsNotificationsOpen(true)}
                onOpenProfile={() => setIsProfileOpen(true)}
                onOpenWorkspace={(tab) => setActiveTab(tab)}
                classification={activeWorkspace?.classification ?? "unclassified"}
                workspaceName={activeWorkspace?.name ?? "Primary Workspace"}
                onCaptureLiveViewport={handleCaptureLiveViewport}
                onSelectScene={(scId, scBounds, filename) => {
                  setSceneId(scId);
                  if (scBounds) setSceneBounds(scBounds);
                  if (filename) setSceneName(filename);
                }}
              />
            </aside>
          </div>
        </div>
      </div>

      {/* Full-width Footer Bar */}
      <FooterBar />

      {/* ── All Interactive Startup Modals ─────────────────────────── */}
      <WorkspaceModal
        activeTab={activeTab}
        onClose={() => setActiveTab("dashboard")}
        onFlyTo={(target) => setFlyToTarget(target)}
        onApplyGeoJSON={(features) => setGeojson(features)}
        onApplyOverlay={(newOverlays) => setOverlays(newOverlays)}
        onUploadSuccess={handleUploadComplete}
        onAskAI={(prompt) => setPrefillQuery(prompt)}
        onSelectScene={(scId, scBounds, filename) => {
          setSceneId(scId);
          if (scBounds) setSceneBounds(scBounds);
          if (filename) setSceneName(filename);
        }}
        onUnmountScene={handleUnmountScene}
        currentSceneId={sceneId}
        roi={roi}
        projects={projects}
      />

      <MetricModal
        metricKey={selectedMetric}
        onClose={() => setSelectedMetric(null)}
        onOpenWorkspace={(tab) => {
          setSelectedMetric(null);
          setActiveTab(tab);
        }}
      />

      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onSelectAction={(prompt) => {
          setIsNotificationsOpen(false);
          setPrefillQuery(prompt);
        }}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      <CommandPalette
        isOpen={isCmdPaletteOpen}
        onClose={() => setIsCmdPaletteOpen(false)}
        onFlyTo={(target) => setFlyToTarget(target)}
        onSelectAction={(prompt) => setPrefillQuery(prompt)}
        onOpenWorkspace={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}
