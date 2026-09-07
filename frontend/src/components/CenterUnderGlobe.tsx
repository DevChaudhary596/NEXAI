"use client";

import React from "react";
import {
  Scan,
  GitCompare,
  Mountain,
  Leaf,
  Building2,
  Sparkles,
  ArrowRight,
  MoreVertical,
  MapPin,
  Calendar,
} from "lucide-react";
import { QuickActionKey } from "./QuickActions";
import { ProjectItem } from "./RecentProjects";

interface CenterUnderGlobeProps {
  onMetricClick: (metricKey: string) => void;
  onSelectProject: (project: ProjectItem) => void;
  onViewAll: () => void;
  onQuickAction: (actionKey: QuickActionKey) => void;
}

const METRICS_DATA = [
  {
    key: "objects",
    value: "12,432",
    label: "Objects Detected",
    change: "+12%",
    thumb: "/images/metric_ship_hd.jpg",
  },
  {
    key: "area",
    value: "3,204 km²",
    label: "Area Analyzed",
    change: "+28%",
    thumb: "/images/metric_road_hd.jpg",
  },
  {
    key: "accuracy",
    value: "97.6%",
    label: "Detection Accuracy",
    change: "+1.3%",
    thumb: "/images/metric_tanks_hd.jpg",
  },
  {
    key: "monitors",
    value: "28",
    label: "Active Monitors",
    change: "+7%",
    thumb: "/images/metric_plane_hd.jpg",
  },
];

const PROJECTS_DATA: ProjectItem[] = [
  {
    id: "mumbai-port",
    title: "Coastal Infrastructure Mapping",
    location: "Mumbai, India",
    date: "Aug 28, 2024",
    status: "Completed",
    image: "/images/mumbai_port_hd.jpg",
    coordinates: { lon: 72.8777, lat: 19.0760, height: 18000 },
    sampleQuery: "Detect and classify maritime vessels, cargo docks, and coastal structures in Mumbai Port.",
  },
  {
    id: "cal-fire",
    title: "Wildfire Impact Assessment",
    location: "California, USA",
    date: "Aug 24, 2024",
    status: "In Progress",
    image: "/images/california_wildfire_hd.jpg",
    coordinates: { lon: -121.4944, lat: 38.5816, height: 25000 },
    sampleQuery: "Analyze wildfire burn scars, smoke dispersion, and damaged terrain in Northern California.",
  },
  {
    id: "punjab-crops",
    title: "Crop Health Analysis",
    location: "Punjab, India",
    date: "Aug 20, 2024",
    status: "Completed",
    image: "/images/punjab_crops_hd.jpg",
    coordinates: { lon: 75.3412, lat: 31.1471, height: 20000 },
    sampleQuery: "Evaluate NDVI vegetative health, crop stress index, and irrigation patterns across Punjab farmland.",
  },
];

const QUICK_ACTIONS_DATA: {
  key: QuickActionKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "count_objects", label: "Count Objects", icon: Scan },
  { key: "detect_changes", label: "Detect Changes", icon: GitCompare },
  { key: "analyze_terrain", label: "Analyze Terrain", icon: Mountain },
  { key: "ndvi_vegetation", label: "NDVI Vegetation", icon: Leaf },
  { key: "track_infrastructure", label: "Track Infrastructure", icon: Building2 },
  { key: "custom_query", label: "Custom Query", icon: Sparkles },
];

export default function CenterUnderGlobe({
  onMetricClick,
  onSelectProject,
  onViewAll,
  onQuickAction,
}: CenterUnderGlobeProps) {
  return (
    <div className="native-under-globe">
      {/* ── Row 1: 4 Native Metric Cards ───────────────────────── */}
      <div className="native-metrics-grid">
        {METRICS_DATA.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onMetricClick(item.key)}
            className="native-metric-card"
          >
            {/* HD Rounded Thumbnail */}
            <div className="native-metric-card__thumb">
              <img src={item.thumb} alt={item.label} draggable={false} />
            </div>

            {/* Metric Meta */}
            <div className="native-metric-card__content">
              <div className="native-metric-card__val">{item.value}</div>
              <div className="native-metric-card__lbl">{item.label}</div>

              <div className="native-metric-card__stat-row">
                <span className="native-metric-card__pct">↑ {item.change}</span>
                {/* SVG Green Sparkline Curve */}
                <svg
                  className="native-metric-card__sparkline"
                  viewBox="0 0 60 16"
                  fill="none"
                >
                  <path
                    d="M2 12C10 12 15 4 25 8C35 12 45 3 58 5"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Row 2: Native Ivory Deck Container ─────────────────── */}
      <div className="native-ivory-deck">
        {/* Left: Recent Projects Section */}
        <div className="native-recent-projects">
          <div className="native-deck-header">
            <h3 className="native-deck-title">Recent Projects</h3>
            <button
              type="button"
              onClick={onViewAll}
              className="native-view-all-btn"
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="native-projects-grid">
            {PROJECTS_DATA.map((proj) => (
              <div
                key={proj.id}
                onClick={() => onSelectProject(proj)}
                className="native-project-card"
              >
                {/* HD Cover Image */}
                <div className="native-project-card__thumb-wrap">
                  <img
                    src={proj.image}
                    alt={proj.title}
                    className="native-project-card__img"
                    draggable={false}
                  />
                  {/* Status Pill Badge */}
                  <span
                    className={`native-status-badge ${
                      proj.status === "Completed"
                        ? "native-status-badge--completed"
                        : "native-status-badge--progress"
                    }`}
                  >
                    <span className="native-status-badge__dot" />
                    {proj.status}
                  </span>
                </div>

                {/* Project Details */}
                <div className="native-project-card__info">
                  <h4 className="native-project-card__title">{proj.title}</h4>
                  <div className="native-project-card__meta">
                    <span className="native-project-card__location">
                      <MapPin size={11} /> {proj.location}
                    </span>
                    <button
                      type="button"
                      className="native-project-card__more-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(proj);
                      }}
                    >
                      <MoreVertical size={13} />
                    </button>
                  </div>
                  <div className="native-project-card__date">
                    <Calendar size={10} /> {proj.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Quick Actions Section */}
        <div className="native-quick-actions">
          <div className="native-deck-header">
            <h3 className="native-deck-title">Quick Actions</h3>
          </div>

          <div className="native-qa-grid">
            {QUICK_ACTIONS_DATA.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onQuickAction(key)}
                className="native-qa-btn"
              >
                <div className="native-qa-btn__icon">
                  <Icon size={18} />
                </div>
                <span className="native-qa-btn__label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
