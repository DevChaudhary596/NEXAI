"use client";

import React from "react";
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
} from "lucide-react";

interface MetricModalProps {
  metricKey: "objects" | "area" | "accuracy" | "monitors" | null;
  onClose: () => void;
  onOpenWorkspace: (tab: "detections" | "explore" | "analysis" | "monitor") => void;
}

export default function MetricModal({
  metricKey,
  onClose,
  onOpenWorkspace,
}: MetricModalProps) {
  if (!metricKey) return null;

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
                  <p className="metric-modal-sub">YOLOv8x-OBB + SatQuery VLM grounding benchmarks</p>
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
          </div>

          <button
            type="button"
            onClick={onClose}
            className="workspace-modal-close-btn"
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
        </div>
      </div>
    </div>
  );
}
