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
import { queryScene, createWatch, uploadScene, createSnapshotScene } from "@/lib/api";
import { exportIntelligenceReport } from "@/lib/pdfReport";
import type {
  ROI,
  QueryResponse,
  UploadResponse,
  ConversationTurn,
  Classification,
} from "@/types";
import type { LiveViewportCapture } from "./Cesium3DView";
import { exportGeoJSON, exportKML, exportShapefile, exportISO19115XML } from "@/lib/gisExport";
import { exportAnswerCardAsImage } from "@/lib/cardExport";

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
  isStreaming?: boolean;
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
  classification?: Classification;
  workspaceName?: string;
  onCaptureLiveViewport?: () => Promise<LiveViewportCapture | null>;
  onSelectScene?: (sceneId: string, bounds: number[] | null, filename: string) => void;
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
  classification = "unclassified",
  workspaceName = "Primary Workspace",
  onCaptureLiveViewport,
  onSelectScene,
}: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "**SatQuery Intelligence Copilot Online**\n\nI can analyze multispectral satellite rasters, run aerial target detection (vehicles, aircraft, vessels, infrastructure), compute spectral vegetation & water indices (NDVI, NDWI, NBR), or ingest live Sentinel-2 passes.\n\nType any remote sensing query, speak into the mic, or draw a Region of Interest (ROI) on the map to begin.",
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
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, []);

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
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "**SatQuery Intelligence Copilot Online**\n\nI can analyze multispectral satellite rasters, run aerial target detection (vehicles, aircraft, vessels, infrastructure), compute spectral vegetation & water indices (NDVI, NDWI, NBR), or ingest live Sentinel-2 passes.\n\nType any remote sensing query, speak into the mic, or draw a Region of Interest (ROI) on the map to begin.",
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

  // Auto-scroll when user queries or while reasoning: scrolls down so user sees question + reasoning indicator
  useEffect(() => {
    if (messagesContainerRef.current && loading) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [loading]);

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

    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
      setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
    }

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
      let targetSceneId = sceneId;

      // Only capture live viewport if an AOI is drawn or user explicitly requested visual analysis
      const lower = textToSend.toLowerCase();
      const isVisualInspection =
        roi !== null ||
        lower.includes("analyze what is visible") ||
        lower.includes("what is visible in this map scene") ||
        lower.includes("what do you see on map") ||
        lower.includes("look at this area") ||
        lower.includes("look at the map");

      if (isVisualInspection && !targetSceneId && onCaptureLiveViewport) {
        try {
          const snap = await onCaptureLiveViewport();
          if (snap && snap.image_base64) {
            const registered = await createSnapshotScene({
              image_base64: snap.image_base64,
              bounds: snap.bounds,
              label: snap.label,
              is_roi: snap.is_roi,
            });
            targetSceneId = registered.scene_id;
            // Never call onSelectScene here — snapshots are for backend AI vision analysis,
            // never draped back over the native 3D Cesium globe to avoid visual artifacts!
          }
        } catch (snapErr) {
          console.warn("Live viewport snapshot capture error:", snapErr);
        }
      }

      // If no scene was captured or loaded, route as a general knowledge query
      if (!targetSceneId) {
        targetSceneId = "general";
      }

      const history: ConversationTurn[] = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({
          role: m.role,
          content: m.content ? m.content.slice(0, 8000) : "",
        }));

      const res = await queryScene({
        scene_id: targetSceneId,
        prompt: textToSend,
        roi: roi || undefined,
        history,
      });

      onQueryResponse(res);

      const botId = `b-${Date.now()}`;
      const fullAnswer = res.answer || "No response generated.";

      const botMsg: AssistantMessage = {
        id: botId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        queryResponse: res,
        question: textToSend,
        detectedAreaKm2: res.stats?.area_km2 || res.stats?.changed_area_km2,
        thumbnailUrl: res.overlays?.[0]?.url,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, botMsg]);
      setLoading(false);
      setIsQuerying?.(false);

      // Smoothly position user right at the start of the response instead of throwing them to the bottom!
      setTimeout(() => {
        const msgEl = document.getElementById(`msg-${botId}`);
        if (msgEl && messagesContainerRef.current) {
          const container = messagesContainerRef.current;
          const targetTop = msgEl.offsetTop - 12;
          container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
        }
      }, 40);

      // Progressive typewriter streaming animation
      let charIndex = 0;
      const stepSize = Math.max(4, Math.ceil(fullAnswer.length / 80));

      if (streamTimerRef.current) clearInterval(streamTimerRef.current);

      streamTimerRef.current = setInterval(() => {
        charIndex += stepSize;
        if (charIndex >= fullAnswer.length) {
          if (streamTimerRef.current) clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botId ? { ...msg, content: fullAnswer, isStreaming: false } : msg
            )
          );
        } else {
          const currentSlice = fullAnswer.slice(0, charIndex);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botId ? { ...msg, content: currentSlice } : msg
            )
          );
        }
      }, 16);
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

  const handleGenerateReport = async (customMsg?: AssistantMessage) => {
    const targetMsg =
      customMsg ||
      [...messages].reverse().find((m) => m.queryResponse);
    if (!targetMsg?.queryResponse) {
      setMessages((previous) => [
        ...previous,
        {
          id: `system-${Date.now()}`,
          role: "assistant",
          content: "Run an aerial target detection, segmentation, or spectral analysis query on the map first to generate an intelligence briefing report.",
          timestamp: new Date(),
        },
      ]);
      return;
    }
    setReportGenerated(true);
    try {
      const reportSceneName =
        sceneName ||
        targetMsg.queryResponse?.provenance?.source_filename ||
        targetMsg.queryResponse?.provenance?.scene_id ||
        "Active Satellite Scene";
      await exportIntelligenceReport({
        sceneName: reportSceneName,
        scene: scene || null,
        thumbnailUrl: targetMsg.thumbnailUrl || targetMsg.queryResponse?.overlays?.[0]?.url || "",
        question: targetMsg.question || targetMsg.content || "Satellite Intelligence Briefing",
        response: targetMsg.queryResponse,
        classification,
        workspaceName,
      });
    } catch (reportErr) {
      console.error("Failed to generate PDF report:", reportErr);
      window.alert("Failed to generate PDF report: " + (reportErr instanceof Error ? reportErr.message : String(reportErr)));
    } finally {
      setTimeout(() => setReportGenerated(false), 3000);
    }
  };

  const handleTrackRegion = async () => {
    setWatchCreated(true);
    try {
      const bbox = roi
        ? roi.bbox
        : { west: 77.0, south: 28.4, east: 77.1, north: 28.6 };
      const label = sceneName ? `AOI Alert - ${sceneName}` : "Active AOI Surveillance";

      await createWatch({
        email: "analyst@satquery.io",
        label,
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
      {/* ── Card 1: Our Mission Card (Matching theme.jpg) ─────────── */}
      <div
        className="native-mission-card"
        onClick={() => setShowVideoModal(true)}
        role="button"
        tabIndex={0}
        title="Watch our story (2 min)"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setShowVideoModal(true);
        }}
      >
        <img
          src="/images/theme_mission_card.jpg"
          alt="Our Mission: From satellite data to a better tomorrow."
          className="native-mission-card__img"
          style={{ width: "100%", height: "auto", display: "block", borderRadius: "16px", cursor: "pointer" }}
        />
      </div>

      {/* ── Card 2: AI Assistant Chat Card ───────────────────────── */}
      <div className="native-chat-card">
        {/* Header */}
        <div className="native-chat-card__header">
          <div className="native-chat-card__title-group">
            <span className="native-chat-card__title">AI Assistant</span>
            <span
              className="native-chat-card__status"
              onClick={() => onOpenProfile?.()}
              style={{ cursor: "pointer" }}
              title="SatQuery AI Intelligence Engine Online"
            >
              <span
                className="native-chat-card__status-dot"
                style={{ background: "#10b981", boxShadow: "0 0 8px #10b981" }}
              />
              Online
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
              id={`msg-${m.id}`}
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
                  {m.isStreaming && (
                    <span
                      className="inline-block w-2 h-4 ml-1.5 bg-cyan-400 animate-pulse align-middle rounded-sm shadow-[0_0_8px_#22d3ee]"
                      title="AI Writing…"
                    />
                  )}
                </div>
                {!m.isStreaming && m.queryResponse?.provenance && (
                  <details className="native-provenance-card">
                    <summary>Source &amp; method</summary>
                    <p><strong>Scene:</strong> {m.queryResponse.provenance.source_filename} · {m.queryResponse.provenance.scene_id}</p>
                    <p><strong>Input:</strong> {m.queryResponse.provenance.source_type}{m.queryResponse.provenance.capture_date ? ` · ${m.queryResponse.provenance.capture_date}` : ""}</p>
                    <p><strong>Bands:</strong> {m.queryResponse.provenance.bands_used.join(", ")} · <strong>Method:</strong> {m.queryResponse.provenance.analysis_method}</p>
                    <p><strong>SHA-256:</strong> {m.queryResponse.provenance.sha256}</p>
                    {m.queryResponse.uncertainty && <p><strong>Uncertainty:</strong> {m.queryResponse.uncertainty.lower.toFixed(1)}–{m.queryResponse.uncertainty.upper.toFixed(1)} ({m.queryResponse.uncertainty.method}). {m.queryResponse.uncertainty.caveat}</p>}
                  </details>
                )}
                {!m.isStreaming && m.queryResponse && (
                  <div className="native-chat-actions native-export-actions" aria-label="Export analysis">
                    <button
                      type="button"
                      className="native-action-pill"
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        fontWeight: 600,
                      }}
                      onClick={() => handleGenerateReport(m)}
                    >
                      <FileDown size={12} />
                      <span>{reportGenerated ? "Report Exported!" : "Generate PDF Dossier"}</span>
                    </button>
                    {m.queryResponse.geojson.features.length > 0 && (
                      <>
                        <button type="button" className="native-action-pill" onClick={() => exportGeoJSON(m.queryResponse!.geojson, m.queryResponse?.provenance?.scene_id ?? "satquery_analysis")}>GeoJSON</button>
                        <button type="button" className="native-action-pill" onClick={() => exportKML(m.queryResponse!.geojson, m.queryResponse?.provenance?.scene_id ?? "satquery_analysis")}>KML</button>
                        <button type="button" className="native-action-pill" onClick={() => void exportShapefile(m.queryResponse!.geojson, m.queryResponse?.provenance?.scene_id ?? "satquery_analysis").catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Shapefile export failed."))}>Shapefile</button>
                        <button type="button" className="native-action-pill" title="Export ISO 19115 Geospatial XML Metadata" onClick={() => exportISO19115XML(m.queryResponse!.geojson, m.queryResponse?.provenance?.scene_id ?? "satquery_analysis", m.queryResponse?.provenance, classification)}>ISO XML</button>
                        <button type="button" className="native-action-pill" title="Export 16:9 shareable intelligence card PNG" onClick={() => void exportAnswerCardAsImage({ sceneId: m.queryResponse?.provenance?.scene_id ?? "satquery_analysis", prompt: m.question ?? m.content, response: m.queryResponse!, classification }).catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Card image export failed."))}>Card PNG</button>
                      </>
                    )}
                  </div>
                )}

                {/* Sub-Card: Detected Area & Satellite Map */}
                {!m.isStreaming && m.detectedAreaKm2 && (
                  <div className="native-detected-card">
                    {m.thumbnailUrl && (
                      <div className="native-detected-card__thumb">
                        <img
                          src={m.thumbnailUrl}
                          alt="Analysis Map"
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
                {!m.isStreaming && m.detectedAreaKm2 && !m.queryResponse && (
                  <div className="native-chat-actions">
                    <button
                      type="button"
                      onClick={() => handleGenerateReport(m)}
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

      {/* ── Card 3: Quote Card (Matching theme.jpg) ──────────────── */}
      <div className="native-quote-card">
        <img
          src="/images/theme_quote_card.jpg"
          alt="Same Earth. Deeper Insights."
          className="native-quote-card__img"
          style={{ width: "100%", height: "auto", display: "block", borderRadius: "16px" }}
        />
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
              <div className="w-full h-40 rounded-xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-center items-center">
                <svg viewBox="0 0 360 110" className="w-full h-full">
                  <rect x="10" y="30" width="90" height="50" rx="8" fill="#0f172a" stroke="#0284c7" strokeWidth="1.5" />
                  <text x="55" y="52" fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle">Sentinel-2</text>
                  <text x="55" y="68" fill="#94a3b8" fontSize="8" textAnchor="middle">13 VNIR Bands</text>
                  <line x1="100" y1="55" x2="135" y2="55" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 3" />

                  <rect x="135" y="30" width="90" height="50" rx="8" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
                  <text x="180" y="52" fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle">GDAL Engine</text>
                  <text x="180" y="68" fill="#94a3b8" fontSize="8" textAnchor="middle">COG / Overlays</text>
                  <line x1="225" y1="55" x2="260" y2="55" stroke="#34d399" strokeWidth="1.5" strokeDasharray="3 3" />

                  <rect x="260" y="30" width="90" height="50" rx="8" fill="#0f172a" stroke="#8b5cf6" strokeWidth="1.5" />
                  <text x="305" y="52" fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle">AI Copilot</text>
                  <text x="305" y="68" fill="#94a3b8" fontSize="8" textAnchor="middle">Vision Reasoning</text>
                </svg>
              </div>
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
