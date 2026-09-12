"use client";

import React from "react";
import SolenLogo from "@/components/SolenLogo";
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
  Lock,
  X,
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
  isOpen?: boolean;
  onClose?: () => void;
}

const NAV_ITEMS: {
  key: NavItemKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  locked?: boolean;
}[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "explore", label: "Explore", icon: Compass },
  { key: "analysis", label: "Analysis", icon: BarChart3 },
  { key: "detections", label: "Detections", icon: Scan },
  { key: "compare", label: "Compare", icon: GitCompare, locked: true },
  { key: "monitor", label: "Monitor", icon: Clock, locked: true },
  { key: "projects", label: "Projects", icon: Folder },
  { key: "data-library", label: "Data Library", icon: Database },
  { key: "reports", label: "Reports", icon: FileText, locked: true },
];

export default function Sidebar({
  activeTab,
  onTabChange,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const handleSelect = (key: NavItemKey) => {
    onTabChange(key);
    onClose?.();
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="native-sidebar-backdrop"
          onClick={onClose}
          aria-label="Close navigation sidebar"
        />
      )}

      <aside className={`native-sidebar ${isOpen ? "native-sidebar--open" : ""}`}>
        {/* ── Top Ivory Container ─────────────────────────────────── */}
        <div className="native-sidebar__ivory-box">
          {/* Brand Header */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (activeTab === "dashboard") {
                  window.dispatchEvent(new CustomEvent("solen:replay-intro"));
                } else {
                  handleSelect("dashboard");
                }
              }}
              className="native-sidebar__brand-btn flex-1 min-w-0"
              title="SOLEN — Click to switch to Dashboard or replay startup intro"
            >
              <div className="native-sidebar__logo-icon"><SolenLogo variant="icon" decorative /></div>
              <div className="native-sidebar__brand-meta">
                <span className="native-sidebar__brand-title">SOLEN</span>
                <span className="native-sidebar__brand-sub">SEE A CLEARER TOMORROW</span>
              </div>
            </button>

            {/* Mobile Close Button */}
            {onClose && (
              <button
                type="button"
                className="native-sidebar__close-btn"
                onClick={onClose}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            )}
          </div>

        {/* Navigation Items List */}
        <nav className="native-sidebar__nav">
          {NAV_ITEMS.map(({ key, label, icon: Icon, locked }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelect(key)}
                className={`native-sidebar__nav-item ${
                  isActive ? "native-sidebar__nav-item--active" : ""
                } ${locked ? "native-sidebar__nav-item--locked" : ""}`}
                title={locked ? `${label} — Coming Soon (Feature Locked)` : label}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Icon size={17} className="native-sidebar__nav-icon" />
                  {locked && (
                    <Lock size={12} className="native-sidebar__lock-icon" />
                  )}
                  <span className="native-sidebar__nav-label">{label}</span>
                </div>
                {locked && (
                  <span className="native-sidebar__coming-soon-badge">
                    Coming Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Bottom Hiker Ridge Perspective Card ───────────────── */}
      <div className="native-sidebar__bottom-card">
        <img
          src="/images/sidebar_clean_hiker.png"
          alt="Hiker on mountain ridge"
          className="native-sidebar__bottom-img"
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
    </>
  );
}
