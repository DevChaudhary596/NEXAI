"use client";

import { Loader2 } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="Assistant is typing">
      <span className="typing-indicator__dot" />
      <span className="typing-indicator__dot" />
      <span className="typing-indicator__dot" />
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="chat-message chat-message--assistant">
      <div className="chat-message__bubble" style={{ width: "85%" }}>
        <div className="skeleton skeleton--text" style={{ width: "90%" }} />
        <div className="skeleton skeleton--text" style={{ width: "100%" }} />
        <div className="skeleton skeleton--text" style={{ width: "75%" }} />
        <div
          className="skeleton skeleton--text"
          style={{ width: "60%", marginTop: "12px" }}
        />
      </div>
    </div>
  );
}

export function ProgressBar({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="progress-bar">
      <div className="progress-bar__track" />
    </div>
  );
}

export function MapSpinner() {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <Loader2 size={32} color="#06b6d4" className="spin" />
      <span
        style={{
          fontSize: "0.75rem",
          color: "#94a3b8",
          fontWeight: 500,
        }}
      >
        Processing query…
      </span>
    </div>
  );
}
