"use client";

import React from "react";
import { Scan, GitCompare, Mountain, Leaf, Building2, Search, UploadCloud, Lock } from "lucide-react";

export type QuickActionKey =
  | "count_objects"
  | "detect_changes"
  | "analyze_terrain"
  | "ndvi_vegetation"
  | "ndwi_flood_extent"
  | "track_infrastructure"
  | "upload_scene"
  | "custom_query";

interface QuickActionsProps {
  onActionClick: (key: QuickActionKey) => void;
}

const ACTIONS: {
  key: QuickActionKey;
  label: string;
  subLabel?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  locked?: boolean;
}[] = [
  { key: "upload_scene", label: "Upload", subLabel: "GeoTIFF", icon: UploadCloud },
  { key: "count_objects", label: "Count", subLabel: "Objects", icon: Scan },
  { key: "detect_changes", label: "Detect", subLabel: "Changes", icon: GitCompare, locked: true },
  { key: "analyze_terrain", label: "Analyze", subLabel: "Terrain", icon: Mountain },
  { key: "ndvi_vegetation", label: "NDVI", subLabel: "Vegetation", icon: Leaf },
  { key: "ndwi_flood_extent", label: "Flood", subLabel: "NDWI Extent", icon: Scan },
  { key: "track_infrastructure", label: "Track", subLabel: "Infrastructure", icon: Building2 },
];

export default function QuickActions({ onActionClick }: QuickActionsProps) {
  return (
    <div className="theme-quick-actions">
      <h3 className="theme-quick-actions__title">Quick Actions</h3>
      <div className="theme-quick-actions__grid">
        {ACTIONS.map(({ key, label, subLabel, icon: Icon, locked }) => (
          <button
            key={key}
            onClick={() => onActionClick(key)}
            className={`theme-quick-action-btn ${locked ? "theme-quick-action-btn--locked" : ""}`}
            title={locked ? `${label} ${subLabel || ""} (Coming Soon — Locked)` : `${label} ${subLabel || ""}`}
          >
            <div className="theme-quick-action-icon-wrap">
              <Icon size={18} className="theme-quick-action-icon" />
              {locked && <Lock size={11} className="theme-quick-action-lock" />}
            </div>
            <div className="theme-quick-action-label">
              <div className="flex items-center gap-1 justify-center">
                <span>{label}</span>
                {locked && <span className="theme-quick-action-soon">Soon</span>}
              </div>
              {subLabel && <div className="theme-quick-action-sub">{subLabel}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
