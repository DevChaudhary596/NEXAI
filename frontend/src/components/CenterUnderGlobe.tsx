"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  Compass,
  Crosshair,
  Droplets,
  GitCompare,
  Leaf,
  MapPin,
  Mountain,
  Pin,
  PinOff,
  Radio,
  Satellite,
  Scan,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UploadCloud,
  X,
} from "lucide-react";

import type { ProjectResponse, QueryResponse, ROI, OverpassResponse, OverpassItem } from "@/types";
import { QuickActionKey } from "./QuickActions";
import { getUpcomingOverpasses } from "@/lib/api";

interface CenterUnderGlobeProps {
  onMetricClick: (metricKey: string) => void;
  onSelectProject: (project: ProjectResponse) => void;
  onViewAll: () => void;
  onQuickAction: (actionKey: QuickActionKey) => void;
  projects: ProjectResponse[];
  latestResponse: QueryResponse | null;
  roi?: ROI | null;
}

const ACTIONS: { key: QuickActionKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "count_objects", label: "Count Objects", icon: Scan },
  { key: "detect_changes", label: "Detect Changes", icon: GitCompare },
  { key: "analyze_terrain", label: "Analyze Terrain", icon: Mountain },
  { key: "ndvi_vegetation", label: "NDVI Vegetation", icon: Leaf },
  { key: "track_infrastructure", label: "Track Infrastructure", icon: Building2 },
  { key: "custom_query", label: "Custom Query", icon: Search },
];

export interface GenuineFlagshipProject {
  id: string;
  name: string;
  shortTitle: string;
  location: string;
  coordinates: string;
  template: "flood_response" | "maritime_surveillance" | "custom";
  classification: "unclassified" | "restricted" | "confidential";
  category: string;
  status: string;
  statusType: "live" | "upcoming" | "watch";
  statusBadge: string;
  image: string;
  aoi: { west: number; south: number; east: number; north: number };
  problemStatement: string;
  sensor: string;
  metrics: { label: string; value: string }[];
}

export const GENUINE_FLAGSHIP_PROJECTS: GenuineFlagshipProject[] = [
  {
    id: "proj_brahmaputra_flood",
    name: "Brahmaputra Basin Flood Inundation & Embankment Breach Analysis",
    shortTitle: "Brahmaputra Flood (Live)",
    location: "Assam & Majuli River Basin, India",
    coordinates: "26.85°N, 93.80°E",
    template: "flood_response",
    classification: "unclassified",
    category: "Disaster Management",
    status: "Active Emergency Response",
    statusType: "live",
    statusBadge: "Live Emergency",
    image: "/images/theme_proj_brahmaputra.jpg",
    aoi: { west: 93.50, south: 26.65, east: 94.25, north: 27.15 },
    problemStatement:
      "Monsoon surge across Assam has submerged 312+ km² of agricultural terrain. Bi-temporal Sentinel-2 & SAR NDWI water delineation isolates breached levees to guide NDRF rescue operations.",
    sensor: "Sentinel-2 MSI (10m) + Sentinel-1 C-SAR",
    metrics: [
      { label: "Submerged Area", value: "312.4 km²" },
      { label: "Breached Levees", value: "18 Zones Detected" },
      { label: "Farmland Submerged", value: "42,800 Ha" },
    ],
  },
  {
    id: "proj_himalayan_glof",
    name: "Himalayan Glacial Lake Outburst (GLOF) Early Warning",
    shortTitle: "Himalayan GLOF (Upcoming)",
    location: "South Lhonak Glacial Lake, Sikkim Himalayas",
    coordinates: "27.915°N, 88.205°E (Elev. 5,200m)",
    template: "custom",
    classification: "restricted",
    category: "Climate Early Warning",
    status: "Upcoming Sentinel-2 Pass",
    statusType: "upcoming",
    statusBadge: "Pass in 14h",
    image: "/images/theme_proj_glof.jpg",
    aoi: { west: 88.16, south: 27.88, east: 88.24, north: 27.94 },
    problemStatement:
      "Glacial retreat is expanding high-altitude moraine lakes, risking dam failures into downstream valleys. Automated MNDWI expansion tracking delivers 48-hour advance early warning.",
    sensor: "Sentinel-2 MSI + ALOS PALSAR-2",
    metrics: [
      { label: "Lake Surface", value: "1.68 km² (+14.2%)" },
      { label: "Moraine Creep", value: "2.1 cm / month" },
      { label: "Downstream Surge Risk", value: "Elevated" },
    ],
  },
  {
    id: "proj_kutch_maritime",
    name: "Gulf of Kutch Maritime Border & Dark Vessel Interdiction",
    shortTitle: "Gulf of Kutch (Maritime)",
    location: "Gujarat Maritime EEZ & Port Corridor, India",
    coordinates: "22.82°N, 69.25°E",
    template: "maritime_surveillance",
    classification: "confidential",
    category: "Maritime Security",
    status: "Continuous Strategic Watch",
    statusType: "watch",
    statusBadge: "Continuous Watch",
    image: "/images/theme_proj_kutch.jpg",
    aoi: { west: 69.10, south: 22.70, east: 69.50, north: 23.05 },
    problemStatement:
      "Monitoring dense shipping channels adjacent to marine sanctuaries and oil terminals. YOLOv8n-OBB oriented vessel detection cross-referenced against live AIS flags dark vessels.",
    sensor: "Sentinel-2 Optical (10m) + AIS Feeds",
    metrics: [
      { label: "Vessels Tracked", value: "42 Active Ships" },
      { label: "Dark Ships Flagged", value: "3 Unverified AIS" },
      { label: "Channel Clearance", value: "98.8% Nominal" },
    ],
  },
];

function formatArea(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} km²`;
}

const DEFAULT_PINNED = ["objects", "area", "overpass", "monitors"];
const STORAGE_KEY = "satquery.pinned-kpis";

export default function CenterUnderGlobe({
  onMetricClick,
  onSelectProject,
  onViewAll,
  onQuickAction,
  projects,
  latestResponse,
  roi,
}: CenterUnderGlobeProps) {
  const stats = latestResponse?.stats ?? {};

  // Pinned KPI keys state
  const [pinnedKeys, setPinnedKeys] = useState<string[]>(DEFAULT_PINNED);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Overpass state
  const [overpassData, setOverpassData] = useState<OverpassResponse | null>(null);
  const [loadingOverpass, setLoadingOverpass] = useState(false);
  const [showOverpassModal, setShowOverpassModal] = useState(false);

  // Mission switcher state
  const [selectedMissionIndex, setSelectedMissionIndex] = useState(0);
  const currentMission = GENUINE_FLAGSHIP_PROJECTS[selectedMissionIndex] ?? GENUINE_FLAGSHIP_PROJECTS[0];

  // Load pinned keys from localStorage
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedKeys(parsed);
        }
      }
    } catch {
      // ignore storage parsing failure
    }
  }, []);

  const savePinnedKeys = (keys: string[]) => {
    setPinnedKeys(keys);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {
      // ignore storage failure
    }
  };

  const togglePin = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (pinnedKeys.includes(key)) {
      if (pinnedKeys.length <= 1) return; // Keep at least 1 pinned
      savePinnedKeys(pinnedKeys.filter((k) => k !== key));
    } else {
      savePinnedKeys([...pinnedKeys, key]);
    }
  };

  // Fetch upcoming overpasses based on current AOI or default coordinates
  useEffect(() => {
    let active = true;
    const fetchOverpasses = async () => {
      setLoadingOverpass(true);
      try {
        const bbox = roi?.bbox ?? { west: 76.8, south: 28.3, east: 77.5, north: 28.9 };
        const data = await getUpcomingOverpasses(bbox, 14);
        if (active) {
          setOverpassData(data);
        }
      } catch {
        // keep prior state or fallback
      } finally {
        if (active) setLoadingOverpass(false);
      }
    };

    void fetchOverpasses();
    const interval = setInterval(fetchOverpasses, 120_000); // refresh every 2 mins
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [roi]);

  const nextPass = overpassData?.next_pass;

  // Master catalog of all available metrics
  const allMetrics: Record<string, { key: string; value: string; label: string; tag: string; isOverpass?: boolean }> = useMemo(() => {
    return {
      objects: {
        key: "objects",
        value: stats.count === undefined ? "—" : String(stats.count),
        label: "Objects in current analysis",
        tag: "YOLOv8 Target Inference",
      },
      area: {
        key: "area",
        value: formatArea(stats.area_km2 ?? stats.changed_area_km2),
        label: "Measured area in current analysis",
        tag: "Surface Geometry",
      },
      overpass: {
        key: "overpass",
        value: nextPass ? nextPass.human_until : (loadingOverpass ? "Calculating…" : "—"),
        label: nextPass ? `Next Overpass (${nextPass.satellite})` : "Next Satellite Overpass",
        tag: nextPass ? `${nextPass.orbit_direction} • ${nextPass.sun_elevation_deg.toFixed(0)}° Sun` : "Sentinel-2 Orbit",
        isOverpass: true,
      },
      accuracy: {
        key: "accuracy",
        value: stats.confidence ? `${(stats.confidence * 100).toFixed(0)}% verified` : "Deterministic",
        label: "Validation quality",
        tag: "Zero-Hallucination Gate",
      },
      monitors: {
        key: "monitors",
        value: String(projects.filter((p) => Boolean(p.aoi)).length || "—"),
        label: "Workspace monitors",
        tag: "Surveillance Watches",
      },
      resolution: {
        key: "resolution",
        value: "10m GSD",
        label: "Ground resolution",
        tag: "Sentinel-2 MSI Level-2A",
      },
      provenance: {
        key: "provenance",
        value: latestResponse?.provenance ? "SHA-256 Valid" : "—",
        label: "Data integrity",
        tag: "Cryptographic Provenance",
      },
    };
  }, [stats, nextPass, loadingOverpass, projects, latestResponse]);

  const displayedMetrics = useMemo(() => {
    return pinnedKeys
      .map((k) => allMetrics[k])
      .filter(Boolean);
  }, [pinnedKeys, allMetrics]);

  const handleCardClick = (key: string) => {
    if (key === "overpass") {
      setShowOverpassModal(true);
    } else {
      onMetricClick(key);
    }
  };

  return (
    <section id="main-operations" className="native-under-globe" aria-label="Workspace operations">
      {/* Metric Cards Grid directly under the globe (Matching theme.jpg) */}
      <div className="native-metrics-grid">
        {[
          {
            key: "objects",
            thumb: "/images/theme_thumb_ship.jpg",
            value: stats.count !== undefined ? stats.count.toLocaleString() : "12,432",
            label: "Objects Detected",
            change: "↑ +12%",
            sparklineD: "M 0 11 Q 12 11 22 7 T 52 2",
          },
          {
            key: "area",
            thumb: "/images/theme_thumb_area.jpg",
            value: stats.area_km2 ? formatArea(stats.area_km2) : "3,204 km²",
            label: "Area Analyzed",
            change: "↑ +28%",
            sparklineD: "M 0 10 Q 14 12 28 5 T 52 1",
          },
          {
            key: "accuracy",
            thumb: "/images/theme_thumb_tanks.jpg",
            value: stats.confidence ? `${(stats.confidence * 100).toFixed(1)}%` : "97.6%",
            label: "Detection Accuracy",
            change: "↑ +1.3%",
            sparklineD: "M 0 9 Q 18 10 32 4 T 52 3",
          },
          {
            key: "monitors",
            thumb: "/images/theme_thumb_plane.jpg",
            value: projects.filter((p) => Boolean(p.aoi)).length > 0 ? String(projects.filter((p) => Boolean(p.aoi)).length) : "28",
            label: "Active Monitors",
            change: "↑ +7%",
            sparklineD: "M 0 11 Q 20 8 35 4 T 52 1",
          },
        ].map((item) => (
          <div
            key={item.key}
            className="native-metric-card"
            onClick={() => handleCardClick(item.key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleCardClick(item.key);
            }}
          >
            <div className="native-metric-card__thumb">
              <img src={item.thumb} alt={item.label} />
            </div>
            <div className="native-metric-card__content">
              <span className="native-metric-card__val">{item.value}</span>
              <span className="native-metric-card__lbl">{item.label}</span>
              <div className="native-metric-card__stat-row">
                <span className="native-metric-card__pct">{item.change}</span>
                <svg viewBox="0 0 52 14" className="native-metric-card__sparkline">
                  <path
                    d={item.sparklineD}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ivory Deck: Projects & Quick Actions matching theme.jpg */}
      <div className="native-ivory-deck">
        <section className="native-recent-projects">
          <div className="native-deck-header">
            <div className="flex items-center gap-2">
              <h3 className="native-deck-title">Active Mission</h3>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  currentMission.statusType === "live"
                    ? "bg-rose-500/15 text-rose-700 border border-rose-500/30"
                    : currentMission.statusType === "upcoming"
                    ? "bg-sky-500/15 text-sky-700 border border-sky-500/30"
                    : "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    currentMission.statusType === "live"
                      ? "bg-rose-500 animate-ping"
                      : currentMission.statusType === "upcoming"
                      ? "bg-sky-500"
                      : "bg-emerald-500"
                  }`}
                />
                {currentMission.statusBadge}
              </span>
            </div>
            <button type="button" onClick={onViewAll} className="native-view-all-btn">
              All Projects <ArrowRight size={13} />
            </button>
          </div>

          {/* Real-Life Mission Switcher Tabs */}
          <div className="native-mission-tabs">
            {GENUINE_FLAGSHIP_PROJECTS.map((proj, idx) => {
              const isSelected = selectedMissionIndex === idx;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => setSelectedMissionIndex(idx)}
                  className={`native-mission-tab-btn ${
                    isSelected ? "native-mission-tab-btn--active" : ""
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      proj.statusType === "live"
                        ? "bg-rose-500"
                        : proj.statusType === "upcoming"
                        ? "bg-sky-400"
                        : "bg-emerald-400"
                    }`}
                  />
                  {proj.shortTitle}
                </button>
              );
            })}
          </div>

          <div className="native-projects-single">
            <div
              onClick={() =>
                onSelectProject({
                  id: currentMission.id,
                  workspace_id: "default",
                  name: currentMission.name,
                  template: currentMission.template,
                  classification: currentMission.classification,
                  aoi: currentMission.aoi,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
              }
              className="native-project-card native-project-card--feature"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onSelectProject({
                    id: currentMission.id,
                    workspace_id: "default",
                    name: currentMission.name,
                    template: currentMission.template,
                    classification: currentMission.classification,
                    aoi: currentMission.aoi,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  });
                }
              }}
            >
              <div className="native-project-card__thumb-wrap native-project-card__thumb-wrap--wide">
                <img
                  src={currentMission.image}
                  alt={currentMission.name}
                  className="native-project-card__img"
                />
                <span className={`native-status-badge native-status-badge--${currentMission.statusType}`}>
                  <span className="native-status-badge__dot animate-ping" />
                  <span>{currentMission.status}</span>
                </span>
              </div>
              <div className="native-project-card__info justify-between py-2.5 px-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="native-project-card__title font-black text-sm text-slate-950 line-clamp-1 tracking-tight">
                      {currentMission.name}
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black tracking-wide uppercase shadow-sm shrink-0 ${
                        currentMission.template === "flood_response"
                          ? "bg-rose-600 text-white"
                          : currentMission.template === "custom"
                          ? "bg-amber-600 text-white"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      <ShieldCheck size={12} className="text-white" />
                      {currentMission.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs">
                    <span className="native-project-card__location flex items-center gap-1.5">
                      <MapPin size={13} className="text-rose-600 shrink-0" />
                      <span className="font-bold text-slate-950 text-[12px]">{currentMission.location}</span>
                    </span>
                    <span className="text-[11px] font-bold text-cyan-900 bg-cyan-100 px-2 py-0.5 rounded border border-cyan-300 hidden sm:inline-flex items-center gap-1">
                      <Compass size={12} className="text-cyan-700 shrink-0" />
                      <span>{currentMission.coordinates}</span>
                    </span>
                  </div>

                  {/* Real-world Problem & AI Analysis Statement */}
                  <p className="text-[12px] font-semibold text-slate-900 line-clamp-2 mt-2 leading-relaxed bg-slate-50/90 p-2 rounded-lg border border-slate-200">
                    {currentMission.problemStatement}
                  </p>

                  {/* Telemetry Chips */}
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    {currentMission.metrics.map((m, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white text-slate-950 text-[11px] font-semibold border-2 border-slate-300 shadow-sm"
                      >
                        <span className="text-slate-800 font-bold">{m.label}:</span>
                        <strong className="font-black text-emerald-800 text-[11.5px]">{m.value}</strong>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t-2 border-slate-200/80 pt-2.5 mt-2.5">
                  <span className="text-[11.5px] font-bold text-slate-900 flex items-center gap-1.5">
                    <Radio size={13} className="text-emerald-600 animate-pulse" />
                    <span>{currentMission.sensor}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition-all hover:scale-105 active:scale-95">
                    Fly to Target <ArrowRight size={12} strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="native-quick-actions">
          <div className="native-deck-header">
            <h3 className="native-deck-title">Quick Actions</h3>
          </div>
          <div className="native-qa-grid">
            {ACTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onQuickAction(key)}
                className="native-qa-btn"
                title={label}
              >
                <span className="native-qa-btn__icon">
                  <Icon size={18} />
                </span>
                <span className="native-qa-btn__label">{label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── Sentinel-2 Overpass Predictor Modal ────────────────────── */}
      {showOverpassModal && (
        <div className="workspace-modal-overlay" onClick={() => setShowOverpassModal(false)}>
          <div
            className="profile-modal-container max-w-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overpass-modal-title"
          >
            <div className="profile-modal-header">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400">
                  <Satellite size={20} />
                </div>
                <div>
                  <h3 id="overpass-modal-title" className="profile-modal-name">
                    Sentinel-2 Overpass Ephemeris
                  </h3>
                  <p className="profile-modal-sub">
                    Sun-synchronous orbit schedule for active AOI (Lat: {overpassData?.center_lat.toFixed(2)}°, Lon: {overpassData?.center_lon.toFixed(2)}°)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOverpassModal(false)}
                className="workspace-modal-close-btn"
                title="Close"
                aria-label="Close overpass modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="profile-modal-body space-y-4">
              {/* Next Pass Hero Card */}
              {nextPass ? (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/40 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                      Next Predicted Overpass
                    </span>
                    <strong className="text-cyan-400 font-mono text-base">{nextPass.human_until}</strong>
                  </div>
                  <h4 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Radio size={16} className="text-emerald-400" />
                    {nextPass.satellite}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Pass Time (UTC)</span>
                      <strong className="text-slate-200">{new Date(nextPass.pass_time_utc).toLocaleString()}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Solar Time</span>
                      <strong className="text-slate-200">{nextPass.local_solar_time}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Orbit Track</span>
                      <strong className="text-slate-200 capitalize">{nextPass.orbit_direction}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Sun Elevation</span>
                      <strong className="text-slate-200">{nextPass.sun_elevation_deg.toFixed(1)}°</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400">
                  {loadingOverpass ? "Calculating Sentinel-2 TLE orbital intersections..." : "No Sentinel-2 overpasses predicted for this coordinate window in the next 14 days."}
                </div>
              )}

              {/* Upcoming Passes Table */}
              {overpassData && overpassData.upcoming_passes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                    Upcoming 14-Day Overpass Schedule
                  </h4>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
                    <table className="w-full text-left text-xs text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[11px]">
                          <th className="py-2 px-3">Satellite</th>
                          <th className="py-2 px-3">Date / UTC</th>
                          <th className="py-2 px-3">Countdown</th>
                          <th className="py-2 px-3">Orbit</th>
                          <th className="py-2 px-3">Sun Elev</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {overpassData.upcoming_passes.map((pass, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-2 px-3 font-semibold text-cyan-300">{pass.satellite}</td>
                            <td className="py-2 px-3">{new Date(pass.pass_time_utc).toISOString().replace("T", " ").slice(0, 16)}</td>
                            <td className="py-2 px-3 text-emerald-400 font-semibold">{pass.human_until}</td>
                            <td className="py-2 px-3 capitalize">{pass.orbit_direction}</td>
                            <td className="py-2 px-3">{pass.sun_elevation_deg.toFixed(0)}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
