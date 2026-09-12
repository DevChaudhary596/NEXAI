import React from "react";
import Link from "next/link";
import SolenLogo from "@/components/SolenLogo";
import { ArrowLeft, Shield, Lock, Eye, Database, FileCheck, Cookie, Globe } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — SOLEN Earth Intelligence",
  description: "Data governance, satellite imagery privacy, and confidentiality charter for the SOLEN autonomous geospatial platform.",
};

export default function PrivacyPage() {
  return (
    <div className="solen-legal-page">
      {/* Top Header */}
      <header className="solen-legal-header">
        <div className="solen-legal-header__inner">
          <Link href="/" className="solen-legal-header__brand">
            <SolenLogo variant="icon" decorative />
            <div>
              <span className="solen-legal-header__title">SOLEN</span>
              <span className="solen-legal-header__sub">GEOSPATIAL INTELLIGENCE</span>
            </div>
          </Link>
          <Link
            href="/"
            className="solen-legal-header__back-btn"
          >
            <ArrowLeft size={14} /> Back to Command Center
          </Link>
        </div>
      </header>

      {/* Hero Banner */}
      <main className="solen-legal-container">
        <div className="solen-legal-banner">
          <div className="solen-legal-badge">
            <Shield size={14} /> SOLEN DATA GOVERNANCE & PRIVACY CHARTER
          </div>
          <h1 className="solen-legal-h1">Privacy Policy & Data Security</h1>
          <p className="solen-legal-meta">
            Effective Date: September 12, 2026 &bull; Version 3.4 &bull; Security Classification: Public
          </p>
        </div>

        {/* Content Sections */}
        <div className="solen-legal-sections">
          {/* Section 1 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Globe size={18} style={{ color: "#F4A62A" }} /> 1. Overview & Platform Mission
            </h2>
            <p>
              SOLEN (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;the Platform&rdquo;) is an enterprise-grade autonomous Earth observation and geospatial intelligence platform. We provide multispectral raster ingestion, deep vision-language remote sensing analysis, automated target detection (vessels, vehicles, aircraft, infrastructure), and bi-temporal spectral environmental index calculation (NDVI, NDWI, NBR).
            </p>
            <p>
              This Privacy Policy establishes our uncompromising commitment to operational security, satellite data provenance, cryptographic chain-of-custody, and customer confidentiality across defense, maritime, civil protection, and commercial domains.
            </p>
          </section>

          {/* Section 2 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Database size={18} style={{ color: "#38bdf8" }} /> 2. Information We Collect & Ingest
            </h2>
            <p>
              To deliver high-fidelity spatial analysis, SOLEN collects and processes the following telemetry and analytical inputs:
            </p>
            <ul>
              <li>
                <strong>Earth Observation Rasters:</strong> Sentinel-2 L2A BOA, Landsat-8/9, MODIS, and synthetic aperture radar (SAR) granules acquired via public STAC catalogs or user-uploaded Cloud-Optimized GeoTIFFs (COG).
              </li>
              <li>
                <strong>Geospatial Regions of Interest (ROI):</strong> Polygon bounding coordinates, geo-point queries, and vector layers uploaded by analysts to define surveillance corridors.
              </li>
              <li>
                <strong>Surveillance Trigger Specifications:</strong> Spectral threshold rules, flood extent masks, and automated alert parameters configured in the monitoring module.
              </li>
              <li>
                <strong>Workspace Identity & Access Logs:</strong> Organization identifiers, analyst credentials, cryptographic session tokens, and IP audit trails required for multi-tenant workspace isolation.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Lock size={18} style={{ color: "#34d399" }} /> 3. Data Isolation & Air-Gapped Model Inference
            </h2>
            <p>
              SOLEN implements strict tenant isolation and model privacy:
            </p>
            <div className="solen-legal-grid">
              <div className="solen-legal-subcard">
                <h4>Zero Third-Party Training</h4>
                <p>
                  Your satellite rasters, coordinates, target annotations, and intelligence queries are never used to train public machine learning models.
                </p>
              </div>
              <div className="solen-legal-subcard">
                <h4>Ephemeral Processing Enclaves</h4>
                <p>
                  Spectral calculations and model inference run in stateless containerized micro-enclaves. Raw scene matrices are purged from volatile memory post-analysis.
                </p>
              </div>
              <div className="solen-legal-subcard">
                <h4>On-Premise & Sovereign Deployments</h4>
                <p>
                  For defense and high-assurance customers, SOLEN offers fully air-gapped, zero-egress hardware appliance deployment configurations.
                </p>
              </div>
              <div className="solen-legal-subcard">
                <h4>End-to-End Encryption</h4>
                <p>
                  All raster streams and analytical telemetry are encrypted with TLS 1.3 in transit and AES-256-GCM at rest.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <FileCheck size={18} style={{ color: "#F4A62A" }} /> 4. Cryptographic Provenance & Chain of Custody
            </h2>
            <p>
              Every exported intelligence card, GeoJSON layer, and PDF dossier generated by SOLEN contains an immutable cryptographic provenance record:
            </p>
            <ul>
              <li>
                <strong>SHA-256 Digest:</strong> Unique mathematical hash calculated from the raw source raster at the moment of ingest.
              </li>
              <li>
                <strong>Sensor Metrology:</strong> Satellite identifier, spectral bands used (e.g., B03, B08, B11), GSD resolution, and sun elevation angle.
              </li>
              <li>
                <strong>Model Calibration:</strong> Exact model version, execution latency, and uncertainty confidence bounds (90% CI).
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Cookie size={18} style={{ color: "#fbbf24" }} /> 5. Cookies & Local Browser Storage
            </h2>
            <p>
              SOLEN uses strictly necessary local browser storage for mission operations:
            </p>
            <div className="solen-legal-prohibitions" style={{ borderColor: "rgba(244, 166, 42, 0.25)" }}>
              <div>
                <strong style={{ color: "#F4A62A" }}>solen.cookie-consent:</strong> Stores your essential cookie preferences and prevents repetitive prompts.
              </div>
              <div>
                <strong style={{ color: "#F4A62A" }}>solen.active-workspace:</strong> Preserves the active workspace identifier across navigation.
              </div>
              <div>
                <strong style={{ color: "#F4A62A" }}>solen.pinned-kpis:</strong> Caches analyst dashboard pin preferences on your local device.
              </div>
              <div>
                <strong style={{ color: "#F4A62A" }}>solen_theme:</strong> Day/Night display configuration (dark or light mode).
              </div>
            </div>
            <p style={{ marginTop: "12px", fontSize: "12px", color: "#94a3b8" }}>
              You can adjust or revoke your cookie settings at any time using the &ldquo;Cookie settings&rdquo; button in the footer bar.
            </p>
          </section>

          {/* Section 6 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Eye size={18} style={{ color: "#60a5fa" }} /> 6. Analyst Rights & Contact
            </h2>
            <p>
              Under applicable international data protection regulations (including GDPR and sovereign cloud guidelines), enterprise analysts retain the right to:
            </p>
            <ul>
              <li>Export full intelligence logs and query records in JSON, PDF, or ISO 19115 XML format.</li>
              <li>Request immediate purging of uploaded scene rasters and derived cache layers.</li>
              <li>Audit system access records for compliance verification.</li>
            </ul>
            <div className="solen-legal-contact">
              <strong>Data Protection & Governance Contact:</strong>
              <div>
                Email: <span style={{ color: "#F4A62A" }}>privacy@solen.ai</span> &bull; Security Desk: <span style={{ color: "#F4A62A" }}>security@solen.ai</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer info */}
        <div className="solen-legal-footer">
          <div>&copy; {new Date().getFullYear()} SOLEN. All rights reserved.</div>
          <div>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/">Command Center</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
