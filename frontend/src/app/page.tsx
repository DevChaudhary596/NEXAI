"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { Wifi, WifiOff, Map as MapIcon, Box } from "lucide-react";
import { PixelSatellite } from "@/components/PixelIcons";
import ChatSidebar from "@/components/ChatSidebar";
import SceneUploader from "@/components/SceneUploader";
import AlertsBell from "@/components/AlertsBell";
import { ProgressBar } from "@/components/LoadingSkeleton";
import { healthCheck } from "@/lib/api";
import type {
  ROI,
  FeatureCollection,
  RasterOverlay,
  QueryResponse,
  UploadResponse,
} from "@/types";

// Lazy-load MapPanel to avoid SSR issues with Leaflet
const MapPanel = dynamic(() => import("@/components/MapPanel"), {
  ssr: false,
  loading: () => (
    <div className="map-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text-tertiary)" }}>
        <MapIcon size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
        <div style={{ fontSize: "0.85rem" }}>Loading map…</div>
      </div>
    </div>
  ),
});

// Lazy-load Cesium3DView — Cesium touches window/DOM at import time and is huge.
const Cesium3DView = dynamic(() => import("@/components/Cesium3DView"), {
  ssr: false,
  loading: () => (
    <div className="map-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text-tertiary)" }}>
        <Box size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
        <div style={{ fontSize: "0.85rem" }}>Loading 3D view…</div>
      </div>
    </div>
  ),
});

export default function Home() {
  // Connection state
  const [isOnline, setIsOnline] = useState(false);

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
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  // Health check on mount
  useEffect(() => {
    const check = async () => {
      const online = await healthCheck();
      setIsOnline(online);
    };
    check();
    const interval = setInterval(check, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  // Handle scene upload
  const handleUploadComplete = useCallback((response: UploadResponse) => {
    setSceneId(response.scene_id);
    setSceneName(response.filename);
    setSceneBounds(response.bounds);
    setScene(response);
    // Clear previous query results
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

  // Handle escape key to clear ROI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && roi) {
        setROI(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roi]);

  return (
    <div className="app-container">
      {/* Progress bar during query */}
      <ProgressBar visible={isQuerying} />

      {/* Header */}
      <motion.header
        className="app-header"
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="app-header__logo">
          <div className="app-header__logo-icon">
            <PixelSatellite size={20} />
          </div>
          <div>
            <div className="app-header__title">SatQuery AI</div>
            <div className="app-header__subtitle">
              Remote Sensing Vision-Language Assistant
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {sceneId && (
            <button
              className="view-mode-toggle pixel-notch"
              onClick={() => setViewMode((m) => (m === "2d" ? "3d" : "2d"))}
            >
              {viewMode === "2d" ? (
                <>
                  <Box size={12} /> View in 3D
                </>
              ) : (
                <>
                  <MapIcon size={12} /> View in 2D
                </>
              )}
            </button>
          )}

          <AlertsBell />

          <div className="app-header__status">
            <span className={`status-dot ${!isOnline ? "status-dot--offline" : ""}`} />
            {isOnline ? <Wifi size={13} color="var(--text-secondary)" /> : <WifiOff size={13} color="var(--text-secondary)" />}
            <span className="status-label">
              {isOnline ? "Backend Connected" : "Backend Offline"}
            </span>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="app-main">
        {/* Map panel — 2D Leaflet or 3D Cesium */}
        {viewMode === "3d" ? (
          <Cesium3DView
            sceneId={sceneId}
            sceneBounds={sceneBounds}
            geojson={geojson}
          />
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

        {/* Chat sidebar — show uploader if no scene, chat if scene loaded */}
        <AnimatePresence mode="wait">
          {!sceneId ? (
            <motion.div
              key="uploader"
              className="chat-sidebar"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="chat-sidebar__header">
                <span className="chat-sidebar__header-title">
                  <PixelSatellite size={15} /> Upload Scene
                </span>
                <span className="chat-sidebar__header-badge">Step 1</span>
              </div>
              <SceneUploader onUploadComplete={handleUploadComplete} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: "flex", flexShrink: 0 }}
            >
              <ChatSidebar
                sceneId={sceneId}
                sceneName={sceneName}
                scene={scene}
                sceneBounds={sceneBounds}
                roi={roi}
                onClearROI={handleClearROI}
                onQueryResponse={handleQueryResponse}
                setIsQuerying={setIsQuerying}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
