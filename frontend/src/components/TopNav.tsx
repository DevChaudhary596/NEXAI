"use client";

import React, { useState, useEffect } from "react";
import { Search, Globe, X, Maximize2, Minimize2, UploadCloud } from "lucide-react";

interface TopNavProps {
  onSearchSubmit: (query: string) => void;
  onNavClick: (section: string) => void;
  activeSection: string;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  onResetGlobe?: () => void;
}

export default function TopNav({
  onSearchSubmit,
  onNavClick,
  activeSection,
  isFullScreen = false,
  onToggleFullScreen,
  onResetGlobe,
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
        {["EXPLORE", "ANALYZE", "UPLOAD", "MONITOR", "REPORTS"].map((item) => (
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
          placeholder="Search any airport, city, or coordinates..."
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

      {/* Right Controls: Upload, Globe & Fullscreen */}
      <div className="theme-topnav__right">
        {/* Upload GeoTIFF Button */}
        <button
          type="button"
          onClick={() => onNavClick("upload")}
          className="theme-topnav__upload-btn"
          title="Upload Custom GeoTIFF / Ingest Scene"
        >
          <UploadCloud size={14} />
          <span>Upload</span>
        </button>

        {/* Reset to Global Space Orbit */}
        {onResetGlobe && (
          <button
            type="button"
            onClick={onResetGlobe}
            className="theme-topnav__icon-btn"
            title="Reset Global Earth Orbit View"
          >
            <Globe size={16} />
          </button>
        )}

        {/* Maximize Globe to Full Screen */}
        {onToggleFullScreen && (
          <button
            type="button"
            onClick={onToggleFullScreen}
            className="theme-topnav__icon-btn theme-topnav__icon-btn--fullscreen"
            title={isFullScreen ? "Exit Fullscreen (ESC)" : "Maximize 3D Globe Fullscreen"}
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
