"use client";

import React, { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Box, Map as MapIcon } from "lucide-react";

import Sidebar, { NavItemKey } from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import CenterUnderGlobe from "@/components/CenterUnderGlobe";
import { ProjectItem } from "@/components/RecentProjects";
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
import { healthCheck } from "@/lib/api";
import type {
  ROI,
  FeatureCollection,
  RasterOverlay,
  QueryResponse,
  UploadResponse,
} from "@/types";
import type { FlyToTarget } from "@/components/Cesium3DView";

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

export default function Home() {
  // Connection state
  const [isOnline, setIsOnline] = useState(true);

  // Active navigation & section tabs
  const [activeTab, setActiveTab] = useState<NavItemKey>("dashboard");
  const [activeSection, setActiveSection] = useState("explore");
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

  // Query response state for map layers
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [overlays, setOverlays] = useState<RasterOverlay[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);

  // Modals state
  const [selectedMetric, setSelectedMetric] = useState<"objects" | "area" | "accuracy" | "monitors" | null>(null);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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
          pitch: -45,
        });
        setPrefillQuery(`Analyze recent satellite observations and surface changes for ${best.displayName}`);
      }
    } catch {
      // Fallback
    }
  }, []);

  // Handle Recent Project Selection: Flies the globe to project coordinates and populates AI assistant
  const handleSelectProject = useCallback((project: ProjectItem) => {
    setFlyToTarget({
      lon: project.coordinates.lon,
      lat: project.coordinates.lat,
      height: project.coordinates.height,
      pitch: -50,
    });
    if (project.sceneId) {
      setSceneId(project.sceneId);
    }
    if (project.bounds) {
      setSceneBounds(project.bounds);
    }
    setPrefillQuery(project.sampleQuery);
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

      {/* Main 3-Column Layout */}
      <div className="theme-dashboard-body">
        {/* Column 1: Left Navigation Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Column 2: Center Command Center (Hero Globe + Metrics + Projects & Quick Actions) */}
        <div className="theme-center-column">
          {/* Top Navigation Bar */}
          <TopNav
            onSearchSubmit={handleGlobalSearch}
            onNavClick={(sec) => {
              setActiveSection(sec);
              if (sec === "upload") {
                setActiveTab("data-library");
              } else if (sec === "explore" || sec === "analyze" || sec === "monitor" || sec === "reports") {
                setActiveTab(sec === "analyze" ? "analysis" : (sec as NavItemKey));
              }
            }}
            activeSection={activeSection}
            isFullScreen={isGlobeFullScreen}
            onToggleFullScreen={handleToggleFullScreen}
            onResetGlobe={handleResetGlobe}
          />

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
                  geojson={geojson}
                  overlays={overlays}
                  flyToTarget={flyToTarget}
                  onTargetReached={() => setFlyToTarget(null)}
                  onFallbackTo2D={() => setViewMode("2d")}
                  isFullScreen={isGlobeFullScreen}
                  onToggleFullScreen={handleToggleFullScreen}
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
          />
        </aside>
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
        currentSceneId={sceneId}
        roi={roi}
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

