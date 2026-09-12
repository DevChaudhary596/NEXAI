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

// ── COLOR PALETTE: SOLEn BRAND SPEC ──────────────────────────────────────────
const SOLAR_GOLD = "#F4A62A";
const CYAN_GLOW = "#38bdf8";
const EMERALD_LIVE = "#10b981";

// ── Cinematic Scanline & Vignette Overlay ─────────────────────────────────────
const CinematicVignette: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background:
        "radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(3,7,18,0.7) 80%, rgba(3,7,18,0.95) 100%), linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%)",
      backgroundSize: "100% 100%, 100% 4px",
      pointerEvents: "none",
      zIndex: 10,
    }}
  />
);

// ── High-Tech Military / Space Mission Header Bar ────────────────────────────
const SolenHudHeader: React.FC<{ missionCode: string; status: string }> = ({
  missionCode,
  status,
}) => (
  <div
    style={{
      position: "absolute",
      top: 36,
      left: 60,
      right: 60,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontFamily: "monospace",
      fontSize: 15,
      color: "#94a3b8",
      borderBottom: "1px solid rgba(244, 166, 42, 0.25)",
      paddingBottom: 14,
      zIndex: 20,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          backgroundColor: EMERALD_LIVE,
          boxShadow: `0 0 12px ${EMERALD_LIVE}`,
        }}
      />
      <span style={{ fontWeight: 800, letterSpacing: 3, color: "#f8fafc" }}>
        SOLEn // <span style={{ color: SOLAR_GOLD }}>{missionCode}</span>
      </span>
    </div>
    <div style={{ display: "flex", gap: 28 }}>
      <span>SENSOR: SENTINEL-2 MSI + SAR</span>
      <span style={{ color: CYAN_GLOW }}>STATUS: {status}</span>
      <span>LATENCY: 0.18s</span>
    </div>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
// ACT 1: THE SILENT CRISIS (0 - 6s, Frames 0 - 180)
// Narrative: Earth is changing faster than human eyes can monitor.
// ═════════════════════════════════════════════════════════════════════════════
const Act1_SilentCrisis: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = interpolate(frame, [0, 180], [1.0, 1.15], { extrapolateRight: "clamp" });
  const textY = interpolate(frame, [0, 40], [30, 0], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [155, 180], [1, 0], { extrapolateRight: "clamp" });

  const badgeSpring = spring({ frame: frame - 10, fps, config: { damping: 14, stiffness: 100 } });

  return (
    <AbsoluteFill style={{ backgroundColor: "#02040a", opacity: opacity * fadeOut, overflow: "hidden" }}>
      <Img
        src={staticFile("images/satellite_feed_preview.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          filter: "brightness(0.75) contrast(1.18)",
        }}
      />
      <CinematicVignette />
      <SolenHudHeader missionCode="GLOBAL SURVEILLANCE ORBIT" status="ACTIVE TELEMETRY" />

      {/* Main Narrative Card */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 80,
          maxWidth: 960,
          zIndex: 15,
          transform: `translateY(${textY}px)`,
        }}
      >
        <div
          style={{
            transform: `scale(${badgeSpring})`,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            backgroundColor: "rgba(11, 26, 43, 0.85)",
            padding: "8px 20px",
            borderRadius: 9999,
            border: `1px solid ${SOLAR_GOLD}`,
            color: SOLAR_GOLD,
            fontSize: 14,
            fontFamily: "monospace",
            letterSpacing: 3,
            marginBottom: 20,
            backdropFilter: "blur(12px)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: SOLAR_GOLD }} />
          THE OBSERVATION CHALLENGE
        </div>

        <h1
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "-1px",
            lineHeight: 1.1,
            margin: "0 0 16px 0",
            textShadow: "0 4px 24px rgba(0,0,0,0.85)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          Every second, Earth changes.<br />
          <span style={{ color: SOLAR_GOLD }}>Most goes unseen until it's too late.</span>
        </h1>

        <p
          style={{
            fontSize: 22,
            color: "#cbd5e1",
            lineHeight: 1.5,
            margin: 0,
            maxWidth: 820,
            textShadow: "0 2px 10px rgba(0,0,0,0.8)",
          }}
        >
          Flash floods submerging river basins. Dark vessels breaching maritime exclusive economic zones.
          Disaster response trapped waiting 72 hours for raw satellite downloads.
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ACT 2: REAL-TIME TARGET RECONNAISSANCE (6 - 12s, Frames 180 - 360)
// Narrative: SOLEn autonomous YOLOv8-OBB target acquisition at military speed.
// ═════════════════════════════════════════════════════════════════════════════
const Act2_TargetDetection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scanY = interpolate(frame, [0, 180], [0, 1080], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [160, 180], [1, 0], { extrapolateRight: "clamp" });

  const box1 = spring({ frame: frame - 15, fps, config: { damping: 12, stiffness: 120 } });
  const box2 = spring({ frame: frame - 32, fps, config: { damping: 12, stiffness: 120 } });
  const box3 = spring({ frame: frame - 48, fps, config: { damping: 12, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ backgroundColor: "#02040a", opacity: fadeOut, overflow: "hidden" }}>
      <Img
        src={staticFile("images/metric_plane_hd.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.75) contrast(1.2)",
        }}
      />
      <CinematicVignette />
      <SolenHudHeader missionCode="TACTICAL AIRFIELD RECON" status="YOLOv8-OBB DETECTIONS ACTIVE" />

      {/* Laser Scanning Beam */}
      <div
        style={{
          position: "absolute",
          top: scanY,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: SOLAR_GOLD,
          boxShadow: `0 0 24px 6px ${SOLAR_GOLD}`,
          zIndex: 12,
        }}
      />

      {/* Oriented Bounding Boxes (Real Computer Vision Overlay) */}
      {frame >= 15 && (
        <div
          style={{
            position: "absolute",
            left: 460,
            top: 320,
            width: 250,
            height: 200,
            border: `2px solid ${CYAN_GLOW}`,
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            transform: `rotate(-14deg) scale(${box1})`,
            zIndex: 14,
            padding: 8,
          }}
        >
          <div style={{ backgroundColor: "#0369a1", color: "#fff", fontSize: 13, fontFamily: "monospace", padding: "2px 8px", fontWeight: "bold", width: "fit-content" }}>
            STRATEGIC TRANSPORT · 98.6%
          </div>
          <div style={{ color: CYAN_GLOW, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>
            BEARING: 042° · LENGTH: 45.2M
          </div>
        </div>
      )}

      {frame >= 32 && (
        <div
          style={{
            position: "absolute",
            left: 960,
            top: 400,
            width: 270,
            height: 210,
            border: `2px solid ${CYAN_GLOW}`,
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            transform: `rotate(22deg) scale(${box2})`,
            zIndex: 14,
            padding: 8,
          }}
        >
          <div style={{ backgroundColor: "#0369a1", color: "#fff", fontSize: 13, fontFamily: "monospace", padding: "2px 8px", fontWeight: "bold", width: "fit-content" }}>
            SURVEILLANCE ASSET · 97.4%
          </div>
          <div style={{ color: CYAN_GLOW, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>
            WINGSPAN: 58.1M · STATUS: STATIONARY
          </div>
        </div>
      )}

      {frame >= 48 && (
        <div
          style={{
            position: "absolute",
            left: 1360,
            top: 260,
            width: 200,
            height: 150,
            border: `2px solid ${SOLAR_GOLD}`,
            backgroundColor: "rgba(244, 166, 42, 0.15)",
            transform: `rotate(4deg) scale(${box3})`,
            zIndex: 14,
            padding: 8,
          }}
        >
          <div style={{ backgroundColor: "#b45309", color: "#fff", fontSize: 13, fontFamily: "monospace", padding: "2px 8px", fontWeight: "bold", width: "fit-content" }}>
            CRITICAL FUEL DEPOT · 99.2%
          </div>
          <div style={{ color: SOLAR_GOLD, fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>
            CAPACITY: 80,000L · PERIMETER SECURED
          </div>
        </div>
      )}

      {/* Bottom Mission Card */}
      <div
        style={{
          position: "absolute",
          bottom: 50,
          left: 60,
          right: 60,
          backgroundColor: "rgba(11, 26, 43, 0.92)",
          border: `1px solid rgba(244, 166, 42, 0.4)`,
          borderRadius: 20,
          padding: "20px 48px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 20,
          backdropFilter: "blur(16px)",
        }}
      >
        <div>
          <div style={{ color: SOLAR_GOLD, fontSize: 13, fontFamily: "monospace", letterSpacing: 2 }}>AUTONOMOUS CV ENGINE</div>
          <div style={{ color: "#ffffff", fontSize: 32, fontWeight: 900 }}>1,240 TARGETS ACQUIRED</div>
        </div>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 40 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace" }}>DETECTION ACCURACY</div>
          <div style={{ color: EMERALD_LIVE, fontSize: 32, fontWeight: 900 }}>98.4% MEAN CONFIDENCE</div>
        </div>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 40 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace" }}>DECISION SPEED</div>
          <div style={{ color: CYAN_GLOW, fontSize: 32, fontWeight: 900 }}>0.42 SECONDS PER TILE</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ACT 3: DISASTER MANAGEMENT & LIFE-SAVING RESCUE (12 - 18s, Frames 360 - 540)
// Narrative: Flood inundation mapped in seconds, routing NDRF rescue boats.
// ═════════════════════════════════════════════════════════════════════════════
const Act3_DisasterRescue: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [160, 180], [1, 0], { extrapolateRight: "clamp" });
  const pulse = Math.sin(frame / 10) * 0.15 + 0.85;

  return (
    <AbsoluteFill style={{ backgroundColor: "#02040a", opacity: fadeOut, overflow: "hidden" }}>
      <Img
        src={staticFile("images/theme_proj_brahmaputra.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.7) contrast(1.15)",
        }}
      />
      <CinematicVignette />
      <SolenHudHeader missionCode="BRAHMAPUTRA FLOOD RESCUE" status="BI-TEMPORAL NDWI DELINEATION" />

      {/* Simulated Glowing Water Flood Extent Mask */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(ellipse at 42% 60%, rgba(6, 182, 212, ${0.45 * pulse}) 0%, rgba(6, 182, 212, 0) 65%)`,
          zIndex: 12,
        }}
      />

      {/* Left Emergency Response Card */}
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 180,
          width: 540,
          backgroundColor: "rgba(11, 26, 43, 0.9)",
          border: `1px solid rgba(56, 189, 248, 0.4)`,
          borderRadius: 20,
          padding: 32,
          zIndex: 20,
          backdropFilter: "blur(16px)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ padding: "4px 12px", borderRadius: 9999, backgroundColor: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", color: "#f87171", fontSize: 12, fontWeight: "bold" }}>
            CRITICAL EMERGENCY ACTIVE
          </span>
          <span style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace" }}>
            NDRF DISASTER CELL
          </span>
        </div>

        <h2 style={{ fontSize: 32, color: "#f8fafc", margin: "0 0 14px 0", fontWeight: 800 }}>
          312 km² Inundation Delineated
        </h2>

        <p style={{ color: "#cbd5e1", fontSize: 16, lineHeight: 1.6, margin: "0 0 20px 0" }}>
          Automated NDWI multispectral water thresholding isolates submerged embankments from dry terrain,
          generating instant evacuation route vectors for first responders.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ backgroundColor: "rgba(15, 23, 42, 0.6)", padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}>SUBMERGED RESIDENCES</div>
            <div style={{ color: "#f87171", fontSize: 24, fontWeight: 900 }}>14,200+ IDENTIFIED</div>
          </div>
          <div style={{ backgroundColor: "rgba(15, 23, 42, 0.6)", padding: "14px 18px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}>EXTRACTION CORRIDORS</div>
            <div style={{ color: EMERALD_LIVE, fontSize: 24, fontWeight: 900 }}>8 ROUTES SECURED</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ACT 4: 24/7 NAVAL DOMAIN AWARENESS (18 - 24s, Frames 540 - 720)
// Narrative: Coastal radar sweep, dark vessel tracking, maritime defense.
// ═════════════════════════════════════════════════════════════════════════════
const Act4_NavalDefense: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [160, 180], [1, 0], { extrapolateRight: "clamp" });
  const radarAngle = (frame * 5) % 360;

  return (
    <AbsoluteFill style={{ backgroundColor: "#02040a", opacity: fadeOut, overflow: "hidden" }}>
      <Img
        src={staticFile("images/mumbai_port_hd.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.7) contrast(1.2)",
        }}
      />
      <CinematicVignette />
      <SolenHudHeader missionCode="MARITIME DOMAIN AWARENESS" status="RADAR SWEEP ONLINE" />

      {/* Rotating High-Tech Naval Radar Sweep */}
      <div
        style={{
          position: "absolute",
          right: 120,
          top: 180,
          width: 380,
          height: 380,
          borderRadius: "50%",
          border: `2px solid rgba(34, 211, 238, 0.3)`,
          boxShadow: `inset 0 0 40px rgba(34, 211, 238, 0.1)`,
          zIndex: 14,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `conic-gradient(from ${radarAngle}deg, rgba(34, 211, 238, 0.6) 0deg, rgba(34, 211, 238, 0) 60deg)`,
          }}
        />
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 6, height: 6, borderRadius: "50%", backgroundColor: "#38bdf8" }} />
      </div>

      {/* Naval Target Alert Callout */}
      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 90,
          width: 580,
          backgroundColor: "rgba(11, 26, 43, 0.92)",
          border: `1px solid ${SOLAR_GOLD}`,
          borderRadius: 20,
          padding: "28px 36px",
          zIndex: 20,
          backdropFilter: "blur(16px)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: SOLAR_GOLD, fontWeight: 800, fontSize: 14, letterSpacing: 2, fontFamily: "monospace" }}>
            24/7 SOVEREIGN MARITIME DEFENSE
          </span>
          <span style={{ color: EMERALD_LIVE, fontSize: 13, fontFamily: "monospace", fontWeight: "bold" }}>
            RADAR + AIS SYNCHRONIZED
          </span>
        </div>

        <h3 style={{ fontSize: 30, color: "#ffffff", fontWeight: 800, margin: "0 0 10px 0" }}>
          Dark Vessel Incursion Intercepted
        </h3>

        <p style={{ color: "#cbd5e1", fontSize: 16, lineHeight: 1.5, margin: 0 }}>
          Synthetic Aperture Radar (SAR) delineates unflagged vessels attempting silent passage through coastal corridors,
          instantly cueing Coast Guard and Naval interceptors.
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// ACT 5: SOLEn BRAND OUTRO & MISSION STATEMENT (24 - 30s, Frames 720 - 900)
// Narrative: SOLEn official logo reveal and mission closing.
// ═════════════════════════════════════════════════════════════════════════════
const Act5_SolenOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: frame - 10, fps, config: { damping: 14, mass: 0.8 } });
  const textOpacity = interpolate(frame, [25, 45], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#060e18",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      {/* Background Deep Space Starfield with Earth curvature */}
      <Img
        src={staticFile("images/satellite_feed_preview.jpg")}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.35) contrast(1.25)",
        }}
      />
      <CinematicVignette />

      {/* Main Glass Outro Hero Box */}
      <div
        style={{
          transform: `scale(${logoScale})`,
          backgroundColor: "rgba(11, 26, 43, 0.88)",
          padding: "54px 90px",
          borderRadius: 36,
          border: `1px solid ${SOLAR_GOLD}`,
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.95)",
          backdropFilter: "blur(24px)",
          maxWidth: 960,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Official SOLEn Logo */}
        <Img
          src={staticFile("images/SOLEN_Option_3_Primary_Dark.png")}
          style={{
            height: 110,
            width: "auto",
            marginBottom: 24,
            filter: "drop-shadow(0 0 30px rgba(244, 166, 42, 0.45))",
          }}
        />

        <div style={{ opacity: textOpacity }}>
          <h2
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: "-1px",
              margin: "0 0 16px 0",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            From satellite data to a better tomorrow.
          </h2>

          <p
            style={{
              fontSize: 22,
              color: "#94a3b8",
              lineHeight: 1.6,
              maxWidth: 760,
              margin: "0 0 32px 0",
            }}
          >
            Autonomous Earth Observation & Geospatial Intelligence for National Security,
            Disaster Resilience, and Environmental Sovereignty.
          </p>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              backgroundColor: SOLAR_GOLD,
              color: "#0b1a2b",
              fontWeight: 800,
              fontSize: 18,
              padding: "14px 38px",
              borderRadius: 9999,
              letterSpacing: 1.5,
              boxShadow: `0 8px 30px rgba(244, 166, 42, 0.5)`,
            }}
          >
            <span>SOLEn // EARTH INTELLIGENCE PLATFORM</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSED REALISTIC STORY VIDEO (30s @ 30fps = 900 Frames)
// ═════════════════════════════════════════════════════════════════════════════
export const SolenStoryVideo: React.FC = () => {
  return (
    <Series>
      {/* 0 - 6s: The Observation Problem & Silent Crisis */}
      <Series.Sequence durationInFrames={180}>
        <Act1_SilentCrisis />
      </Series.Sequence>

      {/* 6 - 12s: Tactical Target Acquisition (YOLOv8-OBB) */}
      <Series.Sequence durationInFrames={180}>
        <Act2_TargetDetection />
      </Series.Sequence>

      {/* 12 - 18s: Disaster Relief & Flood Embankment Rescue */}
      <Series.Sequence durationInFrames={180}>
        <Act3_DisasterRescue />
      </Series.Sequence>

      {/* 18 - 24s: 24/7 Naval Domain Radar & Dark Vessel Defense */}
      <Series.Sequence durationInFrames={180}>
        <Act4_NavalDefense />
      </Series.Sequence>

      {/* 24 - 30s: Official SOLEn Brand Outro */}
      <Series.Sequence durationInFrames={180}>
        <Act5_SolenOutro />
      </Series.Sequence>
    </Series>
  );
};
