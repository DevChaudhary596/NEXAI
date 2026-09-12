import React from "react";
import Link from "next/link";
import SolenLogo from "@/components/SolenLogo";
import { ArrowLeft, Scale, ShieldAlert, Cpu, Satellite, FileText, CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Terms of Service — SOLEN Earth Intelligence",
  description: "Terms of Service and Acceptable Use Policy for the SOLEN autonomous geospatial intelligence platform.",
};

export default function TermsPage() {
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
            <Scale size={14} /> SOLEN MASTER TERMS OF SERVICE & ACCEPTABLE USE
          </div>
          <h1 className="solen-legal-h1">Terms of Service & Operational License</h1>
          <p className="solen-legal-meta">
            Effective Date: September 12, 2026 &bull; Version 3.4 &bull; Legal Compliance Desk
          </p>
        </div>

        {/* Content Sections */}
        <div className="solen-legal-sections">
          {/* Section 1 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <FileText size={18} style={{ color: "#F4A62A" }} /> 1. Acceptance & Contractual Binding
            </h2>
            <p>
              By accessing, querying, integrating API endpoints, or deploying instances of the SOLEN Autonomous Geospatial Intelligence Platform (&ldquo;Service&rdquo; or &ldquo;SOLEN&rdquo;), you, your government agency, or your corporate entity (&ldquo;Customer&rdquo; or &ldquo;Analyst&rdquo;) agree to be legally bound by these Terms of Service.
            </p>
            <p>
              If you do not accept these terms in their entirety, you must discontinue all API access, satellite raster queries, and geospatial telemetry sessions immediately.
            </p>
          </section>

          {/* Section 2 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Satellite size={18} style={{ color: "#38bdf8" }} /> 2. Satellite Data & Constellation Licensing
            </h2>
            <p>
              SOLEN ingests and processes Earth observation data from multiple sovereign and commercial constellations:
            </p>
            <ul>
              <li>
                <strong>Copernicus Sentinel-2 & Sentinel-1:</strong> Distributed under the European Union Copernicus Open Access policy. Free, full, and open data rights apply in accordance with Regulation (EU) No 377/2014.
              </li>
              <li>
                <strong>USGS / NASA Landsat-8/9:</strong> Public domain Earth observation imagery provided in accordance with US Geological Survey data distribution policies.
              </li>
              <li>
                <strong>Derived Intelligence Products:</strong> Customer retains full, exclusive ownership of all derived vector geometries, detection classifications, confidence intervals, and analytical briefings generated through the platform.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <ShieldAlert size={18} style={{ color: "#fb7185" }} /> 3. Acceptable Use & Strict Prohibitions
            </h2>
            <p>
              SOLEN is engineered for planetary resilience, defense domain awareness, disaster relief, maritime safety, and environmental stewardship. You agree never to use the Service for:
            </p>
            <div className="solen-legal-prohibitions">
              <div className="solen-legal-prohibitions-item">
                <span className="solen-legal-bullet">&bull;</span>
                <span>Unauthorized tracking or surveillance of individual civilian persons violating international human rights laws.</span>
              </div>
              <div className="solen-legal-prohibitions-item">
                <span className="solen-legal-bullet">&bull;</span>
                <span>Circumventing territorial airspace boundaries or sovereign orbital compliance restrictions.</span>
              </div>
              <div className="solen-legal-prohibitions-item">
                <span className="solen-legal-bullet">&bull;</span>
                <span>Reverse engineering, decompiling, or exfiltrating weights of proprietary vision-language and target detection models.</span>
              </div>
              <div className="solen-legal-prohibitions-item">
                <span className="solen-legal-bullet">&bull;</span>
                <span>Injecting malicious raster payloads designed to trigger memory exploits in STAC parsing libraries or GDAL decoders.</span>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Cpu size={18} style={{ color: "#34d399" }} /> 4. AI Inference, Reliability & Decision Support
            </h2>
            <p>
              The SOLEN Intelligence Engine provides probabilistic computer vision and multimodal reasoning. While model accuracy benchmark targets exceed 95% across evaluated test benchmarks:
            </p>
            <div className="solen-legal-alert">
              <strong>OPERATIONAL NOTICE:</strong> Computer-vision predictions (e.g., flood extent delineations, vehicle counts, vessel coordinates, and burn area perimeters) are intended as decision-support intelligence. For life-safety and emergency rescue deployments, spatial findings should be corroborated against ground telemetry and auxiliary sensor streams whenever operational conditions permit.
            </div>
          </section>

          {/* Section 5 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <CheckCircle2 size={18} style={{ color: "#F4A62A" }} /> 5. Service Level Commitments & Uptime
            </h2>
            <p>
              SOLEN enterprise infrastructure provides:
            </p>
            <ul>
              <li><strong>99.9% Uptime:</strong> For core raster ingestion, vector rendering, and intelligence query APIs.</li>
              <li><strong>Sub-4000ms Latency Targets:</strong> For edge vision-language inference passes on supported accelerator hardware.</li>
              <li><strong>Automated Failover:</strong> Multi-region STAC mirror fallback for Sentinel and Landsat catalog redundancy.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="solen-legal-card">
            <h2 className="solen-legal-card__title">
              <Scale size={18} style={{ color: "#c084fc" }} /> 6. Governing Law & Enterprise Support
            </h2>
            <p>
              These Terms shall be construed and governed in accordance with enterprise commercial law and international geospatial regulatory frameworks.
            </p>
            <div className="solen-legal-contact">
              <strong>Legal Operations & Regulatory Counsel:</strong>
              <div>
                Inquiries: <span style={{ color: "#F4A62A" }}>legal@solen.ai</span> &bull; Operations Desk: <span style={{ color: "#F4A62A" }}>operations@solen.ai</span>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom Navigation */}
        <div className="solen-legal-footer">
          <div>&copy; {new Date().getFullYear()} SOLEN. All rights reserved.</div>
          <div>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/">Command Center</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
