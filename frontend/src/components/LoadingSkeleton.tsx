"use client";

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
      <div
        style={{
          width: "36px",
          height: "36px",
          border: "3px solid rgba(6, 182, 212, 0.2)",
          borderTopColor: "#06b6d4",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
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
