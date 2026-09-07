"use client";

import React from "react";
import { Scan, GitCompare, Mountain, Leaf, Building2, Search } from "lucide-react";

export type QuickActionKey =
  | "count_objects"
  | "detect_changes"
  | "analyze_terrain"
  | "ndvi_vegetation"
  | "track_infrastructure"
  | "custom_query";

interface QuickActionsProps {
  onActionClick: (key: QuickActionKey) => void;
}

const ACTIONS: {
  key: QuickActionKey;
  label: string;
  subLabel?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "count_objects", label: "Count", subLabel: "Objects", icon: Scan },
  { key: "detect_changes", label: "Detect", subLabel: "Changes", icon: GitCompare },
  { key: "analyze_terrain", label: "Analyze", subLabel: "Terrain", icon: Mountain },
  { key: "ndvi_vegetation", label: "NDVI", subLabel: "Vegetation", icon: Leaf },
  { key: "track_infrastructure", label: "Track", subLabel: "Infrastructure", icon: Building2 },
  { key: "custom_query", label: "Custom", subLabel: "Query", icon: Search },
];

export default function QuickActions({ onActionClick }: QuickActionsProps) {
  return (
    <div className="theme-quick-actions">
      <h3 className="theme-quick-actions__title">Quick Actions</h3>
      <div className="theme-quick-actions__grid">
        {ACTIONS.map(({ key, label, subLabel, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onActionClick(key)}
            className="theme-quick-action-btn"
            title={`${label} ${subLabel || ""}`}
          >
            <div className="theme-quick-action-icon-wrap">
              <Icon size={18} className="theme-quick-action-icon" />
            </div>
            <div className="theme-quick-action-label">
              <div>{label}</div>
              {subLabel && <div className="theme-quick-action-sub">{subLabel}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
