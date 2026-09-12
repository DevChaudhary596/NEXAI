import React from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  Img,
} from "remotion";

export const SatelliteFeedLive: React.FC = () => {
  const frame = useCurrentFrame();

  // Slow orbital drift across 300 frames (10 seconds)
  const panX = interpolate(frame, [0, 300], [0, -35], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 300], [1.05, 1.12], {
    extrapolateRight: "clamp",
  });

  // Vertical radar scan sweep
  const scanY = interpolate(frame % 90, [0, 90], [-10, 100], {
    extrapolateRight: "clamp",
  });

  // Coordinate progression
  const latVal = (28.6139 + (frame / 300) * 0.045).toFixed(4);
  const lonVal = (77.2090 + (frame / 300) * 0.072).toFixed(4);
  const secondVal = String(Math.floor((frame / 30) % 60)).padStart(2, "0");

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#02040a",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, monospace",
      }}
    >
      {/* 4K Earth Horizon Background with subtle pan & scale */}
      <Img
        src={staticFile("images/satellite_feed_preview.jpg")}
        style={{
          position: "absolute",
          width: "115%",
          height: "115%",
          objectFit: "cover",
          transform: `translate(${panX}px, 0px) scale(${scale})`,
          filter: "brightness(0.9) contrast(1.15)",
        }}
      />

      {/* CRT Scanline Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.3) 50%)",
          backgroundSize: "100% 4px",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Moving Radar Laser Scan Beam */}
      <div
        style={{
          position: "absolute",
          top: `${scanY}%`,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: "#22d3ee",
          boxShadow: "0 0 16px 3px rgba(34, 211, 238, 0.8)",
          zIndex: 8,
        }}
      />

      {/* Top Feed Telemetry Overlay */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 20,
          right: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#e2e8f0",
          fontSize: 14,
          fontFamily: "monospace",
          zIndex: 10,
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: frame % 30 < 15 ? "#10b981" : "#059669",
              boxShadow: "0 0 8px #10b981",
            }}
          />
          <span style={{ fontWeight: 700, letterSpacing: 1.5, color: "#38bdf8" }}>
            LIVE SATELLITE PASS // S2B-MSI
          </span>
        </div>
        <div style={{ color: "#94a3b8" }}>
          10:24:{secondVal} UTC · 10m GSD
        </div>
      </div>

      {/* Crosshair Target Reticle in Center */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 80,
          height: 80,
          border: "1px dashed rgba(56, 189, 248, 0.4)",
          borderRadius: "50%",
          zIndex: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            backgroundColor: "rgba(34, 211, 238, 0.8)",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* Bottom Telemetry Bar */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 20,
          right: 20,
          display: "flex",
          justifyContent: "space-between",
          color: "#cbd5e1",
          fontSize: 13,
          fontFamily: "monospace",
          zIndex: 10,
          backgroundColor: "rgba(10, 15, 26, 0.75)",
          padding: "6px 14px",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(6px)",
        }}
      >
        <span>POS: {latVal}° N, {lonVal}° E</span>
        <span style={{ color: "#22d3ee" }}>ALT: 786.2 KM</span>
        <span style={{ color: "#10b981" }}>SPECTRAL: VNIR 13 BANDS</span>
      </div>
    </AbsoluteFill>
  );
};
