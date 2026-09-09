"use client";

import React, { useState, useEffect } from "react";
import { Search, X, Sun, Moon, Bell } from "lucide-react";
import type { Classification, WorkspaceResponse } from "@/types";
import type { NavItemKey } from "@/components/Sidebar";

interface TopNavProps {
  onSearchSubmit: (query: string) => void;
  activeTab?: NavItemKey;
  onTabChange?: (tab: NavItemKey) => void;
  workspaces?: WorkspaceResponse[];
  activeWorkspaceId?: string | null;
  onWorkspaceSelect?: (workspaceId: string) => void;
  onWorkspaceCreate?: (name: string, classification: Classification) => Promise<void>;
  isLightMode?: boolean;
  onToggleTheme?: () => void;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
}

export default function TopNav({
  onSearchSubmit,
  activeTab = "dashboard",
  onTabChange,
  workspaces = [],
  activeWorkspaceId,
  onWorkspaceSelect,
  isLightMode = false,
  onToggleTheme,
  onOpenNotifications,
  onOpenProfile,
}: TopNavProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearchSubmit(query.trim());
    }
  };

  // Listen for ⌘K or Ctrl+K to focus search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("top-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="theme-topnav">
      {/* Left: Subtle divider slash matching theme.jpg */}
      <div className="theme-topnav__left">
        <span className="theme-topnav__slash select-none">/</span>
      </div>

      {/* Centered Navigation Tabs (Matching theme.jpg) */}
      <nav className="theme-topnav__links" aria-label="Main sections">
        <button
          type="button"
          onClick={() => onTabChange?.("explore")}
          className={`theme-topnav__link ${activeTab === "explore" ? "theme-topnav__link--active" : ""}`}
        >
          EXPLORE
        </button>
        <button
          type="button"
          onClick={() => onTabChange?.("analysis")}
          className={`theme-topnav__link ${activeTab === "analysis" ? "theme-topnav__link--active" : ""}`}
        >
          ANALYZE
        </button>
        <button
          type="button"
          onClick={() => onTabChange?.("monitor")}
          className={`theme-topnav__link ${activeTab === "monitor" ? "theme-topnav__link--active" : ""}`}
        >
          MONITOR
        </button>
        <button
          type="button"
          onClick={() => onTabChange?.("reports")}
          className={`theme-topnav__link ${activeTab === "reports" ? "theme-topnav__link--active" : ""}`}
        >
          REPORTS
        </button>
      </nav>

      {/* Global Search Bar (Matching theme.jpg) */}
      <form onSubmit={handleSubmit} className="theme-topnav__search">
        <Search size={14} className="theme-topnav__search-icon" />
        <input
          id="top-search-input"
          type="text"
          placeholder="Search for a location, asset, or ask anything..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="theme-topnav__search-input"
        />
        {query && (
          <button
            type="button"
            className="theme-topnav__search-clear"
            onClick={() => setQuery("")}
            title="Clear search"
          >
            <X size={12} />
          </button>
        )}
        <kbd className="theme-topnav__kbd">⌘K</kbd>
      </form>

      {/* Right Controls matching theme.jpg: Sun, Bell, Avatar, Slogan */}
      <div className="theme-topnav__right">
        {/* Day / Night Theme Toggle */}
        <button
          type="button"
          className="theme-topnav__circle-btn"
          onClick={onToggleTheme}
          title={isLightMode ? "Switch to Dark Orbit Mode" : "Switch to Daylight Mode"}
          aria-label="Toggle theme"
        >
          {isLightMode ? <Moon size={14} color="#f59e0b" /> : <Sun size={14} />}
        </button>

        {/* Notifications Trigger */}
        <button
          type="button"
          className="theme-topnav__circle-btn"
          onClick={onOpenNotifications}
          title="Notifications & Live Sentinel Passes"
          aria-label="Notifications"
        >
          <Bell size={14} />
          <span className="theme-topnav__circle-dot" />
        </button>

        {/* User Profile Avatar "A" */}
        <div
          className="theme-topnav__avatar"
          onClick={onOpenProfile}
          title="Account Profile & Settings"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onOpenProfile?.();
          }}
        >
          A
        </div>

        {/* Top-right Slogan */}
        <div className="theme-topnav__slogan select-none">
          <span>PLANET</span>
          <span>PEOPLE</span>
          <span>POSSIBILITIES</span>
        </div>
      </div>
    </header>
  );
}
