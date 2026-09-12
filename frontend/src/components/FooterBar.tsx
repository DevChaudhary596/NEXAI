"use client";

import React from "react";
import Link from "next/link";
import CookieConsent from "@/components/CookieConsent";
import SolenLogo from "@/components/SolenLogo";

interface FooterBarProps {
  onStatClick?: (key: "satellites" | "coverage" | "analytics" | "impact") => void;
}

export default function FooterBar({ onStatClick }: FooterBarProps) {
  return (
    <footer className="theme-footer">
      {/* Brand & Slogan */}
      <div className="theme-footer__brand">
        <div className="theme-footer__logo-icon">
          <SolenLogo variant="dark" />
        </div>
        <div>
          <span className="theme-footer__title">SOLEN</span>
          <span className="theme-footer__sub">Geospatial Intelligence for a More Resilient World.</span>
        </div>
      </div>

      {/* Stats Cluster (Interactive Live Metrics) */}
      <div className="theme-footer__stats" role="toolbar" aria-label="Constellation & Analytics Telemetry">
        <button
          type="button"
          className="theme-footer__stat-item theme-footer__stat-item--interactive"
          onClick={() => onStatClick?.("satellites")}
          title="Click to view multi-constellation satellite feeds & telemetry"
          aria-label="7+ Satellite Sources: View telemetry and live sensor feeds"
        >
          <span className="theme-footer__stat-badge-dot theme-footer__stat-badge-dot--cyan" aria-hidden="true" />
          <span className="theme-footer__stat-num">7+</span>
          <span className="theme-footer__stat-lbl">Satellite Sources</span>
        </button>

        <button
          type="button"
          className="theme-footer__stat-item theme-footer__stat-item--interactive"
          onClick={() => onStatClick?.("coverage")}
          title="Click to inspect planetary coverage & orbital parameters"
          aria-label="Global Coverage: Inspect planetary telemetry and orbit"
        >
          <span className="theme-footer__stat-badge-dot theme-footer__stat-badge-dot--emerald" aria-hidden="true" />
          <span className="theme-footer__stat-num">Global</span>
          <span className="theme-footer__stat-lbl">Coverage</span>
        </button>

        <button
          type="button"
          className="theme-footer__stat-item theme-footer__stat-item--interactive"
          onClick={() => onStatClick?.("analytics")}
          title="Click to view AI Vision & Spectral Analytics benchmarks"
          aria-label="AI Analytics: View model benchmarks and inference engine"
        >
          <span className="theme-footer__stat-badge-dot theme-footer__stat-badge-dot--purple" aria-hidden="true" />
          <span className="theme-footer__stat-num">AI</span>
          <span className="theme-footer__stat-lbl">Analytics</span>
        </button>

        <button
          type="button"
          className="theme-footer__stat-item theme-footer__stat-item--interactive"
          onClick={() => onStatClick?.("impact")}
          title="Click to view Real-World Crisis Deployments & Missions"
          aria-label="Real-World Impact: View mission dossiers and crisis response"
        >
          <span className="theme-footer__stat-badge-dot theme-footer__stat-badge-dot--amber" aria-hidden="true" />
          <span className="theme-footer__stat-num">Real-World</span>
          <span className="theme-footer__stat-lbl">Impact</span>
        </button>
      </div>
      <nav className="theme-footer__legal" aria-label="Legal">
        <button type="button" onClick={() => window.dispatchEvent(new Event("solen:cookie-settings"))}>Cookie settings</button>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
      <CookieConsent />
    </footer>
  );
}
