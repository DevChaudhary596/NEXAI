"use client";

import React from "react";
import {
  LayoutDashboard,
  Compass,
  BarChart3,
  Scan,
  GitCompare,
  Clock,
  Folder,
  Database,
  FileText,
  UploadCloud,
} from "lucide-react";

export type NavItemKey =
  | "dashboard"
  | "explore"
  | "analysis"
  | "detections"
  | "compare"
  | "monitor"
  | "projects"
  | "data-library"
  | "reports";

interface SidebarProps {
  activeTab: NavItemKey;
  onTabChange: (tab: NavItemKey) => void;
}

const NAV_ITEMS: {
  key: NavItemKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "explore", label: "Explore", icon: Compass },
  { key: "analysis", label: "Analysis", icon: BarChart3 },
  { key: "detections", label: "Detections", icon: Scan },
  { key: "compare", label: "Compare", icon: GitCompare },
  { key: "monitor", label: "Monitor", icon: Clock },
  { key: "projects", label: "Projects", icon: Folder },
  { key: "data-library", label: "Upload & Data", icon: UploadCloud },
  { key: "reports", label: "Reports", icon: FileText },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="native-sidebar">
      {/* ── Top Ivory Container ─────────────────────────────────── */}
      <div className="native-sidebar__ivory-box">
        {/* Brand Header */}
        <button
          type="button"
          onClick={() => onTabChange("dashboard")}
          className="native-sidebar__brand-btn"
          title="SatQuery"
        >
          <div className="native-sidebar__logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" fill="#181e23" />
              <path
                d="M4 14C4 14 9.5 7 15 7C20.5 7 24 14 24 14C24 14 18.5 21 13 21C7.5 21 4 14 4 14Z"
                fill="#ffffff"
                fillOpacity="0.15"
              />
              <path
                d="M5 14.5C8.5 10 14 9 23 13"
                stroke="#ffffff"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="native-sidebar__brand-meta">
            <span className="native-sidebar__brand-title">SatQuery</span>
            <span className="native-sidebar__brand-sub">SEE A CLEARER TOMORROW</span>
          </div>
        </button>

        {/* Primary Upload CTA Button */}
        <button
          type="button"
          onClick={() => onTabChange("data-library")}
          className="native-sidebar__upload-cta"
          title="Upload GeoTIFF / Ingest Satellite Imagery"
        >
          <UploadCloud size={16} />
          <span>Upload Scene</span>
        </button>

        {/* Navigation Items List */}
        <nav className="native-sidebar__nav">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={`native-sidebar__nav-item ${
                  isActive ? "native-sidebar__nav-item--active" : ""
                }`}
              >
                <Icon size={17} className="native-sidebar__nav-icon" />
                <span className="native-sidebar__nav-label">{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom Mountain Hiker Card ──────────────────────────── */}
      <div className="native-sidebar__bottom-card">
        <img
          src="/images/sidebar_clean_hiker.png"
          alt="SatQuery Perspective"
          className="native-sidebar__bottom-img"
          draggable={false}
        />
        <div className="native-sidebar__bottom-gradient" />
        <div className="native-sidebar__bottom-motto">
          <span>HIGHER</span>
          <span>PERSPECTIVE</span>
          <span>BRIGHTER</span>
          <span>SOLUTIONS</span>
        </div>
      </div>
    </aside>
  );
}
