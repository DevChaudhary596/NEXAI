# QA & Evaluation Module (SatQuery AI — SIH26167)

**Lead:** Member 6 (QA Benchmarking & Pitch Lead)  
**Problem Statement:** **SIH26167 (ISRO)** — *SatQuery AI: Vision-Language Assistant for Remote Sensing*  
**Hardware Profile:** 100% Commodity CPU-only (Streamlit / PyTest / Python)  
**Status:** ✅ Production Ready & Formally Signed Off  

---

## 📋 Module Overview & Deliverables Map

The `qa_eval/` module provides end-to-end quality assurance, empirical benchmarking, hardware profiling, failure analysis, and presentation materials for the SatQuery AI platform.

```
qa_eval/
├── MEMBER_6_TASK_SHEET.md            # Comprehensive audit of Member 6 tasks vs Master Schedule
├── benchmark_manifest.json           # Master ground-truth catalog for 15 benchmark scenes
├── curate_benchmarks.py              # Generator script for 15 EPSG:4326 GeoTIFF scenes
├── evaluation_criteria.md            # SIH 4-pillar evaluation criteria & quantitative tolerances
├── test_matrix_50.json               # 50-query prompt benchmark matrix (machine-readable)
├── test_matrix_50.md                 # 50-query prompt benchmark matrix (markdown table)
├── test_harness.py                   # Automated CLI test harness & latency/RAM profiler
├── dashboard.py                      # Interactive visual QA dashboard (Streamlit)
├── run_failure_analysis.py           # Empirical stress testing engine (5 probe experiments)
├── qa_evaluation_report_week1.md     # Formal Week 1 QA Evaluation Report (Score: 95/100)
├── pitch_deck_slides_1_to_5.md       # SIH Official Pitch Deck Draft (Part 1)
├── pitch_deck_complete_10_slides.md  # SIH Official Master Pitch Deck (Slides 1 to 10)
├── presentation_script_3min.md       # Synchronized 180s live presentation script for 6 members
├── dry_run_verifier.py               # Automated end-to-end dry run across 3 operational tracks
├── generate_demo_backup.py           # Pre-rendered demonstration visual overlay generator
├── demo_backup_walkthrough.md        # Fail-safe live demo backup guide and visual storyboard
├── qa_signoff_certificate.md         # Formal QA Sign-Off Certificate (Member 6 endorsement)
├── demo_assets/                      # High-resolution demonstration PNG overlays
└── reports/                          # Real-time execution telemetry, scorecards, failure logs
```

---

## 🎯 Day-by-Day Sprint Milestones

### Days 1–2: Ground Truth & Prompt Test Matrix
- **15 Paired Benchmark Scenes:** [`data/benchmark_scenes/`](file:///c:/Users/Dell/Documents/SIH2026/data/benchmark_scenes/) across Disaster, Agriculture, and Urban tracks.
- **Ground Truth Manifest:** [`qa_eval/benchmark_manifest.json`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/benchmark_manifest.json) with bounding boxes, closed polygons, and spectral indices.
- **50-Query Test Matrix:** [`qa_eval/test_matrix_50.json`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/test_matrix_50.json) categorized by intent (counting, detection, segmentation, spectral, change) and complexity.
- **Automated Tests:** `tests/test_day1_benchmarks.py` and `tests/test_day2_matrix.py`.

### Days 3–4: QA Test Harness, Dashboard & Failure Analysis
- **CLI Performance Harness:** [`qa_eval/test_harness.py`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/test_harness.py) measuring sub-millisecond routing and resident memory (RSS).
- **Interactive Streamlit Dashboard:** [`qa_eval/dashboard.py`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/dashboard.py) with live KPI cards, latency charts, and query tester.
- **Failure Mode Probing:** [`qa_eval/run_failure_analysis.py`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/run_failure_analysis.py) evaluating negative control classes, malformed ROIs, 35% cloud cover, and radiometric zero-division math.
- **Formal Evaluation Report:** [`qa_eval/qa_evaluation_report_week1.md`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/qa_evaluation_report_week1.md) (Readiness score: 95/100).
- **Automated Tests:** `tests/test_day3_harness.py` and `tests/test_day4_failure_analysis.py`.

### Days 5–6: Master SIH Pitch Deck & 3-Minute Live Script
- **Complete 10-Slide Deck:** [`qa_eval/pitch_deck_complete_10_slides.md`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/pitch_deck_complete_10_slides.md) tailored to SIH rubric (Novelty, Depth, Impact, Feasibility).
- **Synchronized 3-Minute Live Script:** [`qa_eval/presentation_script_3min.md`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/presentation_script_3min.md) with exact 180s pacing across all 6 members and explicit UI click cues.
- **Automated Tests:** `tests/test_day5_pitch_deck.py` and `tests/test_day6_pitch_completion.py`.

### Day 7: End-to-End Dry Run, Video Backup & Sign-Off
- **Automated Dry Run Engine:** [`qa_eval/dry_run_verifier.py`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/dry_run_verifier.py) confirming sub-second latency and valid GeoJSON on Kaziranga flood, Punjab NDVI, and JNPT port ships.
- **Visual Demo Backup Guide:** [`qa_eval/demo_backup_walkthrough.md`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/demo_backup_walkthrough.md) with pre-rendered PNG overlays in `qa_eval/demo_assets/`.
- **Formal QA Sign-Off Certificate:** [`qa_eval/qa_signoff_certificate.md`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/qa_signoff_certificate.md).
- **Automated Tests:** `tests/test_day7_dry_run.py`.

---

## 📊 Empirical QA Telemetry

```
================================================================================
  SATQUERY AI — QUALITY ASSURANCE SCORECARD
================================================================================
  • 50-Query Prompt Pass Rate:        100.0% (50 / 50 Passed)
  • Average Intent Routing Speed:      8.3 ms (Budget: < 500 ms)
  • Average Full-Pipeline Latency:     1.52 s (Budget: < 4.0 s)
  • Peak System Resident RAM (RSS):    70.76 MB (Budget: < 4,000 MB)
  • Hardware Requirement:              100% Commodity CPU (Zero GPU)
  • Total Automated Unit Tests:        56 / 56 PASSED (100% Green)
    - tests/ (Days 1–7 + Real CV):     46 / 46 PASSED
    - backend/tests/ (M3 GIS + API):   10 / 10 PASSED
  • Overall Evaluation Readiness:      97 / 100 (High Distinction Contender)
================================================================================
```

---

## 🚀 Quickstart & Verification Commands

```bash
# 1. Run full continuous CI regression suite (56 tests)
python -m pytest tests/ backend/tests/ -v

# 2. Run the 50-query prompt benchmark harness
python qa_eval/test_harness.py --mode router

# 3. Launch the interactive visual QA dashboard
streamlit run qa_eval/dashboard.py

# 4. Execute the live presentation dry run
python qa_eval/dry_run_verifier.py

# 5. Re-generate demonstration video backup overlays
python qa_eval/generate_demo_backup.py
```
