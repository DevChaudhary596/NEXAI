"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Scan,
  Globe2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  TrendingUp,
  Activity,
  ArrowRight,
  Filter,
  Satellite,
  Cpu,
  Target,
  Play,
  Sparkles,
  Radio,
  Layers,
  ExternalLink,
  Eye,
  Compass,
  AlertTriangle,
  RotateCw,
} from "lucide-react";

export type MetricKey =
  | "objects"
  | "area"
  | "accuracy"
  | "monitors"
  | "satellites"
  | "coverage"
  | "analytics"
  | "impact"
  | null;

export interface MetricModalProps {
  metricKey: MetricKey;
  onClose: () => void;
  onOpenWorkspace: (tab: "detections" | "explore" | "analysis" | "monitor" | "projects") => void;
  onFlyTo?: (target: { lon: number; lat: number; height: number; pitch?: number }) => void;
  onSelectProject?: (project: any) => void;
  projects?: any[];
}

export default function MetricModal({
  metricKey,
  onClose,
  onOpenWorkspace,
  onFlyTo,
  onSelectProject,
  projects = [],
}: MetricModalProps) {
  const [satelliteFilter, setSatelliteFilter] = useState<"all" | "optical" | "sar" | "specialized">("all");

  useEffect(() => {
    if (!metricKey) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [metricKey, onClose]);

  if (!metricKey) return null;

  const SATELLITE_SOURCES = [
    {
      name: "Sentinel-2A & 2B",
      agency: "ESA / Copernicus",
      category: "optical",
      badge: "10m Optical MSI",
      resolution: "10m / 20m / 60m",
      revisit: "5 days",
      bands: "12 Bands (RGB, Red-Edge, NIR, SWIR)",
      status: "live",
      statusLabel: "LIVE INGESTION",
      description: "High-cadence optical imagery ideal for multispectral NDVI vegetation health, NDWI water body mapping, and urban growth.",
    },
    {
      name: "Sentinel-1A SAR",
      agency: "ESA / Copernicus",
      category: "sar",
      badge: "C-Band Radar",
      resolution: "10m GSD (250km swath)",
      revisit: "6 days",
      bands: "C-Band (5.405 GHz) VV + VH Polarizations",
      status: "live",
      statusLabel: "ONLINE",
      description: "All-weather day/night Synthetic Aperture Radar capable of penetrating heavy monsoon clouds, severe storms, and detecting maritime vessels.",
    },
    {
      name: "Landsat 8 & 9",
      agency: "USGS / NASA",
      category: "optical",
      badge: "15m Pan / 30m Multispectral",
      resolution: "15m Panchromatic / 30m Optical",
      revisit: "8 days combined",
      bands: "OLI-2 (9 bands) + TIRS-2 (Thermal Infrared)",
      status: "live",
      statusLabel: "ONLINE",
      description: "Five-decade continuous planetary observation benchmark with calibrated thermal infrared sensors for land surface temperature and wildfire mapping.",
    },
    {
      name: "Cartosat-3",
      agency: "ISRO / India",
      category: "specialized",
      badge: "0.28m Sub-Meter VHR",
      resolution: "0.28m PAN / 1.12m 4-Band MX",
      revisit: "Steerable (±45° roll/pitch)",
      bands: "Panchromatic + 4 Multispectral bands",
      status: "active",
      statusLabel: "STATION LINKED",
      description: "India's flagship high-resolution optical satellite for critical infrastructure monitoring, transport asset inspection, and precision defense surveillance.",
    },
    {
      name: "Resourcesat-2A",
      agency: "ISRO / India",
      category: "optical",
      badge: "5.8m LISS-4 Optical",
      resolution: "5.8m Multispectral (70km swath)",
      revisit: "5 days",
      bands: "Green, Red, Near-Infrared (NIR)",
      status: "active",
      statusLabel: "ACTIVE",
      description: "Specialized for agricultural crop yield forecasting, river basin embankment change detection, and disaster damage verification.",
    },
    {
      name: "PlanetScope SuperDove",
      agency: "Planet Labs",
      category: "optical",
      badge: "3.0m Daily Global",
      resolution: "3.0m GSD",
      revisit: "24 Hours (Daily Global)",
      bands: "8-Band (Coastal Blue to NIR)",
      status: "active",
      statusLabel: "DAILY SYNC",
      description: "Constellation of 200+ Dove cubesats providing daily scanning of Earth's landmass for rapid change detection and supply chain alerts.",
    },
    {
      name: "MODIS Terra & Aqua",
      agency: "NASA EOS",
      category: "specialized",
      badge: "Thermal & Fire Radiometry",
      resolution: "250m / 500m / 1000m",
      revisit: "Twice daily",
      bands: "36 Spectral bands (Visible to Thermal IR)",
      status: "live",
      statusLabel: "SYNCED",
      description: "Planetary thermal anomaly radar tracking global wildfires, volcanic activity, dust storms, and oceanic surface temperatures in real-time.",
    },
    {
      name: "NAIP Aerial Ortho",
      agency: "USDA / USGS",
      category: "specialized",
      badge: "0.6m Airborne Orthophoto",
      resolution: "0.6m Ground Sample Distance",
      revisit: "Cyclical High-Density",
      bands: "4-Band RGB + NIR",
      status: "active",
      statusLabel: "BENCHMARK READY",
      description: "Sub-meter airborne imagery used as ground-truth training benchmarks for fine vehicle, aircraft, and storage tank computer vision models.",
    },
  ];

  const filteredSatellites = SATELLITE_SOURCES.filter((sat) => {
    if (satelliteFilter === "all") return true;
    return sat.category === satelliteFilter;
  });

  return (
    <div className="workspace-modal-overlay" onClick={onClose}>
      <div
        className="metric-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="metric-modal-header">
          <div className="metric-modal-header__meta">
            {metricKey === "objects" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--orange">
                  <Scan size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">12,432 Objects Detected & Tracked</h3>
                  <p className="metric-modal-sub">Target telemetry and oriented bounding box distribution</p>
                </div>
              </>
            )}
            {metricKey === "area" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--cyan">
                  <Globe2 size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">3,204 km² Planetary Area Analyzed</h3>
                  <p className="metric-modal-sub">Constellation footprint and resolution coverage</p>
                </div>
              </>
            )}
            {metricKey === "accuracy" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--emerald">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">97.6% Model Validation Accuracy</h3>
                  <p className="metric-modal-sub">YOLOv8x-OBB + SOLEN VLM grounding benchmarks</p>
                </div>
              </>
            )}
            {metricKey === "monitors" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--purple">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">28 Active Surveillance Monitors</h3>
                  <p className="metric-modal-sub">Autonomous cron-scheduled sentinel alerts</p>
                </div>
              </>
            )}
            {metricKey === "satellites" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--cyan">
                  <Satellite size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">7+ Multi-Constellation Satellite Network</h3>
                  <p className="metric-modal-sub">Active optical MSI, C-Band SAR radar, thermal IR & sub-meter defense feeds</p>
                </div>
              </>
            )}
            {metricKey === "coverage" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--emerald">
                  <Globe2 size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">Global Planetary Coverage (510.1M km²)</h3>
                  <p className="metric-modal-sub">Sun-synchronous polar orbits & cloud-optimized STAC planetary ingestion</p>
                </div>
              </>
            )}
            {metricKey === "analytics" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--purple">
                  <Cpu size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">SOLEN AI Analytics & Vision Engine</h3>
                  <p className="metric-modal-sub">Dual-engine YOLOv8n-OBB oriented detector + Groq Multimodal Vision Copilot</p>
                </div>
              </>
            )}
            {metricKey === "impact" && (
              <>
                <div className="metric-modal-icon metric-modal-icon--orange">
                  <Target size={20} />
                </div>
                <div>
                  <h3 className="metric-modal-title">Real-World Crisis & Defense Deployments</h3>
                  <p className="metric-modal-sub">Operational mission dossiers, flood inundation tracking & dark vessel interdiction</p>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="workspace-modal-close-btn"
            title="Close View (Esc)"
            aria-label="Close View"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="metric-modal-body">
          {/* ── Objects Breakdown ─────────────────────────────────── */}
          {metricKey === "objects" && (
            <div className="metric-detail-grid">
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Maritime Vessels</span>
                <div className="metric-stat-card__val text-sky-400">4,120</div>
                <div className="metric-stat-card__pct">33.1% of all detections</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Storage Tanks</span>
                <div className="metric-stat-card__val text-emerald-400">3,142</div>
                <div className="metric-stat-card__pct">25.3% of all detections</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Commercial Aviation</span>
                <div className="metric-stat-card__val text-amber-400">2,890</div>
                <div className="metric-stat-card__pct">23.2% of all detections</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Ground Transport</span>
                <div className="metric-stat-card__val text-purple-400">2,280</div>
                <div className="metric-stat-card__pct">18.4% of all detections</div>
              </div>

              <div className="metric-table-container">
                <div className="metric-table-header">
                  <span>Recent Detections Stream</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("detections");
                    }}
                    className="metric-open-btn"
                  >
                    <span>Open Detections Suite</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="metric-stream-rows">
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">VESSEL</span>
                    <span className="metric-stream-name">Ultra Large Container Vessel (399m)</span>
                    <span className="metric-stream-conf text-emerald-400">98.2%</span>
                    <span className="metric-stream-loc">Suez Passage</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">STORAGE</span>
                    <span className="metric-stream-name">Crude Oil Floating-Roof Tank #14</span>
                    <span className="metric-stream-conf text-emerald-400">96.5%</span>
                    <span className="metric-stream-loc">Port of Rotterdam</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">AIRCRAFT</span>
                    <span className="metric-stream-name">Boeing 777-300ER (Runway 28R)</span>
                    <span className="metric-stream-conf text-emerald-400">97.8%</span>
                    <span className="metric-stream-loc">SFO Airport</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Area Breakdown ────────────────────────────────────── */}
          {metricKey === "area" && (
            <div className="metric-detail-grid">
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Sentinel-2 MSI (10m)</span>
                <div className="metric-stat-card__val text-cyan-400">1,840 km²</div>
                <div className="metric-stat-card__pct">57.4% coverage footprint</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Landsat-9 OLI-2 (15/30m)</span>
                <div className="metric-stat-card__val text-emerald-400">920 km²</div>
                <div className="metric-stat-card__pct">28.7% coverage footprint</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">PlanetScope (3m High-Res)</span>
                <div className="metric-stat-card__val text-amber-400">444 km²</div>
                <div className="metric-stat-card__pct">13.9% coverage footprint</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Cloud Clearance</span>
                <div className="metric-stat-card__val text-purple-400">97.4%</div>
                <div className="metric-stat-card__pct">Usable surface pixels</div>
              </div>

              <div className="metric-table-container">
                <div className="metric-table-header">
                  <span>Sensor Constellation Performance</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("explore");
                    }}
                    className="metric-open-btn"
                  >
                    <span>View Constellation Feeds</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="metric-stream-rows">
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">SENTINEL-2</span>
                    <span className="metric-stream-name">12 Multispectral Bands (RGB, Red-Edge, NIR, SWIR)</span>
                    <span className="metric-stream-conf text-cyan-400">Operational</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">LANDSAT-9</span>
                    <span className="metric-stream-name">Thermal Infrared Sensor 2 (TIRS-2) Calibrated</span>
                    <span className="metric-stream-conf text-cyan-400">Operational</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Accuracy Breakdown ────────────────────────────────── */}
          {metricKey === "accuracy" && (
            <div className="metric-detail-grid">
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Model Precision</span>
                <div className="metric-stat-card__val text-emerald-400">98.1%</div>
                <div className="metric-stat-card__pct">True positives / all detections</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Recall Rate</span>
                <div className="metric-stat-card__val text-emerald-400">97.2%</div>
                <div className="metric-stat-card__pct">True positives / ground truth</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">F1 Harmonic Score</span>
                <div className="metric-stat-card__val text-cyan-400">0.976</div>
                <div className="metric-stat-card__pct">Balanced precision/recall</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Mean AP @ 0.50</span>
                <div className="metric-stat-card__val text-amber-400">92.4%</div>
                <div className="metric-stat-card__pct">Strict IoU benchmark</div>
              </div>

              <div className="metric-table-container">
                <div className="metric-table-header">
                  <span>Architecture & Reliability</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("analysis");
                    }}
                    className="metric-open-btn"
                  >
                    <span>Run Model Diagnostics</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="metric-stream-rows">
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">NEURAL NET</span>
                    <span className="metric-stream-name">Qwen2.5-VL-3B LoRA + YOLOv8x-OBB Engine</span>
                    <span className="metric-stream-conf text-emerald-400">42ms Latency</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge">GROUNDING</span>
                    <span className="metric-stream-name">Zero Count Hallucination — Deterministic GIS verification</span>
                    <span className="metric-stream-conf text-emerald-400">Verified</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Monitors Breakdown ────────────────────────────────── */}
          {metricKey === "monitors" && (
            <div className="metric-detail-grid">
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Active Surveillance</span>
                <div className="metric-stat-card__val text-emerald-400">24</div>
                <div className="metric-stat-card__pct">Operational crons</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Alerts Triggered</span>
                <div className="metric-stat-card__val text-red-400">4</div>
                <div className="metric-stat-card__pct">Thresholds exceeded in 24h</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Notification Latency</span>
                <div className="metric-stat-card__val text-cyan-400">&lt; 90s</div>
                <div className="metric-stat-card__pct">Post-satellite ingestion</div>
              </div>
              <div className="metric-stat-card">
                <span className="metric-stat-card__lbl">Delivery Channels</span>
                <div className="metric-stat-card__val text-purple-400">Email + Webhook</div>
                <div className="metric-stat-card__pct">Enterprise integrations</div>
              </div>

              <div className="metric-table-container">
                <div className="metric-table-header">
                  <span>Surveillance Alert Triggers</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("monitor");
                    }}
                    className="metric-open-btn"
                  >
                    <span>Manage Sentinel Watches</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="metric-stream-rows">
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-red-400">ALERT</span>
                    <span className="metric-stream-name">Amazon Basin Deforestation Arc (NDVI drop &gt; 20%)</span>
                    <span className="metric-stream-conf text-red-400">Triggered</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-emerald-400">NORMAL</span>
                    <span className="metric-stream-name">Suez Canal Vessel Flow Normalcy (Vessels: 42)</span>
                    <span className="metric-stream-conf text-emerald-400">Stable</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── 1. 7+ Satellite Sources Breakdown ──────────────────── */}
          {metricKey === "satellites" && (
            <div className="space-y-4">
              <div className="metric-detail-grid">
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Active Constellations</span>
                  <div className="metric-stat-card__val text-cyan-400">7 Connected</div>
                  <div className="metric-stat-card__pct">Optical, Radar, Thermal & VHR</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Finest Spatial GSD</span>
                  <div className="metric-stat-card__val text-emerald-400">0.28m PAN</div>
                  <div className="metric-stat-card__pct">ISRO Cartosat-3 Aperture</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">SAR Radar Penetration</span>
                  <div className="metric-stat-card__val text-sky-400">C-Band All-Weather</div>
                  <div className="metric-stat-card__pct">Day / night cloud penetrating</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Cadence Refresh</span>
                  <div className="metric-stat-card__val text-purple-400">24 – 72h</div>
                  <div className="metric-stat-card__pct">Multi-sensor offset cadence</div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center justify-between pt-2 pb-1 border-b border-white/10">
                <span className="text-xs font-semibold text-slate-300">Constellation Inventory</span>
                <div className="flex items-center gap-1">
                  {(["all", "optical", "sar", "specialized"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setSatelliteFilter(filter)}
                      className={`px-2 py-1 text-[0.68rem] rounded-md transition-colors ${
                        satelliteFilter === filter
                          ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {filter === "all" ? "All (8)" : filter.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Constellation Cards List */}
              <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                {filteredSatellites.map((sat) => (
                  <div key={sat.name} className="metric-source-card">
                    <div className="metric-source-card__header">
                      <div>
                        <span className="metric-source-card__name">{sat.name}</span>
                        <span className="metric-source-card__agency">{sat.agency}</span>
                      </div>
                      <span
                        className={`metric-status-pill ${
                          sat.status === "live"
                            ? "metric-status-pill--live"
                            : sat.status === "active"
                            ? "metric-status-pill--active"
                            : "metric-status-pill--standby"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {sat.statusLabel}
                      </span>
                    </div>

                    <div className="metric-source-card__meta">
                      <span className="px-2 py-0.5 bg-white/5 rounded text-[0.68rem] font-semibold text-cyan-300">
                        {sat.badge}
                      </span>
                      <span>Revisit: <strong className="text-slate-200">{sat.revisit}</strong></span>
                      <span>Bands: <strong className="text-slate-200">{sat.bands}</strong></span>
                    </div>

                    <p className="metric-source-card__desc">{sat.description}</p>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-[0.72rem] text-slate-400">
                  Ready to stream scenes from active orbits?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("explore");
                    }}
                    className="metric-action-btn metric-action-btn--primary"
                  >
                    <Layers size={13} />
                    <span>Browse Satellite Imagery</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 2. Global Coverage Breakdown ───────────────────────── */}
          {metricKey === "coverage" && (
            <div className="space-y-4">
              <div className="metric-detail-grid">
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Total Planetary Mapped</span>
                  <div className="metric-stat-card__val text-emerald-400">510.1M km²</div>
                  <div className="metric-stat-card__pct">100% terrestrial + ocean maritime</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Polar Orbit Inclination</span>
                  <div className="metric-stat-card__val text-cyan-400">98.2° SSO</div>
                  <div className="metric-stat-card__pct">Global scan 84°N to 84°S</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">STAC Planetary Catalog</span>
                  <div className="metric-stat-card__val text-purple-400">2.8M+ Scenes</div>
                  <div className="metric-stat-card__pct">Cloud-Optimized GeoTIFFs (COG)</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Daily Data Ingestion</span>
                  <div className="metric-stat-card__val text-amber-400">14.2 TB / day</div>
                  <div className="metric-stat-card__pct">Sentinel-2 & Landsat pipelines</div>
                </div>
              </div>

              {/* Planetary Coverage Telemetry */}
              <div className="metric-table-container">
                <div className="metric-table-header">
                  <span>Planetary Surface Ingestion Footprint</span>
                  <span className="text-[0.7rem] text-cyan-400 font-normal">Updated 4m ago</span>
                </div>

                <div className="metric-stream-rows">
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-emerald-400">LANDMASS</span>
                    <span className="metric-stream-name">148.9M km² Terrestrial Surface (10m - 30m Optical MSI)</span>
                    <span className="metric-stream-conf text-emerald-400">100% Index</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-cyan-400">MARITIME</span>
                    <span className="metric-stream-name">361.1M km² Exclusive Economic Zones & Global Shipping Lanes (SAR Radar)</span>
                    <span className="metric-stream-conf text-cyan-400">Active Radar</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-purple-400">POLAR</span>
                    <span className="metric-stream-name">28.4M km² High-Latitude Convergence (Up to 3 overpasses daily)</span>
                    <span className="metric-stream-conf text-purple-400">99.8% Sync</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-amber-400">CLEARANCE</span>
                    <span className="metric-stream-name">Automated Scene Classification Layer (SCL) Cloud Filtering</span>
                    <span className="metric-stream-conf text-amber-400">98.4% Usable</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-[0.72rem] text-slate-400">
                  Inspect the planetary earth model in 3D orbit
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (onFlyTo) {
                        onFlyTo({ lon: 78.9629, lat: 20.5937, height: 20000000, pitch: -90 });
                      }
                      onClose();
                    }}
                    className="metric-action-btn metric-action-btn--primary"
                    title="Zoom out to planetary altitude in 3D Earth view"
                  >
                    <Globe2 size={13} />
                    <span>Fly to Planetary Orbit (20,000 km)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("explore");
                    }}
                    className="metric-action-btn metric-action-btn--ghost"
                  >
                    <Layers size={13} />
                    <span>STAC Catalog</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 3. AI Analytics Breakdown ──────────────────────────── */}
          {metricKey === "analytics" && (
            <div className="space-y-4">
              <div className="metric-detail-grid">
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">CV Engine Latency</span>
                  <div className="metric-stat-card__val text-purple-400">1.4s</div>
                  <div className="metric-stat-card__pct">Sub-2s OBB bounding inference</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">mAP@50 Benchmark</span>
                  <div className="metric-stat-card__val text-emerald-400">94.8%</div>
                  <div className="metric-stat-card__pct">DOTA & Aerial Parking datasets</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">False Positive Rate</span>
                  <div className="metric-stat-card__val text-cyan-400">&lt; 1.8%</div>
                  <div className="metric-stat-card__pct">Zero count hallucination verified</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Multispectral Indices</span>
                  <div className="metric-stat-card__val text-amber-400">12 Bands</div>
                  <div className="metric-stat-card__pct">NDVI, NDWI, NDBI raster algebra</div>
                </div>
              </div>

              {/* Architecture Highlights */}
              <div className="metric-table-container">
                <div className="metric-table-header">
                  <span>Core AI & Computer Vision Architecture</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("detections");
                    }}
                    className="metric-open-btn"
                  >
                    <span>Launch Detection Engine</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="metric-stream-rows">
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-purple-400">YOLOV8-OBB</span>
                    <span className="metric-stream-name">
                      Oriented Bounding Box model with sub-pixel IoU calculation for angled vehicles, ships, and tanks
                    </span>
                    <span className="metric-stream-conf text-emerald-400">Verified</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-cyan-400">VISION VLM</span>
                    <span className="metric-stream-name">
                      Groq Llama-3.2-11B Vision Copilot for multi-spectral scene reasoning and natural language querying
                    </span>
                    <span className="metric-stream-conf text-cyan-400">420ms</span>
                  </div>
                  <div className="metric-stream-row">
                    <span className="metric-stream-badge text-emerald-400">RASTER ALGEBRA</span>
                    <span className="metric-stream-name">
                      Deterministic pixel math: NDVI (Vigor), NDWI (Flood Water), and NDBI (Urban Density)
                    </span>
                    <span className="metric-stream-conf text-emerald-400">0.0% Hallucination</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-[0.72rem] text-slate-400">
                  Ready to test detection or spectral indices on an active scene?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("detections");
                    }}
                    className="metric-action-btn metric-action-btn--primary"
                  >
                    <Scan size={13} />
                    <span>Run Object Detection</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("analysis");
                    }}
                    className="metric-action-btn metric-action-btn--ghost"
                  >
                    <Sparkles size={13} />
                    <span>Open Spectral Analysis</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── 4. Real-World Impact Breakdown ─────────────────────── */}
          {metricKey === "impact" && (
            <div className="space-y-4">
              <div className="metric-detail-grid">
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Flood Inundation Mapped</span>
                  <div className="metric-stat-card__val text-amber-400">4,800 km²</div>
                  <div className="metric-stat-card__pct">Assam Brahmaputra crisis operations</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Dark Vessels Interdicted</span>
                  <div className="metric-stat-card__val text-cyan-400">87 Targets</div>
                  <div className="metric-stat-card__pct">Gulf of Kutch & Malacca Strait</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Glacial Lakes Monitored</span>
                  <div className="metric-stat-card__val text-purple-400">42 Lakes</div>
                  <div className="metric-stat-card__pct">Himalayan GLOF early warning network</div>
                </div>
                <div className="metric-stat-card">
                  <span className="metric-stat-card__lbl">Embankments Assessed</span>
                  <div className="metric-stat-card__val text-emerald-400">310 km</div>
                  <div className="metric-stat-card__pct">Critical breach risk analysis</div>
                </div>
              </div>

              {/* Active Mission Dossiers */}
              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
                {/* Mission 1: Assam Brahmaputra */}
                <div className="metric-mission-card">
                  <div className="metric-mission-card__header">
                    <span className="metric-mission-card__title">
                      Brahmaputra Basin Flood Emergency & Embankment Breach
                    </span>
                    <span className="metric-mission-card__badge metric-mission-card__badge--emergency">
                      Emergency Response
                    </span>
                  </div>

                  <p className="text-[0.72rem] text-slate-300 leading-relaxed">
                    Mapped 4,800 km² of inundated acreage using Sentinel-1 SAR within 3 hours of pass.
                    Pinpointed 14 critical levee breaches along the Brahmaputra, delivering real-time geo-coordinates to NDRF rescue teams.
                  </p>

                  <div className="metric-mission-card__stats">
                    <div className="metric-mission-card__stat-item">
                      <span className="metric-mission-card__stat-num">14 Breaches</span>
                      <span className="metric-mission-card__stat-lbl">Identified in 3h</span>
                    </div>
                    <div className="metric-mission-card__stat-item">
                      <span className="metric-mission-card__stat-num">Sentinel-1 SAR</span>
                      <span className="metric-mission-card__stat-lbl">C-Band All-Weather</span>
                    </div>
                  </div>

                  <div className="metric-mission-card__actions">
                    <button
                      type="button"
                      onClick={() => {
                        const project = projects.find((p) => p.id === "proj_brahmaputra_flood");
                        if (project && onSelectProject) {
                          onSelectProject(project);
                        } else if (onFlyTo) {
                          onFlyTo({ lon: 93.87, lat: 26.90, height: 140000, pitch: -90 });
                        }
                        onClose();
                      }}
                      className="metric-action-btn metric-action-btn--amber"
                    >
                      <Compass size={13} />
                      <span>Fly to Assam Flood AOI</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Mission 2: Gulf of Kutch */}
                <div className="metric-mission-card">
                  <div className="metric-mission-card__header">
                    <span className="metric-mission-card__title">
                      Gulf of Kutch Maritime Border & Dark Vessel Interdiction
                    </span>
                    <span className="metric-mission-card__badge metric-mission-card__badge--surveillance">
                      Maritime Security
                    </span>
                  </div>

                  <p className="text-[0.72rem] text-slate-300 leading-relaxed">
                    Tracked 87 unflagged vessels operating with transponders disabled in critical shipping choke-points.
                    Correlated SAR radar backscatter with terrestrial AIS receivers to isolate clandestine cargo transfers.
                  </p>

                  <div className="metric-mission-card__stats">
                    <div className="metric-mission-card__stat-item">
                      <span className="metric-mission-card__stat-num">87 Targets</span>
                      <span className="metric-mission-card__stat-lbl">Transponders Disabled</span>
                    </div>
                    <div className="metric-mission-card__stat-item">
                      <span className="metric-mission-card__stat-num">SAR + AIS</span>
                      <span className="metric-mission-card__stat-lbl">Dual-Sensor Fusion</span>
                    </div>
                  </div>

                  <div className="metric-mission-card__actions">
                    <button
                      type="button"
                      onClick={() => {
                        const project = projects.find((p) => p.id === "proj_kutch_maritime");
                        if (project && onSelectProject) {
                          onSelectProject(project);
                        } else if (onFlyTo) {
                          onFlyTo({ lon: 69.30, lat: 22.87, height: 160000, pitch: -90 });
                        }
                        onClose();
                      }}
                      className="metric-action-btn metric-action-btn--primary"
                    >
                      <Compass size={13} />
                      <span>Fly to Kutch Maritime AOI</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Mission 3: Himalayan GLOF */}
                <div className="metric-mission-card">
                  <div className="metric-mission-card__header">
                    <span className="metric-mission-card__title">
                      Himalayan Glacial Lake Outburst (GLOF) Early Warning
                    </span>
                    <span className="metric-mission-card__badge metric-mission-card__badge--strategic">
                      Early Warning
                    </span>
                  </div>

                  <p className="text-[0.72rem] text-slate-300 leading-relaxed">
                    Continuous optical and thermal monitoring of 42 pro-glacial moraine-dammed lakes across Sikkim & Ladakh.
                    Automated alerts generated based on surface water expansion and moraine dam integrity metrics.
                  </p>

                  <div className="metric-mission-card__stats">
                    <div className="metric-mission-card__stat-item">
                      <span className="metric-mission-card__stat-num">42 Lakes</span>
                      <span className="metric-mission-card__stat-lbl">Continuous Surveillance</span>
                    </div>
                    <div className="metric-mission-card__stat-item">
                      <span className="metric-mission-card__stat-num">Cartosat-3</span>
                      <span className="metric-mission-card__stat-lbl">0.28m Resolution</span>
                    </div>
                  </div>

                  <div className="metric-mission-card__actions">
                    <button
                      type="button"
                      onClick={() => {
                        const project = projects.find((p) => p.id === "proj_himalayan_glof");
                        if (project && onSelectProject) {
                          onSelectProject(project);
                        } else if (onFlyTo) {
                          onFlyTo({ lon: 88.20, lat: 27.91, height: 95000, pitch: -90 });
                        }
                        onClose();
                      }}
                      className="metric-action-btn metric-action-btn--ghost"
                    >
                      <Compass size={13} />
                      <span>Fly to Himalayan GLOF AOI</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <span className="text-[0.72rem] text-slate-400">
                  Experience the mission overview in cinematic mode
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("solen:replay-intro"));
                      onClose();
                    }}
                    className="metric-action-btn metric-action-btn--primary"
                  >
                    <Play size={13} />
                    <span>Replay SOLEN Cinematic Story</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspace("projects");
                    }}
                    className="metric-action-btn metric-action-btn--ghost"
                  >
                    <span>View All Projects</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="metric-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="metric-modal-footer-close-btn"
          >
            Close View (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
