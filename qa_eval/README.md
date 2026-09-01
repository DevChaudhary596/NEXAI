# QA & Evaluation Module (SatQuery AI - SIH26167)

**Lead:** Member 6 (QA Benchmarking & Pitch Lead)  
**Hardware:** CPU-only (Streamlit / PyTest / Python)

---

## 🎯 Day 1 Deliverables (Completed ✅)

1. **SIH Evaluation Rubric & Quality Thresholds:** [`qa_eval/evaluation_criteria.md`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/evaluation_criteria.md)
   - Mapping to the 4 judging criteria (Novelty, Technical Depth, Social/Strategic Impact, Feasibility).
   - Quantitative acceptance criteria (Count error $\le \pm 10\%$, segmentation $\text{IoU} \ge 0.65$, latency $< 4\text{s}$, RSS memory $< 4\text{ GB}$).

2. **Benchmark Generation Pipeline:** [`qa_eval/curate_benchmarks.py`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/curate_benchmarks.py)
   - Generates 15 paired multi-band GeoTIFF scenes (EPSG:4326 georeferenced) across 3 tracks.

3. **Master Ground-Truth Catalog:** [`qa_eval/benchmark_manifest.json`](file:///c:/Users/Dell/Documents/SIH2026/qa_eval/benchmark_manifest.json)
   - Contains exact bounding boxes, polygon vertex rings, object counts, and spectral index baselines for all 15 scenes.

4. **Automated Validation Suite:** [`tests/test_day1_benchmarks.py`](file:///c:/Users/Dell/Documents/SIH2026/tests/test_day1_benchmarks.py)
   - Comprehensive tests validating CRS, geotransform, polygon geometry closure, and integration with `CVService`.

---

## 📂 Benchmark Dataset Structure

```
data/benchmark_scenes/
├── disaster/      (5 GeoTIFFs: Flood, waterlogging, storm surge, wildfire burn scar, landslide)
├── agriculture/   (5 GeoTIFFs: Punjab wheat, Marathwada drought, Karnataka parcels, Gangetic paddy, canopy clearing)
└── urban/         (5 GeoTIFFs: Delhi airport, Mumbai JNPT port, Jamnagar tanks, Bengaluru footprints, Expressway)
```

---

## 🚀 Running Verification

To re-curate or verify the benchmark dataset:
```bash
# Generate / refresh all 15 benchmark scenes and manifest
python qa_eval/curate_benchmarks.py

# Run automated validation suite
pytest tests/test_day1_benchmarks.py -v
```
