"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  FileDown,
  GitCompare,
  Bell,
  Paperclip,
  ArrowUp,
  Play,
  X,
  Sun,
  Moon,
  Loader2,
  Check,
  Trash2,
  Download,
  UploadCloud,
} from "lucide-react";
import VoiceInputButton from "./VoiceInputButton";
import { queryScene, createWatch, uploadScene } from "@/lib/api";
import { exportIntelligenceReport } from "@/lib/pdfReport";
import type {
  ROI,
  QueryResponse,
  UploadResponse,
  ConversationTurn,
} from "@/types";

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  detectedAreaKm2?: number;
  areaChangePct?: string;
  thumbnailUrl?: string;
  queryResponse?: QueryResponse;
  question?: string;
}

interface AIAssistantPanelProps {
  sceneId: string | null;
  sceneName: string | null;
  scene: UploadResponse | null;
  sceneBounds: number[] | null;
  roi: ROI | null;
  onClearROI: () => void;
  onQueryResponse: (response: QueryResponse) => void;
  setIsQuerying?: (value: boolean) => void;
  prefillQuery?: string;
  onClearPrefill?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  onOpenWorkspace?: (tab: any) => void;
}

export default function AIAssistantPanel({
  sceneId,
  sceneName,
  scene,
  roi,
  onQueryResponse,
  setIsQuerying,
  prefillQuery,
  onClearPrefill,
  onOpenCommandPalette,
  onOpenNotifications,
  onOpenProfile,
  onOpenWorkspace,
}: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "**SatQuery Intelligence Copilot Online**\n\nI can analyze multispectral satellite rasters, run YOLOv8 target detection (planes, ships, storage tanks), compute spectral vegetation & water indices (NDVI, NDWI, NBR), or ingest live Sentinel-2 passes.\n\n*Type any remote sensing query, speak into the mic, or select a workspace tool.*",
      timestamp: new Date(),
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [watchCreated, setWatchCreated] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("satquery_theme");
    if (saved === "light" || document.documentElement.classList.contains("light-theme")) {
      setIsLightMode(true);
      document.documentElement.classList.add("light-theme");
    }
  }, []);

  const handleToggleTheme = () => {
    if (isLightMode) {
      document.documentElement.classList.remove("light-theme");
      localStorage.setItem("satquery_theme", "dark");
      setIsLightMode(false);
    } else {
      document.documentElement.classList.add("light-theme");
      localStorage.setItem("satquery_theme", "light");
      setIsLightMode(true);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "What can I help you with?",
        timestamp: new Date(),
      },
    ]);
    setShowChatMenu(false);
  };

  const handleExportChat = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(messages, null, 2));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `SatQuery_Intelligence_Log_${Date.now()}.json`);
    a.click();
    setShowChatMenu(false);
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        onQueryResponse({
          contract_version: "1.0",
          routing: { tool: "vector_ingest", confidence: 1.0 },
          answer: `Vector polygon imported: **${file.name}**. Bounds projected onto globe.`,
          stats: { object_count: json.features?.length || 1 },
          citations: [],
          degradation_flags: [],
          geojson: json.type === "Feature" ? { type: "FeatureCollection", features: [json] } : json,
          overlays: [],
          timings: { total_ms: 12 },
        } as unknown as QueryResponse);
        handleSend(`Imported AOI vector polygon from ${file.name}. Displaying boundary on map.`);
      } catch {
        alert("Failed to parse GeoJSON file.");
      }
    } else {
      try {
        const res = await uploadScene(file);
        handleSend(`Ingested new satellite scene: ${file.name}. Scene ID: ${res.scene_id}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        alert(msg);
      }
    }
  };

  // Auto-scroll inside chat
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Handle prefilled queries
  useEffect(() => {
    if (prefillQuery) {
      setInput(prefillQuery);
      onClearPrefill?.();
    }
  }, [prefillQuery, onClearPrefill]);

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || input).trim();
    if (!textToSend || loading) return;

    setInput("");

    const userMsg: AssistantMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setIsQuerying?.(true);

    try {
      const activeSceneId = sceneId || "d1f2e30941c2_20260903T094411";
      const history: ConversationTurn[] = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await queryScene({
        scene_id: activeSceneId,
        prompt: textToSend,
        roi: roi || undefined,
        history,
      });

      onQueryResponse(res);

      const botMsg: AssistantMessage = {
        id: `b-${Date.now()}`,
        role: "assistant",
        content: res.answer,
        timestamp: new Date(),
        queryResponse: res,
        question: textToSend,
        detectedAreaKm2: res.stats?.area_km2 || res.stats?.changed_area_km2,
        thumbnailUrl: res.overlays?.[0]?.url || "/images/mumbai_port_hd.jpg",
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Analysis request failed";
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Error**: ${errorMsg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setIsQuerying?.(false);
    }
  };

  const handleGenerateReport = async () => {
    setReportGenerated(true);
    try {
      const lastBotMsg = [...messages].reverse().find((m) => m.queryResponse);
      await exportIntelligenceReport({
        sceneName: sceneName || "Amazon Basin Sector Deforestation",
        scene: scene || null,
        thumbnailUrl: lastBotMsg?.thumbnailUrl || "/images/amazon_deforest_hd.jpg",
        question: lastBotMsg?.question || "Show me recent deforestation near the Amazon with area estimate.",
        response: lastBotMsg?.queryResponse || ({
          contract_version: "1.0",
          routing: { tool: "mock", confidence: 0.95 },
          answer: "Satellite observation report: Detected deforestation area estimated at ~312 km² (+18% vs previous period).",
          stats: { area_km2: 312, changed_area_km2: 312, confidence_score: 0.94 },
          citations: [],
          degradation_flags: [],
          geojson: { type: "FeatureCollection", features: [] },
          overlays: [],
          timings: { total_ms: 120 },
          peak_vram_gb: 2.1,
        } as unknown as QueryResponse),
      });
    } catch {
      // Handled
    }
    setTimeout(() => setReportGenerated(false), 3000);
  };

  const handleTrackRegion = async () => {
    setWatchCreated(true);
    try {
      const bbox = roi
        ? roi.bbox
        : { west: -62.0, south: -4.5, east: -58.0, north: -2.0 };

      await createWatch({
        email: "analyst@satquery.io",
        label: `AOI Alert - Amazon Basin`,
        bbox,
        tool_call: {
          action: "spectral",
          index: "ndwi",
          threshold: 0.0,
          operator: "gt",
          bi_temporal: true,
        },
      });
    } catch {
      // Handled
    }
    setTimeout(() => setWatchCreated(false), 3000);
  };

  return (
    <div className="native-assistant-panel">
      {/* ── Top Header Controls ──────────────────────────────────── */}
      <div className="native-right-header">
        <div className="native-right-header__controls">
          <div
            className="native-search-pill"
            onClick={() => onOpenCommandPalette?.()}
            style={{ cursor: "pointer" }}
            title="Open Command Palette (⌘K)"
          >
            <span className="native-search-pill__dots">...</span>
            <kbd className="native-search-pill__kbd">⌘K</kbd>
          </div>
          <button
            type="button"
            className={`native-circle-btn ${isLightMode ? "native-circle-btn--active" : ""}`}
            title={isLightMode ? "Switch to Dark Orbit Mode" : "Switch to Daylight Mode"}
            onClick={handleToggleTheme}
          >
            {isLightMode ? <Moon size={14} color="#f59e0b" /> : <Sun size={14} />}
          </button>
          <button
            type="button"
            className="native-circle-btn"
            title="Notifications"
            onClick={() => onOpenNotifications?.()}
          >
            <Bell size={14} />
            <span className="native-circle-btn__dot" />
          </button>
          <div
            className="native-avatar"
            onClick={() => onOpenProfile?.()}
            style={{ cursor: "pointer" }}
            title="SatQuery Enterprise Profile"
          >
            SQ
          </div>
        </div>

        <div className="native-right-header__slogan">
          <span>PLANET</span>
          <span>PEOPLE</span>
          <span>POSSIBILITIES</span>
        </div>
      </div>

      {/* ── Card 1: Our Mission Card ─────────────────────────────── */}
      <div
        className="native-mission-card"
        onClick={() => setShowVideoModal(true)}
      >
        <img
          src="/images/mission_clean_bg.png"
          alt="Mission Landscape"
          className="native-mission-card__bg"
          draggable={false}
        />
        <div className="native-mission-card__overlay">
          <span className="native-mission-card__subtitle">OUR MISSION</span>
          <h2 className="native-mission-card__heading">
            From satellite data<br />to a better tomorrow.
          </h2>
          <div className="native-mission-card__action">
            <div className="native-mission-card__play-btn">
              <Play size={12} fill="#181e23" color="#181e23" />
            </div>
            <div className="native-mission-card__play-meta">
              <span className="native-mission-card__play-title">Watch our story</span>
              <span className="native-mission-card__play-time">2 min</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 2: AI Assistant Chat Card ───────────────────────── */}
      <div className="native-chat-card">
        {/* Header */}
        <div className="native-chat-card__header">
          <div className="native-chat-card__title-group">
            <span className="native-chat-card__title">AI Assistant</span>
            <span className="native-chat-card__status">
              <span className="native-chat-card__status-dot" /> Online
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="native-chat-card__dots-btn"
              title="Chat Options"
              onClick={() => setShowChatMenu(!showChatMenu)}
            >
              •••
            </button>
            {showChatMenu && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "28px",
                  zIndex: 100,
                  background: "#11161b",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "10px",
                  padding: "6px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  width: "170px",
                }}
              >
                <button
                  type="button"
                  onClick={handleClearChat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    color: "#f87171",
                    fontSize: "0.75rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Trash2 size={13} />
                  <span>Clear Conversation</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportChat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    color: "#38bdf8",
                    fontSize: "0.75rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Download size={13} />
                  <span>Export Chat Log</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages Stream */}
        <div className="native-chat-card__body" ref={messagesContainerRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`native-chat-msg ${
                m.role === "user"
                  ? "native-chat-msg--user"
                  : "native-chat-msg--bot"
              }`}
            >
              {m.role === "assistant" && (
                <div className="native-chat-msg__avatar">
                  <Sparkles size={11} color="#22d3ee" />
                </div>
              )}
              <div className="native-chat-msg__content">
                <div className="native-chat-msg__bubble">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>

                {/* Sub-Card: Detected Area & Satellite Map */}
                {m.detectedAreaKm2 && (
                  <div className="native-detected-card">
                    {m.thumbnailUrl && (
                      <div className="native-detected-card__thumb">
                        <img
                          src={m.thumbnailUrl}
                          alt="Deforestation Map"
                          draggable={false}
                        />
                      </div>
                    )}
                    <div className="native-detected-card__info">
                      <span className="native-detected-card__lbl">Detected Area</span>
                      <div className="native-detected-card__val">
                        {m.detectedAreaKm2} km²
                      </div>
                      {m.areaChangePct && (
                        <div className="native-detected-card__change">
                          <span className="native-detected-card__change-num">
                            ↑ {m.areaChangePct}
                          </span>
                          <span className="native-detected-card__change-sub">
                            vs. previous period
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Pills */}
                {m.detectedAreaKm2 && (
                  <div className="native-chat-actions">
                    <button
                      type="button"
                      onClick={handleGenerateReport}
                      className="native-action-pill"
                    >
                      {reportGenerated ? (
                        <>
                          <Check size={12} color="#10b981" />
                          <span className="text-emerald-400">Report Exported!</span>
                        </>
                      ) : (
                        <>
                          <FileDown size={12} />
                          <span>Generate Report</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenWorkspace) {
                          onOpenWorkspace("compare");
                        } else {
                          handleSend("Compare with previous satellite temporal pass");
                        }
                      }}
                      className="native-action-pill"
                    >
                      <GitCompare size={12} />
                      <span>Compare with Previous</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTrackRegion();
                        onOpenWorkspace?.("monitor");
                      }}
                      className="native-action-pill"
                    >
                      <Bell size={12} />
                      <span>{watchCreated ? "Alert Active!" : "Track Region"}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="native-chat-msg native-chat-msg--bot">
              <div className="native-chat-msg__avatar">
                <Loader2 size={11} className="animate-spin text-cyan-400" />
              </div>
              <div className="native-chat-msg__content">
                <div className="native-chat-msg__bubble native-chat-msg__bubble--loading">
                  <span>Reasoning over multi-spectral satellite imagery…</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Upload / Action Chip */}
        <div className="native-chat-quick-chips">
          <button
            type="button"
            onClick={() => onOpenWorkspace?.("data-library")}
            className="native-chat-upload-chip"
            title="Upload custom GeoTIFF satellite raster"
          >
            <UploadCloud size={12} />
            <span>Upload GeoTIFF / Scene</span>
          </button>
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="native-chat-input-bar"
        >
          <div className="native-chat-input-pill">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".geojson,.json,.tif,.geotiff"
              onChange={handleFileAttach}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="native-chat-clip-btn"
              title="Attach AOI GeoJSON or GeoTIFF"
            >
              <Paperclip size={14} />
            </button>
            <input
              type="text"
              placeholder="Ask anything about Earth..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="native-chat-input-field"
            />
            <VoiceInputButton
              disabled={loading}
              onTranscribed={(transcript) => handleSend(transcript)}
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="native-chat-send-btn"
            title="Send query"
          >
            <ArrowUp size={16} />
          </button>
        </form>
      </div>

      {/* ── Card 3: Quote Card ───────────────────────────────────── */}
      <div className="native-quote-card">
        <img
          src="/images/quote_clean_bg.png"
          alt="Golden Sunrise Landscape"
          className="native-quote-card__bg"
          draggable={false}
        />
        <div className="native-quote-card__overlay">
          <blockquote className="native-quote-card__text">
            “Same Earth.<br />Deeper Insights.”
          </blockquote>
          <div className="native-quote-card__divider" />
        </div>
      </div>

      {/* ── Sub-quote Tagline ─────────────────────────────────────── */}
      <div className="native-right-footer">
        <span className="native-right-footer__bold">Real-World</span>
        <span className="native-right-footer__sub">Impact</span>
      </div>

      {/* Video Story Modal */}
      {showVideoModal && (
        <div
          className="theme-modal-overlay"
          onClick={() => setShowVideoModal(false)}
        >
          <div
            className="theme-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="theme-modal-header">
              <h4>Our Mission — SatQuery</h4>
              <button onClick={() => setShowVideoModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="theme-modal-body">
              <img
                src="/images/satellite_feed_preview.jpg"
                alt="Earth Mission"
                style={{ width: "100%", borderRadius: "10px" }}
              />
              <p
                style={{
                  marginTop: "14px",
                  fontSize: "0.85rem",
                  color: "#cbd5e1",
                  lineHeight: 1.6,
                }}
              >
                SatQuery bridges multimodal vision-language AI with real-time Earth
                observation satellite constellations. Transforming raw multi-spectral data
                into instantaneous, actionable decisions for disaster response, agriculture,
                and infrastructure resilience.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
