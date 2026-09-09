# SatQuery — Startup-Grade Feature Roadmap & Team Task Assignment
**From:** SIH prototype → production-grade Geospatial Intelligence & Multimodal Vision AI platform  
**Purpose of this doc:** Lock down the product roadmap, track what has already shipped in the real production foundation, clearly document deferred items requiring external provider accounts (alert channels, commercial imagery, SSO), and provide a clean task list to split across teammates.

---

## 1. Where You Are Today (Current System State)

You have moved completely past prototype territory. The real production foundation is implemented, compiling, and passing all automated test suites:

- **Frontend:** Next.js 16 (Turbopack), Cesium 3D globe (live orbits, ISS trajectory, day/night terminator, quick zooms, fullscreen mode), glassmorphic dismissible overlays.
- **Identity & Multi-Tenancy:** Firebase Authentication gate (Email/Password + Google OAuth) coupled with PostgreSQL tenant model (`workspaces`, `workspace_members`, `projects`, `audit_events`).
- **CV Engine:** YOLOv8-OBB + SAHI tiling for large rasters, boundary-artifact merging, per-class confidence tuning, DBSCAN hotspot clustering.
- **GIS Engine:** Deterministic NDVI/NDWI/NDBI math (zero ML hallucination), bi-temporal change detection with Otsu thresholding, GeoJSON polygon output.
- **Storage & Provenance:** S3/Cloudflare R2-backed scene, thumbnail, overlay, and SHA-256 content-hashed provenance manifests (`provenance.json`).
- **VLM Copilot:** Multi-turn memory, <4s latency budget, VRAM ceiling enforcement, guardrails for unsupported scenes, Whisper voice input, traceable provenance citations, and real Poisson counting uncertainty.
- **Geospatial Exports:** 1-click client-side export to RFC 7946 GeoJSON, OGC KML 2.2, and ESRI Shapefile ZIP (with WGS84 `.prj`).
- **Production Guard:** Server fails closed at startup if production mode is set without real PostgreSQL, S3, Firebase, or non-mock ML models.
- **Zero Dummy Data:** Removed all fabricated sample reports, fake KPI percentages, and synthetic projects.

---

## 2. Dashboard/Explore — Feature Status & Roadmap

### A. Navigation & Command Layer
| Feature | Status | Notes |
|---|---|---|
| Sidebar nav (Dashboard, Explore, Analysis, Detections, Compare, Monitor, Projects, Upload, Reports) | ✅ Shipped | Single source of truth — duplicate top links removed |
| ⌘K Command Palette | ✅ Shipped | Global geocoding and quick navigation with keyboard focus |
| Daylight/night theme, notification bell, profile avatar | ✅ Shipped | Operational in primary UI |
| **Workspace/Org switcher** | ✅ Shipped (Production Foundation) | Pinned to top bar ([WorkspaceSwitcher.tsx](file:///Users/goru/Desktop/SIH/satquery-ai/frontend/src/components/WorkspaceSwitcher.tsx)), backed by PostgreSQL `workspaces` table |
| **Role-based access (Viewer / Analyst / Reviewer / Admin)** | ✅ Shipped (Production Foundation) | Enforced server-side in `auth.py` and `platform.py`; active role visible in switcher |
| **Usage/credits indicator in top bar** | 🆕 Future (P1) | Meter compute (tiling, VLM calls) once commercial pricing tiers are finalized |

### B. 3D Earth / Operations Deck
| Feature | Status | Notes |
|---|---|---|
| Cesium globe, live orbits, ISS trajectory, day/night terminator | ✅ Shipped | Core spatial differentiator |
| Quick zooms (SFO, JFK, Heathrow, Haneda, Dubai, Delhi IGI) | ✅ Shipped | High-altitude to runway camera transitions |
| Fullscreen mode, dismissible overlay | ✅ Shipped | Space orbit reset and escape controls |
| **Next-overpass predictor per AOI** | 🆕 Future (P1) | "Sentinel-2 passes over this AOI in 14h 22m" based on orbital mechanics |
| **Multi-constellation toggle** (Sentinel-2 / Landsat / custom drone feed) | 🆕 Future (P1) | Cross-sensor optical alignment for defense/agriculture |
| **Commercial tasking request workflow** (Planet, Maxar) | ⏸️ Deferred | **Requires commercial imagery provider contract / API keys** (leave until provider selected) |

### C. Live Metrics (Stat Cards)
| Feature | Status | Notes |
|---|---|---|
| 4 stat cards with drill-down modals | ✅ Shipped | Grounded in actual raster metrics |
| **Real computed metrics (Zero-dummy KPI)** | ✅ Shipped (Production Foundation) | Live object counts, measured area in km², honest "Not validated" state instead of fabricated 98% accuracy |
| **User-pinnable KPI cards** | 🆕 Future (P1) | Allow analysts to customize dashboard stat cards per workspace |

### D. Projects
| Feature | Status | Notes |
|---|---|---|
| Project cards mounting real GeoTIFF + live inference | ✅ Shipped | Direct raster ingestion and computation |
| **Project templates** (Flood Response, Crop Monitoring, Maritime, Border, Custom) | ✅ Shipped (Production Foundation) | Enforced in PostgreSQL schema and UI deck selector |
| **Classification labeling** (Unclassified, Restricted, Confidential) | ✅ Shipped (Production Foundation) | Stored per workspace and project, visible in UI |
| **Audit trail / version history** | ✅ Shipped (Production Foundation) | Immutable `audit_events` table in PostgreSQL recording all mutations |
| **Collaborative annotation & review** | 🆕 Future (P1) | Multi-analyst comment threads on bounding boxes and polygons |

### E. Quick Actions
| Feature | Status | Notes |
|---|---|---|
| Upload Scene, Count Objects, Detect Changes, Analyze Terrain, NDVI Vegetation, Track Infra | ✅ Shipped | Operational with real pipeline execution |
| **Flood / NDWI Extent action** | ✅ Shipped (Production Foundation) | Dedicated quick action pill in UI prefilling NDWI water-mask prompts |
| **Export to GIS (GeoJSON / KML / Shapefile ZIP)** | ✅ Shipped (Production Foundation) | Client-side export engine in [gisExport.ts](file:///Users/goru/Desktop/SIH/satquery-ai/frontend/src/lib/gisExport.ts) via `@mapbox/shp-write` |
| **Cross-Constellation Compare** | 🆕 Future (P1) | Co-register Sentinel-2 vs Landsat passes for dual-satellite verification |

### F. AI Copilot
| Feature | Status | Notes |
|---|---|---|
| Multi-turn memory, Whisper voice input, scenario prompts, follow-up pills | ✅ Shipped | Bounded context memory and sub-4s latency |
| **Source & provenance citation card** | ✅ Shipped (Production Foundation) | Collapsible details exposing Scene ID, capture date, input bands, analysis method, and SHA-256 hash |
| **Uncertainty bands on quantitative answers** | ✅ Shipped (Production Foundation) | Real Poisson counting intervals ($\text{count} \pm \sqrt{\text{count}}$) with explicit statistical caveats |
| **Shareable Answer Cards** | 🆕 Future (P2) | Export single copilot answer card to PNG / PDF / webhook |
| **Multi-language copilot** (Hindi, regional languages) | 🆕 Future (P2) | Multilingual prompts for regional disaster teams |

### G. Monitor / Watches & Alerts
| Feature | Status | Notes |
|---|---|---|
| Persistent AOI watches, alert drawer | ✅ Shipped | Periodic Sentinel-2 pass detection |
| **Alert routing channels** (Email / SMS / Slack / Webhooks) | ⏸️ Deferred | **Requires external notification provider** (Resend, SendGrid, Twilio, Slack App). Leave until provider credentials chosen. |
| **Alert acknowledgment & assignment** | 🆕 Future (P1) | Workflow state: triage, assign to teammate, mark resolved |

### H. Data Library & Storage
| Feature | Status | Notes |
|---|---|---|
| GeoTIFF dropzone, STAC ingest from Copernicus / Planetary Computer | ✅ Shipped | Live STAC search and tile fetch |
| **S3 / Cloudflare R2 object storage** | ✅ Shipped (Production Foundation) | Automatic remote synchronization of rasters, thumbnails, overlays, and manifests |
| **Data provenance / chain-of-custody logging** | ✅ Shipped (Production Foundation) | Content-addressed `provenance.json` with SHA-256 verification |
| **Scheduled recurring ingestion** | 🆕 Future (P1) | Automatic background fetch of newest Sentinel-2 passes over active watches |

### I. Reports
| Feature | Status | Notes |
|---|---|---|
| Reports navigation and view | ✅ Shipped | Clean layout with zero fake reports |
| **Zero-fabricated report policy** | ✅ Shipped (Production Foundation) | Dummy dossiers removed; reports generate strictly from completed analyses |
| **Report builder with branded templates** | 🆕 Future (P1) | Export official PDF intelligence dossiers with org letterhead and maps |
| **Scheduled report auto-delivery** | ⏸️ Deferred | **Requires email provider** (leave with alert channels) |

---

## 3. Startup-Critical Cross-Cutting Features

- **Multi-Tenant Workspace Architecture:** ✅ Shipped (PostgreSQL `workspaces` + `workspace_members` with foreign-key cascades).
- **RBAC Enforcement:** ✅ Shipped (`viewer` / `analyst` / `reviewer` / `admin` roles enforced in API dependencies).
- **Audit Logging:** ✅ Shipped (`audit_events` recording actor UID, event type, resource ID, and JSON metadata).
- **Strict Production Guard:** ✅ Shipped (`validate_runtime()` refuses to boot with mock AI or missing cloud credentials in production).
- **Data Classification Labeling:** ✅ Shipped (`unclassified` / `restricted` / `confidential` on workspaces and projects).
- **SSO / SAML:** ⏸️ Deferred (Requires enterprise customer IdP selection: Okta / Microsoft Entra / Ping).
- **Alert Delivery Channels:** ⏸️ Deferred (Requires notification provider: Resend / Twilio / Slack).
- **Commercial Imagery Tasking:** ⏸️ Deferred (Requires commercial provider contract: Planet / Maxar / Airbus).
- **On-Prem / Sovereign-Cloud Packaging:** 🆕 Future (P1) (Docker Compose / Helm chart for air-gapped deployment).
- **Accessibility (WCAG) Pass:** 🆕 Future (P1) (Screen-reader audit, high-contrast focus rings).

---

## 4. ISRO / Government-Specific Additions

- **Classification/sensitivity labeling:** ✅ Shipped (Tiered access tags on all workspace projects).
- **OGC-standard GIS exports:** ✅ Shipped (Standard GeoJSON, KML, and ESRI Shapefile with WGS84 projection).
- **ISO 19115-compliant metadata:** 🆕 Future (P1) (Formal XML metadata envelope on exported datasets).
- **Bhuvan / NRSC catalog integration:** ⏸️ Deferred (Requires official ISRO Open Data / Bhuvan API credentials).
- **National Geospatial Policy (2022) compliance review:** 🆕 Future (P1) (Verify spatial resolution thresholds and data retention policies).

---

## 5. Team Task Assignment — Ready to Split Across Teammates

### ✅ Already Completed & Shipped (Production Foundation)
- [x] **Remove duplicate top-nav & establish single IA** (Cleaned up in `TopNav.tsx` and `page.tsx`)
- [x] **Workspace & Org Switcher UI** (`WorkspaceSwitcher.tsx` with modal, role display, and creation form)
- [x] **PostgreSQL Multi-Tenant Model** (`workspaces`, `workspace_members`, `projects`, `audit_events`)
- [x] **Server-Side RBAC Layer** (`auth.py` and `platform.py` enforcing `viewer`/`analyst`/`reviewer`/`admin`)
- [x] **S3 / Cloudflare R2 Remote Storage** (`storage.py` S3 client with SHA-256 provenance logging)
- [x] **Copilot Provenance & Uncertainty Display** (`orchestrator.py` + `AIAssistantPanel.tsx` metadata card)
- [x] **Real GIS Exports** (`gisExport.ts` client-side Shapefile ZIP, GeoJSON, and KML generation)
- [x] **Flood / NDWI Quick Action** (`QuickActions.tsx` and `CenterUnderGlobe.tsx` routing)
- [x] **Strict Production Config Guard** (`config.py` `validate_runtime()` fail-closed mechanism)
- [x] **Clean Up Dummy Reports & Mock KPI Cards** (Removed all fake data and hardcoded sample metrics)
- [x] **Deployment Documentation & Environment Templates** (`PRODUCTION_SETUP.md`, `.env.example`, `.env.local.example`)

---

### ⏸️ Explicitly Deferred (Requires Third-Party Provider Decisions)
*Do not build working UI controls until real provider credentials and agreements are selected:*
1. **Alert Notification Channels:** Email (Resend/SendGrid), SMS (Twilio), Slack Webhooks.
2. **Commercial Satellite Tasking:** Planet Labs, Maxar, or commercial drone API contracts.
3. **Enterprise SSO / SAML:** Okta, Azure AD / Entra ID, PingIdentity.
4. **Bhuvan / NRSC Integration:** Official ISRO geoportal API keys.

---

### 🚀 Active Next Tasks for Teammates (P1 & P2)

#### Teammate 1: Frontend & User Experience (P1)
- [ ] **Customizable / Pinnable KPI Cards:** Allow analysts to pin favorite metrics (e.g. active watches, recent detections) to their home deck.
- [ ] **Collaborative Annotation UI:** Comment threads on detected bounding boxes and drawn ROIs.
- [ ] **Accessibility (WCAG 2.1 AA) Audit:** Keyboard focus navigation, aria-live announcements for globe state changes.

#### Teammate 2: Backend & Data Workflows (P1)
- [ ] **Scheduled Recurring Ingestion:** Cron loop to automatically fetch newest Sentinel-2 passes for all active watches.
- [ ] **Alert Workflow Operations:** In-app alert triage, assigning an alert to a specific analyst UID, marking as resolved.
- [ ] **Usage Metering Hooks:** Count tile requests and VLM tokens per workspace for billing readiness.

#### Teammate 3: Geospatial & ML Engineering (P1 & P2)
- [ ] **Next-Overpass Predictor:** Compute next Sentinel-2 satellite pass time over any selected bounding box using two-line element (TLE) ephemeris.
- [ ] **Cross-Constellation Compare (P1):** Co-register Sentinel-2 and Landsat-8/9 passes over the same AOI to verify change detections.
- [ ] **ISO 19115 XML Export (P1):** Generate compliant geospatial metadata XML alongside the Shapefile ZIP export.

#### Teammate 4: DevOps, Packaging & Reporting (P1 & P2)
- [ ] **Report Dossier Builder (P1):** Automated PDF generation compiling map screenshots, detection tables, and provenance hashes with org letterhead.
- [ ] **Docker Compose / Sovereign Deployment (P1):** Full containerized deployment bundle (PostgreSQL + MinIO + FastAPI + Next.js) for sovereign on-prem client trials.
- [ ] **Shareable Answer Card Export (P2):** One-click export of a copilot answer to branded PNG image card.
