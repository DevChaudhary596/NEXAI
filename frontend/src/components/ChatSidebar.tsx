"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  Send,
  Loader2,
  MapPin,
  X,
  AlertTriangle,
  User,
  Search,
  Leaf,
  Building2,
  MessageSquare,
  Timer,
  Route,
  Wrench,
  Bell,
  FileDown,
  Check,
} from "lucide-react";
import { PixelSatellite, PixelBot } from "./PixelIcons";
import { TypingIndicator } from "./LoadingSkeleton";
import { queryScene, createWatch } from "@/lib/api";
import { exportIntelligenceReport } from "@/lib/pdfReport";
import { getStoredWatchEmail, setStoredWatchEmail } from "@/lib/watchEmail";
import { getThumbnailUrl } from "@/lib/api";
import type {
  ChatMessage,
  ROI,
  QueryResponse,
  UploadResponse,
  BBox,
  WatchableToolCall,
  ToolCall,
} from "@/types";

interface ChatSidebarProps {
  sceneId: string | null;
  sceneName: string | null;
  scene: UploadResponse | null;
  sceneBounds: number[] | null;
  roi: ROI | null;
  onClearROI: () => void;
  onQueryResponse: (response: QueryResponse) => void;
  setIsQuerying?: (value: boolean) => void;
}

function boundsToBBox(bounds: number[] | null): BBox | null {
  if (!bounds || bounds.length !== 4) return null;
  const [west, south, east, north] = bounds;
  return { west, south, east, north };
}

function isWatchable(call: ToolCall): call is WatchableToolCall {
  return call.action !== "general_vqa";
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatROI(roi: ROI): string {
  const b = roi.bbox;
  return `${b.south.toFixed(2)}°N, ${b.west.toFixed(2)}°E → ${b.north.toFixed(2)}°N, ${b.east.toFixed(2)}°E`;
}

const SAMPLE_PROMPTS = [
  { icon: Search, text: "Count the ships in this area" },
  { icon: Leaf, text: "What is the NDVI of this region?" },
  { icon: Building2, text: "Detect all buildings in this image" },
  { icon: MessageSquare, text: "Describe what you see" },
];

const messageVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export default function ChatSidebar({
  sceneId,
  sceneName,
  scene,
  sceneBounds,
  roi,
  onClearROI,
  onQueryResponse,
  setIsQuerying,
}: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content: "Welcome to SatQuery AI. Upload a scene and start querying.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "Monitor this AOI" dialog state
  const [watchTarget, setWatchTarget] = useState<ChatMessage | null>(null);
  const [watchEmail, setWatchEmail] = useState("");
  const [watchLabel, setWatchLabel] = useState("");
  const [watchSubmitting, setWatchSubmitting] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [watchDoneIds, setWatchDoneIds] = useState<Set<string>>(new Set());
  const [exportingId, setExportingId] = useState<string | null>(null);

  const openWatchDialog = (msg: ChatMessage) => {
    setWatchEmail(getStoredWatchEmail() ?? "");
    setWatchLabel(msg.question ?? "");
    setWatchError(null);
    setWatchTarget(msg);
  };

  const submitWatch = async () => {
    if (!watchTarget?.queryResponse || !sceneId) return;
    const call = watchTarget.queryResponse.routing.tool_call;
    if (!isWatchable(call)) return;
    const bbox = roi?.bbox ?? boundsToBBox(sceneBounds);
    if (!bbox) {
      setWatchError("No area of interest available for this scene.");
      return;
    }
    if (!watchEmail.trim()) {
      setWatchError("Enter an email to get notified.");
      return;
    }
    setWatchSubmitting(true);
    setWatchError(null);
    try {
      await createWatch({
        email: watchEmail.trim(),
        label: watchLabel.trim() || null,
        bbox,
        tool_call: call,
      });
      setStoredWatchEmail(watchEmail.trim());
      setWatchDoneIds((prev) => new Set(prev).add(watchTarget.id));
      setWatchTarget(null);
    } catch (err) {
      setWatchError(err instanceof Error ? err.message : "Could not create the watch.");
    } finally {
      setWatchSubmitting(false);
    }
  };

  const handleExportReport = async (msg: ChatMessage) => {
    if (!msg.queryResponse || !sceneId) return;
    setExportingId(msg.id);
    try {
      await exportIntelligenceReport({
        sceneName: sceneName ?? sceneId,
        scene,
        thumbnailUrl: getThumbnailUrl(sceneId),
        question: msg.question ?? "(scene query)",
        response: msg.queryResponse,
      });
    } catch {
      /* best-effort export - a failed PDF isn't worth an error message in chat */
    } finally {
      setExportingId(null);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const sendMessage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || !sceneId || isLoading) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: prompt.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);
      setIsQuerying?.(true);

      try {
        const response = await queryScene({
          prompt: prompt.trim(),
          scene_id: sceneId,
          roi: roi,
        });

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: response.answer,
          timestamp: new Date(),
          queryResponse: response,
          question: prompt.trim(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        onQueryResponse(response);
      } catch (err) {
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content:
            err instanceof Error
              ? `${err.message}`
              : "Something went wrong. Is the backend running on port 8000?",
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        setIsQuerying?.(false);
      }
    },
    [sceneId, roi, isLoading, onQueryResponse, setIsQuerying]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSampleClick = (prompt: string) => {
    setInput(prompt);
    if (sceneId) sendMessage(prompt);
  };

  return (
    <div className="chat-sidebar">
      {/* Header */}
      <div className="chat-sidebar__header">
        <span className="chat-sidebar__header-title">
          <PixelSatellite size={15} /> SatQuery Chat
        </span>
        <span className="chat-sidebar__header-badge">v0.1</span>
      </div>

      {/* Scene info bar */}
      {sceneId && sceneName && (
        <motion.div
          className="chat-sidebar__scene-bar"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="scene-thumbnail">
            <PixelSatellite size={16} />
          </div>
          <div className="scene-info">
            <div className="scene-info__name">{sceneName}</div>
            <div className="scene-info__meta">
              <span className="scene-info__meta-dot" />
              Scene loaded • Ready for queries
            </div>
          </div>
        </motion.div>
      )}

      {/* Messages area */}
      <div className="chat-sidebar__messages">
        {!sceneId && messages.length <= 1 && (
          <motion.div
            className="welcome-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="welcome-state__icon">
              <PixelSatellite size={48} />
            </div>
            <div className="welcome-state__title">SatQuery AI</div>
            <div className="welcome-state__subtitle">
              Upload a satellite scene to get started. Then ask questions about
              the imagery using natural language.
            </div>
            <motion.div
              className="welcome-state__hints"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
              }}
            >
              {SAMPLE_PROMPTS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <motion.div
                    key={i}
                    className="welcome-hint"
                    onClick={() => handleSampleClick(p.text)}
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="welcome-hint__icon">
                      <Icon size={15} />
                    </span>
                    {p.text}
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              className={`chat-message-row chat-message-row--${msg.role}`}
              variants={messageVariants}
              initial="hidden"
              animate="visible"
              layout
            >
              {msg.role !== "system" && (
                <div
                  className={`chat-message__avatar chat-message__avatar--${msg.role}`}
                >
                  {msg.role === "user" ? <User size={13} /> : <PixelBot size={15} />}
                </div>
              )}
              <div className={`chat-message chat-message--${msg.role}`}>
                <div
                  className={`chat-message__bubble ${
                    msg.isError ? "error-banner" : ""
                  }`}
                >
                  {msg.isError && (
                    <span className="error-banner__icon">
                      <AlertTriangle size={14} />
                    </span>
                  )}
                  {msg.role === "assistant" && !msg.isError ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    <span>{msg.content}</span>
                  )}

                  {/* Stats chips */}
                  {msg.queryResponse && (
                    <>
                      {Object.keys(msg.queryResponse.stats).length > 0 && (
                        <div className="chat-message__stats">
                          {Object.entries(msg.queryResponse.stats).map(
                            ([key, val]) => (
                              <span
                                key={key}
                                className={`stat-chip stat-chip--${msg.queryResponse?.routing?.tool_call?.action === "detection" ? "detection" : msg.queryResponse?.routing?.tool_call?.action === "segmentation" ? "segmentation" : "spectral"}`}
                              >
                                {key}: {typeof val === "number" && val % 1 !== 0 ? val.toFixed(2) : val}
                              </span>
                            )
                          )}
                        </div>
                      )}

                      {/* Timings */}
                      {msg.queryResponse.timings.total_ms > 0 && (
                        <div className="chat-message__timings">
                          <span className="timing-item">
                            <Timer size={11} /> {msg.queryResponse.timings.total_ms.toFixed(0)}ms total
                          </span>
                          <span className="timing-item">
                            <Route size={11} /> {msg.queryResponse.timings.route_ms.toFixed(0)}ms route
                          </span>
                          <span className="timing-item">
                            <Wrench size={11} /> {msg.queryResponse.timings.tool_ms.toFixed(0)}ms tool
                          </span>
                        </div>
                      )}

                      {/* Monitor / Export actions */}
                      <div className="chat-message__actions">
                        {isWatchable(msg.queryResponse.routing.tool_call) && (
                          watchDoneIds.has(msg.id) ? (
                            <span className="result-action result-action--done">
                              <Check size={11} /> Watching this AOI
                            </span>
                          ) : (
                            <button
                              className="result-action"
                              onClick={() => openWatchDialog(msg)}
                            >
                              <Bell size={11} /> Monitor this AOI
                            </button>
                          )
                        )}
                        <button
                          className="result-action"
                          onClick={() => handleExportReport(msg)}
                          disabled={exportingId === msg.id}
                        >
                          {exportingId === msg.id ? (
                            <Loader2 size={11} className="spin" />
                          ) : (
                            <FileDown size={11} />
                          )}
                          Export Report
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <span className="chat-message__timestamp">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            className="chat-message-row chat-message-row--assistant"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="chat-message__avatar chat-message__avatar--assistant">
              <PixelBot size={15} />
            </div>
            <div className="chat-message chat-message--assistant">
              <div className="chat-message__bubble">
                <TypingIndicator />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-sidebar__input-area">
        {/* ROI tag */}
        <AnimatePresence>
          {roi && (
            <motion.div
              className="chat-sidebar__roi-bar"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="roi-tag">
                <MapPin size={12} /> ROI: {formatROI(roi)}
                <button className="roi-tag__clear" onClick={onClearROI} aria-label="Clear ROI">
                  <X size={13} />
                </button>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              sceneId
                ? "Ask about this satellite scene..."
                : "Upload a scene first to start querying"
            }
            disabled={!sceneId || isLoading}
            rows={1}
          />
          <button
            className="send-button pixel-notch"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || !sceneId || isLoading}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
      </div>

      {/* Monitor this AOI dialog */}
      <AnimatePresence>
        {watchTarget && (
          <motion.div
            className="watch-dialog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !watchSubmitting && setWatchTarget(null)}
          >
            <motion.div
              className="watch-dialog"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="watch-dialog__header">
                <span>
                  <Bell size={14} /> Monitor this AOI
                </span>
                <button
                  onClick={() => setWatchTarget(null)}
                  aria-label="Close"
                  disabled={watchSubmitting}
                >
                  <X size={14} />
                </button>
              </div>
              <p className="watch-dialog__desc">
                We&apos;ll re-run this same query whenever a new satellite pass
                covers this area, and email you when the numbers move
                meaningfully.
              </p>
              <label className="watch-dialog__field">
                <span>Email</span>
                <input
                  type="email"
                  value={watchEmail}
                  onChange={(e) => setWatchEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                />
              </label>
              <label className="watch-dialog__field">
                <span>Label (optional)</span>
                <input
                  type="text"
                  value={watchLabel}
                  onChange={(e) => setWatchLabel(e.target.value)}
                  placeholder="e.g. Riverbank flood watch"
                  maxLength={120}
                />
              </label>
              {watchError && (
                <div className="watch-dialog__error">
                  <AlertTriangle size={12} /> {watchError}
                </div>
              )}
              <div className="watch-dialog__actions">
                <button
                  className="watch-dialog__cancel"
                  onClick={() => setWatchTarget(null)}
                  disabled={watchSubmitting}
                >
                  Cancel
                </button>
                <button
                  className="watch-dialog__submit pixel-notch"
                  onClick={submitWatch}
                  disabled={watchSubmitting}
                >
                  {watchSubmitting ? <Loader2 size={13} className="spin" /> : <Bell size={13} />}
                  Start Watching
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
