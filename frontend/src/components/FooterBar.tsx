"use client";

import React from "react";

export default function FooterBar() {
  return (
    <footer className="theme-footer">
      {/* Brand & Slogan */}
      <div className="theme-footer__brand">
        <div className="theme-footer__logo-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#94a3b8" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="3" fill="#22d3ee" />
          </svg>
        </div>
        <div>
          <span className="theme-footer__title">SatQuery</span>
          <span className="theme-footer__sub">Geospatial Intelligence for a More Resilient World.</span>
        </div>
      </div>

      {/* Stats Cluster (Matching theme.jpg) */}
      <div className="theme-footer__stats">
        <div className="theme-footer__stat-item">
          <span className="theme-footer__stat-num">7+</span>
          <span className="theme-footer__stat-lbl">Satellite Sources</span>
        </div>
        <div className="theme-footer__stat-item">
          <span className="theme-footer__stat-num">Global</span>
          <span className="theme-footer__stat-lbl">Coverage</span>
        </div>
        <div className="theme-footer__stat-item">
          <span className="theme-footer__stat-num">AI</span>
          <span className="theme-footer__stat-lbl">Analytics</span>
        </div>
        <div className="theme-footer__stat-item">
          <span className="theme-footer__stat-num">Real-World</span>
          <span className="theme-footer__stat-lbl">Impact</span>
        </div>
      </div>
    </footer>
  );
}
