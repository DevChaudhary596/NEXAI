"use client";

import React from "react";
import Link from "next/link";
import CookieConsent from "@/components/CookieConsent";
import SolenLogo from "@/components/SolenLogo";

export default function FooterBar() {
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
      <nav className="theme-footer__legal" aria-label="Legal">
        <button type="button" onClick={() => window.dispatchEvent(new Event("solen:cookie-settings"))}>Cookie settings</button>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
      <CookieConsent />
    </footer>
  );
}
