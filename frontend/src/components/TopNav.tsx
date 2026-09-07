"use client";

import React, { useState, useEffect } from "react";
import { Search, Sun, Bell, Globe, Map as MapIcon, X } from "lucide-react";
import AlertsBell from "./AlertsBell";

interface TopNavProps {
  onSearchSubmit: (query: string) => void;
  onNavClick: (section: string) => void;
  activeSection: string;
  viewMode: "3d" | "2d";
  onToggleViewMode: () => void;
}

export default function TopNav({
  onSearchSubmit,
  onNavClick,
  activeSection,
  viewMode,
  onToggleViewMode,
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
      {/* Section Navigation Links */}
      <div className="theme-topnav__links">
        {["EXPLORE", "ANALYZE", "MONITOR", "REPORTS"].map((item) => (
          <button
            key={item}
            onClick={() => onNavClick(item.toLowerCase())}
            className={`theme-topnav__link ${
              activeSection === item.toLowerCase() ? "theme-topnav__link--active" : ""
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Global Search Bar (Matching theme.jpg) */}
      <form onSubmit={handleSubmit} className="theme-topnav__search">
        <Search size={15} className="theme-topnav__search-icon" />
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
          >
            <X size={12} />
          </button>
        )}
        <kbd className="theme-topnav__kbd">⌘K</kbd>
      </form>

      {/* Right Controls */}
      <div className="theme-topnav__right">
        {/* 3D / 2D Toggle */}
        <button
          onClick={onToggleViewMode}
          className="theme-topnav__icon-btn"
          title={viewMode === "3d" ? "Switch to 2D Map" : "Switch to 3D Globe"}
        >
          {viewMode === "3d" ? <MapIcon size={16} /> : <Globe size={16} />}
        </button>
      </div>
    </header>
  );
}
