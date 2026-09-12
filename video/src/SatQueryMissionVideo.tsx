import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Series,
  Img,
} from "remotion";

// ── Shared HUD overlay components ───────────────────────────────────────────
const ScanlineOverlay: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))",
      backgroundSize: "100% 3px, 6px 100%",
      pointerEvents: "none",
      zIndex: 10,
    }}
  />
);

const TopHudBar: React.FC<{ missionName: string; step: string }> = ({
  missionName,
  step,
}) => (
  <div
    style={{
      position: "absolute",
      top: 40,
      left: 60,
      right: 60,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontFamily: "monospace",
      fontSize: 16,
      color: "#38bdf8",
      borderBottom: "1px solid rgba(56, 189, 248, 0.3)",
      paddingBottom: 16,
      zIndex: 20,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: "#10b981",
          boxShadow: "0 0 10px #10b981",
        }}
      />
      <span style={{ fontWeight: "bold", letterSpacing: 2 }}>
        SATQUERY AI // {missionName}
      </span>
    </div>
    <div style={{ display: "flex", gap: 24, color: "#94a3b8" }}>
      <span>COORD: 28.6139° N, 77.2090° E</span>
      <span style={{ color: "#38bdf8" }}>MODE: {step}</span>
      <span>SYS: OPERATIONAL 100%</span>
    </div>
  </div>
);

// ── SCENE 1: ORBITAL EYE / INTRO ────────────────────────────────────────────
const Scene1_Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = interpolate(frame, [0, 180], [1.0, 1.12], {
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateRight: "clamp",
  });

  const titleSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 90 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#030712",
        opacity: opacity * fadeOut,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("images/satellite_feed_preview.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          filter: "brightness(0.85) contrast(1.15)",
        }}
      />
      <ScanlineOverlay />
      <TopHudBar missionName="GLOBAL MISSION CONTROL" step="ORBITAL PASS" />

      {/* Main Center Title */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 15,
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        <div
          style={{
            transform: `scale(${titleSpring})`,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            padding: "10px 24px",
            borderRadius: "9999px",
            border: "1px solid rgba(56, 189, 248, 0.4)",
            color: "#38bdf8",
            fontSize: 20,
            fontFamily: "monospace",
            letterSpacing: 4,
            marginBottom: 24,
            backdropFilter: "blur(8px)",
          }}
        >
          AUTONOMOUS GEOSPATIAL INTELLIGENCE
        </div>

        <h1
          style={{
            fontSize: 84,
            fontWeight: 900,
            color: "#f8fafc",
            letterSpacing: "-2px",
            margin: "0 0 20px 0",
            textShadow: "0 0 40px rgba(56, 189, 248, 0.5)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          SATQUERY AI
        </h1>

        <p
          style={{
            fontSize: 28,
            maxWidth: 900,
            color: "#cbd5e1",
            lineHeight: 1.5,
            margin: 0,
            textShadow: "0 2px 10px rgba(0,0,0,0.8)",
          }}
        >
          Transforming terabytes of raw satellite constellation feeds into
          sub-second real-world decisions.
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ── SCENE 2: YOLOv8-OBB DETECTION ───────────────────────────────────────────
const Scene2_Detection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scanY = interpolate(frame, [0, 180], [0, 1080], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateRight: "clamp",
  });

  const box1 = spring({ frame: frame - 15, fps });
  const box2 = spring({ frame: frame - 30, fps });
  const box3 = spring({ frame: frame - 45, fps });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#030712",
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("images/metric_plane_hd.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.7) contrast(1.2)",
        }}
      />
      <ScanlineOverlay />
      <TopHudBar missionName="AERIAL AIRFIELD RECONNAISSANCE" step="YOLOv8-OBB INFERENCE" />

      {/* Laser Scanning Line */}
      <div
        style={{
          position: "absolute",
          top: scanY,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: "#38bdf8",
          boxShadow: "0 0 20px 4px #38bdf8",
          zIndex: 12,
        }}
      />

      {/* Simulated Oriented Bounding Boxes */}
      {frame >= 15 && (
        <div
          style={{
            position: "absolute",
            left: 480,
            top: 360,
            width: 220,
            height: 180,
            border: "2px solid #38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.15)",
            transform: `rotate(-15deg) scale(${box1})`,
            zIndex: 14,
            padding: 8,
          }}
        >
          <span
            style={{
              backgroundColor: "#0284c7",
              color: "#fff",
              fontSize: 14,
              fontFamily: "monospace",
              padding: "2px 8px",
              fontWeight: "bold",
            }}
          >
            AIRCRAFT #01 · 98.4%
          </span>
        </div>
      )}

      {frame >= 30 && (
        <div
          style={{
            position: "absolute",
            left: 920,
            top: 420,
            width: 240,
            height: 190,
            border: "2px solid #38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.15)",
            transform: `rotate(25deg) scale(${box2})`,
            zIndex: 14,
            padding: 8,
          }}
        >
          <span
            style={{
              backgroundColor: "#0284c7",
              color: "#fff",
              fontSize: 14,
              fontFamily: "monospace",
              padding: "2px 8px",
              fontWeight: "bold",
            }}
          >
            AIRCRAFT #02 · 97.2%
          </span>
        </div>
      )}

      {frame >= 45 && (
        <div
          style={{
            position: "absolute",
            left: 1300,
            top: 280,
            width: 180,
            height: 140,
            border: "2px solid #f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.15)",
            transform: `rotate(5deg) scale(${box3})`,
            zIndex: 14,
            padding: 8,
          }}
        >
          <span
            style={{
              backgroundColor: "#d97706",
              color: "#fff",
              fontSize: 14,
              fontFamily: "monospace",
              padding: "2px 8px",
              fontWeight: "bold",
            }}
          >
            FUEL TANK #08 · 99.1%
          </span>
        </div>
      )}

      {/* Bottom Live Metrics Banner */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 60,
          right: 60,
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          border: "1px solid rgba(56, 189, 248, 0.4)",
          borderRadius: 16,
          padding: "20px 40px",
          display: "flex",
          justifyContent: "space-around",
          zIndex: 20,
          backdropFilter: "blur(12px)",
        }}
      >
        <div>
          <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "monospace" }}>TOTAL TARGETS</div>
          <div style={{ color: "#38bdf8", fontSize: 36, fontWeight: 900 }}>819 IDENTIFIED</div>
        </div>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 40 }}>
          <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "monospace" }}>CONFIDENCE</div>
          <div style={{ color: "#10b981", fontSize: 36, fontWeight: 900 }}>97.6% PRECISION</div>
        </div>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 40 }}>
          <div style={{ color: "#94a3b8", fontSize: 14, fontFamily: "monospace" }}>ENGINE</div>
          <div style={{ color: "#f59e0b", fontSize: 36, fontWeight: 900 }}>YOLOv8-OBB + SAHI</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── SCENE 3: MULTISPECTRAL GIS / DISASTER RESCUE ────────────────────────────
const Scene3_Disaster: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#030712",
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("images/theme_proj_brahmaputra.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.65) contrast(1.15)",
        }}
      />
      <ScanlineOverlay />
      <TopHudBar missionName="DISASTER RELIEF: BRAHMAPUTRA" step="NDWI SPECTRAL ENGINE" />

      {/* Simulated Glowing Water Mask Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 40% 60%, rgba(6, 182, 212, 0.45) 0%, rgba(6, 182, 212, 0) 65%)",
          zIndex: 12,
        }}
      />

      {/* Left Overlay Card */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 240,
          width: 520,
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          border: "1px solid rgba(6, 182, 212, 0.5)",
          borderRadius: 20,
          padding: 36,
          zIndex: 20,
          backdropFilter: "blur(12px)",
          color: "#fff",
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.2)",
            color: "#f87171",
            border: "1px solid #ef4444",
            padding: "4px 12px",
            borderRadius: 6,
            display: "inline-block",
            fontSize: 14,
            fontWeight: "bold",
            marginBottom: 16,
            fontFamily: "monospace",
          }}
        >
          ACTIVE EMERGENCY RESPONSE // NDRF
        </div>
        <h2 style={{ fontSize: 32, fontWeight: 900, margin: "0 0 12px 0" }}>
          Flood Inundation & Embankment Breach
        </h2>
        <p style={{ color: "#cbd5e1", fontSize: 18, lineHeight: 1.6, margin: "0 0 24px 0" }}>
          Bi-temporal Sentinel-2 MSI spectral mapping isolates breached levees,
          calculating submerged roadways for rapid disaster evacuation.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div
            style={{
              backgroundColor: "rgba(30, 41, 59, 0.7)",
              padding: 16,
              borderRadius: 12,
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: 13 }}>INUNDATED AREA</div>
            <div style={{ color: "#38bdf8", fontSize: 24, fontWeight: "bold" }}>
              312.4 km²
            </div>
          </div>
          <div
            style={{
              backgroundColor: "rgba(30, 41, 59, 0.7)",
              padding: 16,
              borderRadius: 12,
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: 13 }}>BREACHED LEVEES</div>
            <div style={{ color: "#f87171", fontSize: 24, fontWeight: "bold" }}>
              18 Isolated
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── SCENE 4: 24/7 NAVAL DOMAIN AWARENESS ─────────────────────────────────────
const Scene4_Navy: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [160, 180], [1, 0], {
    extrapolateRight: "clamp",
  });

  const radarAngle = (frame * 5) % 360;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#030712",
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("images/mumbai_port_hd.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.65) contrast(1.2)",
        }}
      />
      <ScanlineOverlay />
      <TopHudBar missionName="MARITIME DOMAIN AWARENESS" step="24/7 FLEET RADAR" />

      {/* Rotating Radar Rings */}
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 200,
          width: 500,
          height: 500,
          borderRadius: "50%",
          border: "2px solid rgba(16, 185, 129, 0.3)",
          boxShadow: "0 0 40px rgba(16, 185, 129, 0.1) inset",
          zIndex: 14,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 60,
            borderRadius: "50%",
            border: "1px dashed rgba(16, 185, 129, 0.4)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 140,
            borderRadius: "50%",
            border: "1px solid rgba(16, 185, 129, 0.3)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "50%",
            height: 2,
            backgroundColor: "#10b981",
            boxShadow: "0 0 15px #10b981",
            transformOrigin: "0 0",
            transform: `rotate(${radarAngle}deg)`,
          }}
        />
      </div>

      {/* Target Alerts */}
      <div
        style={{
          position: "absolute",
          left: 100,
          bottom: 120,
          width: 560,
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          border: "1px solid rgba(16, 185, 129, 0.5)",
          borderRadius: 16,
          padding: 32,
          zIndex: 20,
          backdropFilter: "blur(12px)",
          color: "#fff",
        }}
      >
        <div style={{ color: "#10b981", fontWeight: "bold", fontSize: 16, fontFamily: "monospace" }}>
          COAST GUARD & NAVAL DEFENSE SENSOR
        </div>
        <h3 style={{ fontSize: 28, fontWeight: 900, margin: "8px 0" }}>
          Dark Vessel Tracking & Sovereignty
        </h3>
        <p style={{ color: "#cbd5e1", fontSize: 16, lineHeight: 1.5, margin: 0 }}>
          Detects non-transponder vessels through heavy monsoons, cloud layers,
          and night-time operations using fused optical and Synthetic Aperture Radar (SAR).
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ── SCENE 5: CALL TO ACTION / MISSION SUMMARY ───────────────────────────────
const Scene5_Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, mass: 0.8 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#030712",
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("images/theme_mission_card.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.65) contrast(1.2)",
        }}
      />
      <ScanlineOverlay />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          zIndex: 15,
          padding: "0 100px",
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            backgroundColor: "rgba(15, 23, 42, 0.85)",
            padding: "50px 80px",
            borderRadius: 32,
            border: "1px solid rgba(56, 189, 248, 0.5)",
            boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.9)",
            backdropFilter: "blur(16px)",
            maxWidth: 1000,
          }}
        >
          <div
            style={{
              color: "#38bdf8",
              fontFamily: "monospace",
              fontSize: 18,
              letterSpacing: 4,
              fontWeight: "bold",
              marginBottom: 16,
            }}
          >
            OUR MISSION
          </div>
          <h1
            style={{
              fontSize: 56,
              fontWeight: 900,
              color: "#f8fafc",
              letterSpacing: "-1px",
              margin: "0 0 20px 0",
              lineHeight: 1.2,
            }}
          >
            From satellite data to a better tomorrow.
          </h1>
          <p
            style={{
              fontSize: 22,
              color: "#cbd5e1",
              lineHeight: 1.6,
              margin: "0 0 32px 0",
            }}
          >
            Built for National Defense, Disaster Rescue & Autonomous Earth Intelligence.
          </p>
          <div
            style={{
              display: "inline-block",
              backgroundColor: "#0284c7",
              color: "#fff",
              fontWeight: "bold",
              fontSize: 18,
              padding: "12px 36px",
              borderRadius: 9999,
              letterSpacing: 1,
            }}
          >
            SATQUERY AI · SIH 2024
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── MAIN COMPOSED VIDEO (30 SECONDS @ 30 FPS = 900 FRAMES) ──────────────────
export const SatQueryMissionVideo: React.FC = () => {
  return (
    <Series>
      {/* 0 - 6s: Intro & Orbital Vision */}
      <Series.Sequence durationInFrames={180}>
        <Scene1_Intro />
      </Series.Sequence>

      {/* 6 - 12s: YOLO-OBB Target Acquisition */}
      <Series.Sequence durationInFrames={180}>
        <Scene2_Detection />
      </Series.Sequence>

      {/* 12 - 18s: Disaster & Flood Delineation */}
      <Series.Sequence durationInFrames={180}>
        <Scene3_Disaster />
      </Series.Sequence>

      {/* 18 - 24s: 24/7 Naval Domain Awareness */}
      <Series.Sequence durationInFrames={180}>
        <Scene4_Navy />
      </Series.Sequence>

      {/* 24 - 30s: Mission & Future Scope Outro */}
      <Series.Sequence durationInFrames={180}>
        <Scene5_Outro />
      </Series.Sequence>
    </Series>
  );
};
