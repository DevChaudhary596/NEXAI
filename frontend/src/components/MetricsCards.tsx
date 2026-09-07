"use client";

import React from "react";
import { TrendingUp } from "lucide-react";

interface MetricsCardsProps {
  onCardClick?: (metricKey: string) => void;
}

const METRICS = [
  {
    key: "objects",
    value: "12,432",
    label: "Objects Detected",
    change: "+12%",
    trendUp: true,
    image: "/images/exact_metric_ship.jpg",
  },
  {
    key: "area",
    value: "3,204 km²",
    label: "Area Analyzed",
    change: "+28%",
    trendUp: true,
    image: "/images/exact_metric_interchange.jpg",
  },
  {
    key: "accuracy",
    value: "97.6%",
    label: "Detection Accuracy",
    change: "+1.3%",
    trendUp: true,
    image: "/images/exact_metric_tanks.jpg",
  },
  {
    key: "monitors",
    value: "28",
    label: "Active Monitors",
    change: "+7%",
    trendUp: true,
    image: "/images/exact_metric_plane.jpg",
  },
];

export default function MetricsCards({ onCardClick }: MetricsCardsProps) {
  return (
    <div className="theme-metrics-grid">
      {METRICS.map((metric) => (
        <button
          key={metric.key}
          onClick={() => onCardClick?.(metric.key)}
          className="theme-metric-card"
          title={`Click to view ${metric.label} details`}
        >
          <div className="theme-metric-card__thumb">
            <img src={metric.image} alt={metric.label} className="theme-metric-card__img" />
          </div>
          <div className="theme-metric-card__content">
            <div className="theme-metric-card__value">{metric.value}</div>
            <div className="theme-metric-card__label">{metric.label}</div>
            <div className="theme-metric-card__footer">
              <span className="theme-metric-card__change">
                <TrendingUp size={11} className="theme-metric-card__trend-icon" />
                {metric.change}
              </span>
              {/* Minimal SVG Sparkline */}
              <svg className="theme-metric-card__sparkline" viewBox="0 0 48 16" fill="none">
                <path
                  d="M0 12C8 12 12 6 20 8C28 10 32 3 48 2"
                  stroke="#34d399"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
