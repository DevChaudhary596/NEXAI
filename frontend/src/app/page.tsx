"use client";

import { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import ChatSidebar from "@/components/ChatSidebar";
import SceneUploader from "@/components/SceneUploader";
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
        <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🗺️</div>
        <div style={{ fontSize: "0.85rem" }}>Loading map…</div>
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

  // Map interaction state
  const [roi, setROI] = useState<ROI | null>(null);

  // Query response state for map layers
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);
  const [overlays, setOverlays] = useState<RasterOverlay[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);

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
      <header className="app-header">
        <div className="app-header__logo">
          <div className="app-header__logo-icon">🛰️</div>
          <div>
            <div className="app-header__title">SatQuery AI</div>
            <div className="app-header__subtitle">
              Remote Sensing Vision-Language Assistant
            </div>
          </div>
        </div>

        <div className="app-header__status">
          <div
            className={`status-dot ${!isOnline ? "status-dot--offline" : ""}`}
          />
          <span className="status-label">
            {isOnline ? "Backend Connected" : "Backend Offline"}
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="app-main">
        {/* Map panel */}
        <MapPanel
          sceneId={sceneId}
          sceneBounds={sceneBounds}
          roi={roi}
          onROIChange={setROI}
          geojson={geojson}
          overlays={overlays}
        />

        {/* Chat sidebar — show uploader if no scene, chat if scene loaded */}
        {!sceneId ? (
          <div className="chat-sidebar">
            <div className="chat-sidebar__header">
              <span className="chat-sidebar__header-title">🛰️ Upload Scene</span>
              <span className="chat-sidebar__header-badge">Step 1</span>
            </div>
            <SceneUploader onUploadComplete={handleUploadComplete} />
          </div>
        ) : (
          <ChatSidebar
            sceneId={sceneId}
            sceneName={sceneName}
            roi={roi}
            onClearROI={handleClearROI}
            onQueryResponse={handleQueryResponse}
          />
        )}
      </main>
    </div>
  );
}
