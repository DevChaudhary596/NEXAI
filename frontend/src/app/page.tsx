"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Box, Map as MapIcon, X, GripHorizontal, RotateCcw } from "lucide-react";

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
import SolenLogo from "@/components/SolenLogo";
import IntroSplashOverlay from "@/components/IntroSplashOverlay";
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
  const triggerDrawAOIRef = useRef<(() => void) | null>(null);

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
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Floating Draggable Launcher Position & Drag State
  const [launcherPos, setLauncherPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingLauncherRef = useRef(false);
  const launcherDragStartPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const launcherDragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Floating Draggable Chat Panel Position & Drag State
  const [chatPos, setChatPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingChatRef = useRef(false);
  const chatDragStartPointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const chatDragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Restore saved coordinates from localStorage
  useEffect(() => {
    try {
      const savedLauncher = localStorage.getItem("solen_launcher_pos");
      if (savedLauncher) {
        const parsed = JSON.parse(savedLauncher);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setLauncherPos(parsed);
        }
      }
      const savedChat = localStorage.getItem("solen_chat_pos");
      if (savedChat) {
        const parsed = JSON.parse(savedChat);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setChatPos(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Handlers for Launcher Icon Dragging
  const handleLauncherPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingLauncherRef.current = false;
    launcherDragStartPointer.current = { x: e.clientX, y: e.clientY };
    const rect = e.currentTarget.getBoundingClientRect();
    launcherDragStartPos.current = { x: rect.left, y: rect.top };
  }, []);

  const handleLauncherPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - launcherDragStartPointer.current.x;
    const dy = e.clientY - launcherDragStartPointer.current.y;

    if (!isDraggingLauncherRef.current && Math.hypot(dx, dy) > 5) {
      isDraggingLauncherRef.current = true;
    }

    if (isDraggingLauncherRef.current) {
      const newX = Math.max(10, Math.min(window.innerWidth - 66, launcherDragStartPos.current.x + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 66, launcherDragStartPos.current.y + dy));
      setLauncherPos({ x: newX, y: newY });
    }
  }, []);

  const handleLauncherPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (isDraggingLauncherRef.current) {
      isDraggingLauncherRef.current = false;
      setLauncherPos((current) => {
        if (current) {
          try {
            localStorage.setItem("solen_launcher_pos", JSON.stringify(current));
          } catch {
            // ignore
          }
        }
        return current;
      });
    } else {
      // Regular click: toggle open/close
      setIsCopilotOpen((open) => !open);
    }
  }, []);

  // Handlers for Chat Panel Dragging
  const handleChatDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingChatRef.current = true;
    chatDragStartPointer.current = { x: e.clientX, y: e.clientY };

    const chatElem = document.querySelector(".theme-right-column") as HTMLElement;
    if (chatElem) {
      const rect = chatElem.getBoundingClientRect();
      chatDragStartPos.current = { x: rect.left, y: rect.top };
    }
  }, []);

  const handleChatDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingChatRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - chatDragStartPointer.current.x;
    const dy = e.clientY - chatDragStartPointer.current.y;

    const chatElem = document.querySelector(".theme-right-column") as HTMLElement;
    const width = chatElem ? chatElem.offsetWidth : 390;
    const height = chatElem ? chatElem.offsetHeight : 700;

    const newX = Math.max(10, Math.min(window.innerWidth - width - 10, chatDragStartPos.current.x + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 80, chatDragStartPos.current.y + dy));
    setChatPos({ x: newX, y: newY });
  }, []);

  const handleChatDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isDraggingChatRef.current = false;
    setChatPos((current) => {
      if (current) {
        try {
          localStorage.setItem("solen_chat_pos", JSON.stringify(current));
        } catch {
          // ignore
        }
      }
      return current;
    });
  }, []);

  const resetPositions = useCallback(() => {
    setLauncherPos(null);
    setChatPos(null);
    try {
      localStorage.removeItem("solen_launcher_pos");
      localStorage.removeItem("solen_chat_pos");
    } catch {
      // ignore
    }
  }, []);

  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectResponse[]>(DEFAULT_FLAGSHIP_PROJECTS);
  const [latestResponse, setLatestResponse] = useState<QueryResponse | null>(null);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  // Day / Night Theme state
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("solen_theme") || localStorage.getItem("satquery_theme");
    if (saved === "light" || document.documentElement.classList.contains("light-theme")) {
      setIsLightMode(true);
      document.documentElement.classList.add("light-theme");
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    if (isLightMode) {
      document.documentElement.classList.remove("light-theme");
      localStorage.setItem("solen_theme", "dark");
      setIsLightMode(false);
    } else {
      document.documentElement.classList.add("light-theme");
      localStorage.setItem("solen_theme", "light");
      setIsLightMode(true);
    }
  }, [isLightMode]);

  useEffect(() => {
    void listWorkspaces().then((response) => {
      setWorkspaces(response.workspaces);
      const stored = window.localStorage.getItem("solen.active-workspace") || window.localStorage.getItem("satquery.active-workspace");
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
    window.localStorage.setItem("solen.active-workspace", workspaceId);
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

  // Handle ROI change with auto-prefill for AI chatbot
  const handleROIChange = useCallback((newRoi: ROI | null) => {
    setROI(newRoi);
    if (newRoi && newRoi.bbox) {
      const centerLat = ((newRoi.bbox.south + newRoi.bbox.north) / 2).toFixed(3);
      const centerLon = ((newRoi.bbox.west + newRoi.bbox.east) / 2).toFixed(3);
      setPrefillQuery(`Analyze satellite observations, multispectral indices, and changes for this Area of Interest (${centerLat}°N, ${centerLon}°E)`);
      setIsCopilotOpen(true);
    }
  }, []);

  // Global Search Handler: Flies the 3D globe to any airport, city, or place
  const handleGlobalSearch = useCallback(async (query: string) => {
    try {
      const results = await searchPlaces(query, 3);
      if (results && results.length > 0) {
        const best = results[0];
        let height = 3500;
        if (best.boundingBox) {
          const span = Math.max(
            Math.abs(best.boundingBox[1] - best.boundingBox[0]),
            Math.abs(best.boundingBox[3] - best.boundingBox[2])
          );
          height = Math.max(1800, Math.min(span * 111000 * 1.6, 45000));
        }
        setFlyToTarget({
          lon: best.lon,
          lat: best.lat,
          height,
          pitch: -90,
        });
        setPrefillQuery(`Analyze recent satellite observations and surface changes for ${best.displayName}`);
        setIsCopilotOpen(true);
      } else {
        alert(`Could not locate "${query}". Try searching a city name (e.g. Mumbai, Tokyo, London) or coordinates (e.g. 19.08, 72.86).`);
      }
    } catch {
      alert(`Search error for "${query}". Please check the spelling or coordinates.`);
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
    setIsCopilotOpen(true);
  }, []);

  const handleUnmountScene = useCallback(() => {
    setSceneId(null);
    setSceneBounds(null);
    setSceneName(null);
    setScene(null);
    setOverlays([]);
  }, []);

  // Quick Actions Dispatcher
  const handleQuickAction = useCallback((key: QuickActionKey) => {
    if (key === "count_objects") {
      setActiveTab("detections");
      setPrefillQuery("Run vehicle, vessel, and infrastructure object detection on this area.");
      setIsCopilotOpen(true);
    } else if (key === "detect_changes") {
      setActiveTab("compare");
      setPrefillQuery("Compare temporal satellite passes and detect surface changes.");
      setIsCopilotOpen(true);
    } else if (key === "analyze_terrain") {
      setActiveTab("analysis");
      setPrefillQuery("Analyze terrain elevation, slope, and surface features for this region.");
      setIsCopilotOpen(true);
    } else if (key === "ndvi_vegetation") {
      setActiveTab("analysis");
      setPrefillQuery("Compute NDVI vegetation index and analyze canopy health.");
      setIsCopilotOpen(true);
    } else if (key === "ndwi_flood_extent") {
      setActiveTab("analysis");
      setPrefillQuery("Compute NDWI flood-water extent for the selected scene and ROI.");
      setIsCopilotOpen(true);
    } else if (key === "track_infrastructure") {
      setActiveTab("detections");
      setPrefillQuery("Track infrastructure, road networks, and structural assets.");
      setIsCopilotOpen(true);
    } else if (key === "upload_scene") {
      setActiveTab("data-library");
    } else if (key === "custom_query") {
      setPrefillQuery("Generate an executive remote sensing intelligence overview of this region.");
      setIsCopilotOpen(true);
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
      {/* Cinematic Logo Animation & Seamless Background Preloader */}
      <IntroSplashOverlay />

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
          <div className={`theme-columns-grid ${isCopilotOpen ? "theme-columns-grid--copilot-open" : ""}`}>
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
                        onROIChange={handleROIChange}
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
                      onROIChange={handleROIChange}
                      onRegisterCapture={(fn) => {
                        captureLiveSceneRef.current = fn;
                      }}
                      onRegisterDrawAOI={(fn) => {
                        triggerDrawAOIRef.current = fn;
                      }}
                    />
                  </CesiumErrorBoundary>
                ) : (
                  <MapPanel
                    sceneId={sceneId}
                    sceneBounds={sceneBounds}
                    scene={scene}
                    roi={roi}
                    onROIChange={handleROIChange}
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

            {/* Draggable Intelligence Copilot Panel */}
            {isCopilotOpen && (
              <aside
                className="theme-right-column"
                aria-label="SOLEN intelligence copilot"
                style={
                  chatPos
                    ? {
                        left: `${chatPos.x}px`,
                        top: `${chatPos.y}px`,
                        right: "auto",
                        bottom: "auto",
                        transform: "none",
                      }
                    : undefined
                }
              >
                {/* Dedicated Drag Header Bar */}
                <div
                  className="solen-chat-panel-dragbar"
                  onPointerDown={handleChatDragStart}
                  onPointerMove={handleChatDragMove}
                  onPointerUp={handleChatDragEnd}
                  onPointerCancel={handleChatDragEnd}
                  title="Click and drag anywhere to move copilot across the screen"
                >
                  <div className="solen-chat-panel-dragbar__handle">
                    <GripHorizontal size={15} />
                    <span className="solen-chat-panel-dragbar__title">SOLEN COPILOT</span>
                    <span className="solen-chat-panel-dragbar__hint">DRAG TO MOVE</span>
                  </div>
                  <div className="solen-chat-panel-dragbar__actions">
                    <button
                      type="button"
                      className="solen-chat-panel-dragbar__btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        resetPositions();
                      }}
                      title="Reset position to default"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      type="button"
                      className="solen-chat-panel-dragbar__btn solen-chat-panel-dragbar__btn--close"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsCopilotOpen(false);
                      }}
                      title="Close copilot"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="theme-right-column__inner">
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
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {/* Full-width Footer Bar */}
      <FooterBar />

      {/* Draggable Launcher Button */}
      <button
        type="button"
        className={`solen-copilot-launcher ${isCopilotOpen ? "solen-copilot-launcher--open" : ""}`}
        onPointerDown={handleLauncherPointerDown}
        onPointerMove={handleLauncherPointerMove}
        onPointerUp={handleLauncherPointerUp}
        onPointerCancel={handleLauncherPointerUp}
        style={
          launcherPos
            ? {
                left: `${launcherPos.x}px`,
                top: `${launcherPos.y}px`,
                right: "auto",
                bottom: "auto",
                transform: "none",
              }
            : undefined
        }
        aria-label={isCopilotOpen ? "Close SOLEN copilot" : "Open SOLEN copilot"}
        aria-expanded={isCopilotOpen}
        title={
          isCopilotOpen
            ? "Close SOLEN copilot (drag to move anywhere)"
            : "Open SOLEN copilot (drag to move anywhere)"
        }
      >
        {isCopilotOpen ? <X size={22} aria-hidden="true" /> : <SolenLogo variant="icon" decorative />}
      </button>

      {/* ── All Interactive Startup Modals ─────────────────────────── */}
      <WorkspaceModal
        activeTab={activeTab}
        onClose={() => setActiveTab("dashboard")}
        onTabChange={(tab) => setActiveTab(tab)}
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
        onStartDrawAOI={() => {
          setActiveTab("dashboard");
          setTimeout(() => {
            triggerDrawAOIRef.current?.();
          }, 150);
        }}
        onCaptureLiveViewport={handleCaptureLiveViewport}
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
