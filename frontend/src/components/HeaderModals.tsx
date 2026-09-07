"use client";

import React, { useState } from "react";
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
  Sparkles,
  ArrowRight,
  ExternalLink,
  Key,
} from "lucide-react";
import type { FlyToTarget } from "./Cesium3DView";

// ── Notifications Drawer ──────────────────────────────────────────
export interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: "alert" | "info" | "success";
  read: boolean;
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

  if (!isOpen) return null;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="workspace-modal-overlay" onClick={onClose}>
      <div
        className="notifications-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="notifications-drawer__header">
          <div className="notifications-drawer__title-group">
            <Bell size={18} color="#22d3ee" />
            <h3 className="notifications-drawer__title">Surveillance Notifications</h3>
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
              </div>
            </div>
          ))}
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
              <h3 className="profile-modal-name">SatQuery Enterprise Operations</h3>
              <p className="profile-modal-sub">Enterprise Plan • Dedicated GPU Cluster</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="workspace-modal-close-btn"
          >
            <X size={16} />
          </button>
        </div>

        <div className="profile-modal-body">
          {/* Quota Usage */}
          <div className="profile-quota-card">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-300">Planetary Compute Credits</span>
              <strong className="text-cyan-400 text-xs">84,200 / 100,000 (84.2%)</strong>
            </div>
            <div className="profile-quota-bar">
              <div className="profile-quota-bar__fill" style={{ width: "84.2%" }} />
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Quota auto-renews on the 1st of each calendar month. Unlimited local GIS raster processing.
            </p>
          </div>

          {/* Connected Feeds */}
          <div className="profile-section">
            <h4 className="profile-section__title">Connected Satellite Constellations</h4>
            <div className="profile-feeds-list">
              <div className="profile-feed-item">
                <div className="profile-feed-status profile-feed-status--live" />
                <div className="profile-feed-info">
                  <div className="profile-feed-name">ESA Copernicus Open Access Hub</div>
                  <div className="profile-feed-desc">Sentinel-2A/B (MSI 10m Multispectral)</div>
                </div>
                <span className="profile-feed-badge">CONNECTED</span>
              </div>

              <div className="profile-feed-item">
                <div className="profile-feed-status profile-feed-status--live" />
                <div className="profile-feed-info">
                  <div className="profile-feed-name">USGS EarthExplorer</div>
                  <div className="profile-feed-desc">Landsat-9 (OLI-2 / TIRS-2 15m/30m)</div>
                </div>
                <span className="profile-feed-badge">CONNECTED</span>
              </div>

              <div className="profile-feed-item">
                <div className="profile-feed-status profile-feed-status--live" />
                <div className="profile-feed-info">
                  <div className="profile-feed-name">Planet Labs Enterprise API</div>
                  <div className="profile-feed-desc">PlanetScope SuperDove (3m Daily Constellation)</div>
                </div>
                <span className="profile-feed-badge">CONNECTED</span>
              </div>
            </div>
          </div>

          {/* Security & Organization */}
          <div className="profile-section">
            <h4 className="profile-section__title">Security & Organization Key</h4>
            <div className="profile-key-box">
              <Key size={14} color="#94a3b8" />
              <code>sq_live_94f8e21a88b04938d9c2e0</code>
              <button
                type="button"
                onClick={() => alert("API Token copied to clipboard.")}
                className="profile-copy-btn"
              >
                Copy
              </button>
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
