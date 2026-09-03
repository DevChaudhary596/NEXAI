# SatQuery AI — 3-Minute Live Pitch Master Script (180s)

**Target Time:** Exactly 2 Minutes 50 Seconds (10 Seconds buffer for jury transition)  
**SIH Problem Statement:** **SIH26167 (ISRO)** — *SatQuery AI: Vision-Language Assistant for Remote Sensing*  
**Team Allocation:** Coordinated 6-member presentation cue sheet  

---

## ⏱️ Timeline Cue Sheet & Speaker Allocations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       3-MINUTE MASTER PITCH TIMELINE                        │
├───────────────┬───────────────────────────────┬─────────────────────────────┤
│ Timestamp     │ Stage & Topic                 │ Primary Speaker & Action    │
├───────────────┼───────────────────────────────┼─────────────────────────────┤
│ 00:00 — 00:25 │ Hook, Problem & Mandate       │ Member 1 (Lead Architect)   │
│ 00:25 — 00:55 │ Why LLMs Fail & Our Solution  │ Member 6 (QA Lead)          │
│ 00:55 — 01:25 │ System Architecture & Slicing │ Member 2 (CV Lead)          │
│ 01:25 — 01:55 │ GIS Math & Live Demo Query 1  │ Member 3 (GIS) & M4 (UI)    │
│ 01:55 — 02:25 │ Benchmarks & Zero-GPU Profiling│ Member 5 (API) & M6 (QA)   │
│ 02:25 — 02:50 │ National Impact & Conclusion  │ Member 1 (Lead Architect)   │
│ 02:50 — 03:00 │ Buffer & Handoff to Jury Q&A  │ Full Team Ready             │
└───────────────┴───────────────────────────────┴─────────────────────────────┘
```

---

### Act 1: The Hook & The Problem (00:00 — 00:25)
**Slide 1 & Slide 2**  
**Speaker:** **Member 1 (Lead / System Architect)**  
**Screen Action:** Displays Slide 1 (Title), then clicks to Slide 2 (The Problem in Numbers).

> *"Respected jury and ISRO scientists, India receives over 15 Terabytes of satellite imagery daily. Yet during the Assam floods, emergency responders must wait 4 to 12 hours for manual GIS digitization. When an NDRF commander needs to know how many roads are submerged, or a district collector needs drought parcel boundaries, they cannot wait for complex QGIS workflows.  
> Today, we present **SatQuery AI**: an edge-ready, zero-cost vision-language assistant that turns natural English queries into real-time geospatial vector intelligence in under 4 seconds."*

---

### Act 2: Why Generic AI Fails & Our Decoupled Solution (00:25 — 00:55)
**Slide 3 & Slide 5**  
**Speaker:** **Member 6 (QA Benchmarking & Pitch Lead)**  
**Screen Action:** Displays Slide 3 (Decoupled Engine) and highlights Competitive Matrix on Slide 5.

> *"Why not just use GPT-4V or a cloud vision LLM? Because generic multimodal models **hallucinate**. When you ask a vision LLM to count aircraft or storage tanks from compressed pixels, it estimates visually—producing up to 80% numerical error. In disaster management and defense, hallucinated numbers cost lives.  
> Our breakthrough is **architectural decoupling**. In SatQuery AI, the language model is strictly an **Intent Router**—it never estimates numbers. Real numbers come from deterministic, CPU-optimized Computer Vision and multi-spectral GIS engines. It is mathematically impossible for SatQuery AI to hallucinate an object count."*

---

### Act 3: Architecture, SAHI Slicing & Physics Awareness (00:55 — 01:25)
**Slide 4**  
**Speaker:** **Member 2 (Geospatial CV Lead)**  
**Screen Action:** Displays Slide 4 (Mermaid Architecture Flowchart), pointing to M2 and M3 core blocks.

> *"Here is how our engine executes in milliseconds on commodity CPUs. When a prompt arrives, M1's Intent Router classifies it in 7 milliseconds.  
> For object detection, satellite scenes are massive—often 4,000 by 4,000 pixels. Our pipeline uses **SAHI patch slicing** into 640-pixel windows, running **YOLOv8n Oriented Bounding Boxes (OBB)** on CPU. Standard horizontal boxes capture 70% background noise; our rotated boxes align tightly with aircraft and ships.  
> Crucially, our detector is **physics-aware**: it enforces Sentinel-2 10-meter ground resolution constraints, refusing to hallucinate sub-pixel targets where satellite physics forbids it."*

---

### Act 4: Live Demonstration & GIS Vectorization (01:25 — 01:55)
**Live Interface Demo (M4 Next.js UI)**  
**Speaker:** **Member 3 (GIS Lead)** with **Member 4 (Frontend Lead)** operating the UI.  
**Screen Action:** M4 switches browser to live Next.js map, selects scene `disaster_01_kaziranga_flood.tif`, and types:  
*`"Calculate NDWI and show flooded areas in Kaziranga"`*  
Hits Enter $\to$ In 380 ms, transparent blue water polygons overlay the map and chat prints:  
`"Flooded Surface Area: 0.35 km² (42.5% inundation)"`.

> *(Member 3 speaks while M4 executes):*  
> *"Watch our live system in action. Member 4 has loaded a Sentinel-2 scene of Kaziranga. We type: 'Calculate NDWI and show flooded areas'.  
> Instantly, in **380 milliseconds**, our vectorized NumPy engine computes normalized difference water indices, polygonizes the mask using Shapely and Rasterio, and projects the boundaries into real-world WGS84 GPS coordinates. Notice the chat: exact area—0.35 square kilometers—computed from pixel geometry, not an AI hallucination."*

---

### Act 5: Empirical Benchmarks & Feasibility (01:55 — 02:25)
**Slide 6 & Slide 8**  
**Speaker:** **Member 5 (Backend Lead)** & **Member 6 (QA Lead)**  
**Screen Action:** Switches to Slide 6 (Benchmark Scorecard) and Slide 8 (36-Hour Plan).

> *(Member 5):*  
> *"Our FastAPI backend serves XYZ map tiles, manages async worker queues, and is backed by a 100% passing test suite across 31 continuous integration tests."*  
>  
> *(Member 6):*  
> *"We stress-tested the entire platform on a **50-Query Benchmark Matrix** across urban, disaster, and agricultural tracks.  
> The results: Average routing latency is **7.59 milliseconds**. Full pipeline execution completes in **~350 to 650 milliseconds**—well below the SIH 4-second ceiling. Peak resident RAM is just **70.8 Megabytes**, running entirely on commodity CPUs with **zero GPU dependency**."*

---

### Act 6: National Impact & Conclusion (02:25 — 02:50)
**Slide 7 & Slide 10**  
**Speaker:** **Member 1 (Lead / System Architect)**  
**Screen Action:** Switches to Slide 7 (National Impact) and concludes on Slide 10.

> *"The national impact for India is immediate. For **NDRF disaster relief**, flood extent mapping drops from 8 hours to under 4 seconds. For **PM Fasal Bima**, agricultural drought parcels are vectorized automatically. And for **defense and port authorities**, container vessels and airfields are tracked autonomously.  
> SatQuery AI delivers conversational simplicity backed by mathematical certainty—built by Indian engineers, ready for ISRO, and deployable today.  
> Thank you, and we welcome your questions."*

---

### Buffer & Transition to Jury Q&A (02:50 — 03:00)
- **All Team Members Stand Ready:**
  - VLM & Intent routing questions $\to$ **Member 1**
  - YOLO-OBB, SAHI & Physics constraints $\to$ **Member 2**
  - Rasterio, NDVI/NDWI & Coordinate transforms $\to$ **Member 3**
  - Leaflet map, GeoJSON layer stack & UI $\to$ **Member 4**
  - FastAPI endpoints, tile streaming & async tasks $\to$ **Member 5**
  - Benchmark metrics, latency, RAM & rubric compliance $\to$ **Member 6**
