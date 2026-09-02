"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { queryScene } from "@/lib/api";
import type {
  ChatMessage,
  ROI,
  QueryResponse,
  FeatureCollection,
  RasterOverlay,
} from "@/types";

interface ChatSidebarProps {
  sceneId: string | null;
  sceneName: string | null;
  roi: ROI | null;
  onClearROI: () => void;
  onQueryResponse: (response: QueryResponse) => void;
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
  { icon: "🔍", text: "Count the ships in this area" },
  { icon: "🌿", text: "What is the NDVI of this region?" },
  { icon: "🏗️", text: "Detect all buildings in this image" },
  { icon: "💬", text: "Describe what you see" },
];

export default function ChatSidebar({
  sceneId,
  sceneName,
  roi,
  onClearROI,
  onQueryResponse,
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        };

        setMessages((prev) => [...prev, assistantMessage]);
        onQueryResponse(response);
      } catch (err) {
        const errorMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content:
            err instanceof Error
              ? `⚠️ ${err.message}`
              : "⚠️ Something went wrong. Is the backend running on port 8000?",
          timestamp: new Date(),
          isError: true,
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [sceneId, roi, isLoading, onQueryResponse]
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
        <span className="chat-sidebar__header-title">🛰️ SatQuery Chat</span>
        <span className="chat-sidebar__header-badge">v0.1</span>
      </div>

      {/* Scene info bar */}
      {sceneId && sceneName && (
        <div className="chat-sidebar__scene-bar">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: "linear-gradient(135deg, #1a2235, #253348)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1rem",
              flexShrink: 0,
            }}
          >
            🗺️
          </div>
          <div className="scene-info">
            <div className="scene-info__name">{sceneName}</div>
            <div className="scene-info__meta">Scene loaded • Ready for queries</div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="chat-sidebar__messages">
        {!sceneId && messages.length <= 1 && (
          <div className="welcome-state">
            <div className="welcome-state__icon">🛰️</div>
            <div className="welcome-state__title">SatQuery AI</div>
            <div className="welcome-state__subtitle">
              Upload a satellite scene to get started. Then ask questions about
              the imagery using natural language.
            </div>
            <div className="welcome-state__hints">
              {SAMPLE_PROMPTS.map((p, i) => (
                <div
                  key={i}
                  className="welcome-hint"
                  onClick={() => handleSampleClick(p.text)}
                >
                  <span className="welcome-hint__icon">{p.icon}</span>
                  {p.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
            <div
              className={`chat-message__bubble ${
                msg.isError ? "error-banner" : ""
              }`}
            >
              {msg.role === "assistant" && !msg.isError ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
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
                        ⏱️ {msg.queryResponse.timings.total_ms.toFixed(0)}ms total
                      </span>
                      <span className="timing-item">
                        🔀 {msg.queryResponse.timings.route_ms.toFixed(0)}ms route
                      </span>
                      <span className="timing-item">
                        🔧 {msg.queryResponse.timings.tool_ms.toFixed(0)}ms tool
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <span className="chat-message__timestamp">
              {formatTime(msg.timestamp)}
            </span>
          </div>
        ))}

        {isLoading && <LoadingSkeleton />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-sidebar__input-area">
        {/* ROI tag */}
        {roi && (
          <div className="chat-sidebar__roi-bar">
            <span className="roi-tag">
              📍 ROI: {formatROI(roi)}
              <button className="roi-tag__clear" onClick={onClearROI}>
                ×
              </button>
            </span>
          </div>
        )}

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
            className="send-button"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || !sceneId || isLoading}
            aria-label="Send message"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
