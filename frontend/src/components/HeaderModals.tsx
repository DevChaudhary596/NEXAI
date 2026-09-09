"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Bell,
  User,
  Search,
  CheckCircle,
  AlertTriangle,
  Radio,
  Cpu,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  Lock,
  ShieldCheck,
} from "lucide-react";
import type { FlyToTarget } from "./Cesium3DView";
import { listAlerts, markAlertSeen, updateAlert } from "@/lib/api";
import type { AlertStatus } from "@/types";
import { useAuth } from "@/components/AuthProvider";

// ── Notifications Drawer ──────────────────────────────────────────
export interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: "alert" | "info" | "success";
  read: boolean;
  status?: AlertStatus;
}


const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Sentinel-2 Tile 43QFB Ingested",
    desc: "Mumbai Port multispectral observation scene ingested with 0.8% cloud cover. COG pyramids generated.",
    time: "12m ago",
    type: "success",
    read: false,
  },
  {
    id: "notif-2",
    title: "Wildfire Burn Scar Threshold Exceeded",
    desc: "California Butte Sector flagged with NBR < -0.22. Emergency boundary polygon dispatched to watch email.",
    time: "48m ago",
    type: "alert",
    read: false,
  },
  {
    id: "notif-3",
    title: "Vessel Cluster Density Alert",
    desc: "14 Aframax crude oil tankers anchored outside JNPT Harbor corridor.",
    time: "2h ago",
    type: "info",
    read: true,
  },
  {
    id: "notif-4",
    title: "SatQuery VLM Weights Synced",
    desc: "Vision-Language intent grounding model calibrated with zero-count hallucination verification.",
    time: "5h ago",
    type: "info",
    read: true,
  },
];

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (prompt: string) => void;
}

export function NotificationsDrawer({
  isOpen,
  onClose,
  onSelectAction,
}: NotificationsDrawerProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  useEffect(() => {
    if (isOpen) {
      listAlerts("analyst@satquery.io")
        .then((res) => {
          if (res.alerts && res.alerts.length > 0) {
            const mapped: NotificationItem[] = res.alerts.map((a) => ({
              id: a.id,
              title: `Watch Alert: ${a.message.slice(0, 36)}…`,
              desc: a.message,
              time: new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              type: "alert",
              read: a.seen,
              status: a.status ?? "open",
            }));
            setNotifications(mapped);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const markAllRead = () => {
    notifications.forEach((n) => {
      markAlertSeen(n.id).catch(() => {});
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleTriage = async (e: React.MouseEvent, alertId: string, nextStatus: AlertStatus) => {
    e.stopPropagation();
    try {
      await updateAlert(alertId, { status: nextStatus, seen: true });
      setNotifications((prev) =>
        prev.map((n) => (n.id === alertId ? { ...n, status: nextStatus, read: true } : n))
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="workspace-modal-overlay workspace-modal-overlay--drawer" onClick={onClose}>
      <div
        className="notifications-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notifications-drawer__header">
          <div className="notifications-drawer__title-group">
            <Bell size={18} color="#22d3ee" />
            <div>
              <h3 className="notifications-drawer__title">Surveillance Intelligence</h3>
              <p className="notifications-drawer__sub">Active Sentinel Alerts & Pass Logs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markAllRead}
              className="notifications-mark-read-btn"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={onClose}
              className="workspace-modal-close-btn"
              title="Close Drawer (Esc)"
              aria-label="Close Surveillance Intelligence"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="notifications-drawer__body">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`notification-card ${
                !n.read ? "notification-card--unread" : ""
              }`}
              onClick={() => {
                onSelectAction(`Review notification details: ${n.title}`);
                onClose();
              }}
            >
              <div className="notification-card__icon-col">
                {n.type === "alert" ? (
                  <AlertTriangle size={15} color="#ef4444" />
                ) : n.type === "success" ? (
                  <CheckCircle size={15} color="#10b981" />
                ) : (
                  <Radio size={15} color="#0284c7" />
                )}
              </div>
              <div className="notification-card__content">
                <div className="notification-card__title-row">
                  <span className="notification-card__title">{n.title}</span>
                  <span className="notification-card__time">{n.time}</span>
                </div>
                <p className="notification-card__desc">{n.desc}</p>
                {n.status && (
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60" onClick={(e) => e.stopPropagation()}>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                      n.status === "resolved"
                        ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/50"
                        : n.status === "investigating"
                        ? "bg-sky-950/80 text-sky-400 border border-sky-800/50"
                        : "bg-amber-950/80 text-amber-400 border border-amber-800/50"
                    }`}>
                      {n.status}
                    </span>
                    {n.type === "alert" && (
                      <div className="flex items-center gap-1.5">
                        {n.status === "open" && (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 hover:underline px-2 py-0.5"
                            onClick={(e) => handleTriage(e, n.id, "investigating")}
                          >
                            Investigate
                          </button>
                        )}
                        {n.status === "investigating" && (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 hover:underline px-2 py-0.5"
                            onClick={(e) => handleTriage(e, n.id, "resolved")}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>


        <div className="notifications-drawer__footer">
          <button
            type="button"
            onClick={onClose}
            className="notifications-drawer-footer-btn"
          >
            <X size={14} />
            <span>Close Surveillance Panel (Esc)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Enterprise Profile Modal ──────────────────────────────────────
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user } = useAuth();
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="workspace-modal-overlay" onClick={onClose}>
      <div
        className="profile-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-modal-header">
          <div className="flex items-center gap-3">
            <div className="profile-avatar-large">SQ</div>
            <div>
              <h3 className="profile-modal-name">{user?.displayName || "SatQuery Intelligence Operator"}</h3>
              <p className="profile-modal-sub">
                {user?.email ? `${user.email} • RBAC Analyst Access` : "Sovereign Operations • Dedicated Local Engine"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="workspace-modal-close-btn"
            title="Close Profile (Esc)"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="profile-modal-body">
          {/* Compute Engine Status */}
          <div className="profile-quota-card">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-300">Planetary GIS & Neural Engine</span>
              <strong className="text-emerald-400 text-xs">READY • LOCAL CLUSTER</strong>
            </div>
            <div className="profile-quota-bar">
              <div className="profile-quota-bar__fill" style={{ width: "100%", background: "linear-gradient(90deg, #10b981, #06b6d4)" }} />
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Dedicated on-device GPU acceleration active. Unlimited multispectral GIS raster analysis, YOLOv8 target detection, and spectral index calculations.
            </p>
          </div>

          {/* Connected Feeds */}
          <div className="profile-section">
            <h4 className="profile-section__title">Earth Observation Constellations</h4>
            <div className="profile-feeds-list">
              <div className="profile-feed-item">
                <div className="profile-feed-status profile-feed-status--live" />
                <div className="profile-feed-info">
                  <div className="profile-feed-name">ESA Copernicus Open Access Hub</div>
                  <div className="profile-feed-desc">Sentinel-2A/B (MSI 10m Multispectral STAC)</div>
                </div>
                <span className="profile-feed-badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                  CONNECTED
                </span>
              </div>

              <div className="profile-feed-item">
                <div className="profile-feed-status profile-feed-status--live" />
                <div className="profile-feed-info">
                  <div className="profile-feed-name">USGS EarthExplorer</div>
                  <div className="profile-feed-desc">Landsat-9 (OLI-2 / TIRS-2 15m/30m STAC)</div>
                </div>
                <span className="profile-feed-badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                  CONNECTED
                </span>
              </div>

              <div className="profile-feed-item">
                <div className="profile-feed-status" style={{ background: "#64748b" }} />
                <div className="profile-feed-info">
                  <div className="profile-feed-name">Commercial Satellite Tasking</div>
                  <div className="profile-feed-desc">PlanetScope / Maxar (On-Demand High-Resolution)</div>
                </div>
                <span className="profile-feed-badge" style={{ background: "rgba(100, 116, 139, 0.15)", color: "#94a3b8", border: "1px solid rgba(100, 116, 139, 0.3)" }}>
                  STANDBY
                </span>
              </div>
            </div>
          </div>

          {/* Security & Secret Isolation */}
          <div className="profile-section">
            <h4 className="profile-section__title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} color="#10b981" />
              Security Architecture & Secret Isolation
            </h4>
            <div
              className="profile-key-box"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 8,
                padding: "12px 14px",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                background: "rgba(6, 78, 59, 0.15)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#34d399", display: "flex", alignItems: "center", gap: 6 }}>
                  <Lock size={13} /> Zero-Trust Server Isolation
                </span>
                <span style={{ fontSize: "0.65rem", padding: "2px 6px", borderRadius: 4, background: "rgba(16, 185, 129, 0.2)", color: "#6ee7b7", fontFamily: "monospace" }}>
                  CLIENT-SECURE
                </span>
              </div>
              <p style={{ fontSize: "0.7rem", color: "#cbd5e1", lineHeight: 1.5, margin: 0 }}>
                API keys, S3 storage secrets, and service accounts are isolated strictly within backend runtime environment variables. Zero credentials or tokens are exposed to frontend browser bundles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Command Palette (⌘K) ──────────────────────────────────────────
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onFlyTo: (target: FlyToTarget) => void;
  onSelectAction: (prompt: string) => void;
  onOpenWorkspace: (tab: any) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onFlyTo,
  onSelectAction,
  onOpenWorkspace,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const COMMANDS = [
    {
      label: "Fly to San Francisco Bay & Airport",
      category: "Navigation",
      action: () => {
        onFlyTo({ lon: -122.379, lat: 37.6213, height: 4500, pitch: -45 });
        onSelectAction("Examine aircraft movements and runway status at SFO.");
      },
    },
    {
      label: "Fly to Suez Canal Shipping Corridor",
      category: "Navigation",
      action: () => {
        onFlyTo({ lon: 32.2654, lat: 30.5852, height: 14000, pitch: -50 });
        onSelectAction("Monitor maritime vessel queue in Suez Canal.");
      },
    },
    {
      label: "Compute NDVI Vegetation Health",
      category: "Analysis",
      action: () => {
        onOpenWorkspace("analysis");
      },
    },
    {
      label: "Run Target Object Detection (YOLO-OBB)",
      category: "Detections",
      action: () => {
        onOpenWorkspace("detections");
      },
    },
    {
      label: "Bi-Temporal Surface Change Detection",
      category: "Analysis",
      action: () => {
        onOpenWorkspace("compare");
      },
    },
    {
      label: "Configure Persistent Sentinel Watch",
      category: "Surveillance",
      action: () => {
        onOpenWorkspace("monitor");
      },
    },
    {
      label: "Export Formal PDF Intelligence Dossier",
      category: "Reporting",
      action: () => {
        onOpenWorkspace("reports");
      },
    },
  ];

  const filtered = COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="workspace-modal-overlay" onClick={onClose}>
      <div
        className="cmd-palette-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmd-palette-search">
          <Search size={16} color="#94a3b8" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command, location, or spectral index..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cmd-palette-input"
          />
          <kbd className="theme-topnav__kbd">ESC</kbd>
        </div>

        <div className="cmd-palette-list">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No matching commands found.
            </div>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className="cmd-palette-item"
              >
                <div className="flex items-center gap-2">
                  <span className="cmd-palette-category">{cmd.category}</span>
                  <span className="cmd-palette-label">{cmd.label}</span>
                </div>
                <ArrowRight size={13} color="#64748b" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
