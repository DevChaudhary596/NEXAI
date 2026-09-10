# backend-goru

**Author**: Gaurang (Member 1, VLM)

An independent, working backend built in parallel with `backend/` on this
branch, for comparison before we decide which structure to keep. Nothing in
`backend/` was touched.

## What's here
- FastAPI app with config-driven VLM backends (mock / local CUDA / MLX)
  behind one interface - `app/services/vlm.py`
- Real CV wired in - `app/services/cv_impl.py` adapts M2's detector
  (`app/services/detector.py`/`segmenter.py`, vendored unmodified from
  `feat/sentinel2-physics-constraints`) to the `CVServiceProtocol` in
  `app/services/cv.py`. See "CV integration" below.
- RSVQA-LR dataset pipeline: `scripts/prepare_dataset.py`,
  `scripts/balance_dataset.py` (fixes the 69% yes/no imbalance -
  33,508 balanced rows in `data/train_balanced.jsonl`)
- Host sanity checks: `scripts/cuda_sanity.py`, `scripts/mac_sanity.py`
- Kaggle QLoRA -> merge -> MLX-convert notebook:
  `notebooks/train_lora_kaggle.ipynb` (see `scripts/README_LORA.md`)
- 81 passing tests (`tests/`), verified on the real MLX + CV stack together

## Run it
```bash
cd backend-goru
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-mac.txt
python -m pytest
```

## CV integration

`app/services/cv.py`'s `get_cv()` already had a drop-in slot for this
(`try: from app.services.cv_impl import CVService`) - the file just didn't
exist yet. It does now, but it's an **adapter, not a re-export**: M2's engine
was built against its own pixel-space `BBox` and a raw-dict `properties`
shape; the team contract (`app/core/schemas/`) uses a geographic
`BBox(west/south/east/north)` and a strict `FeatureProperties` model. Same
names, incompatible types - `app/services/cv_impl.py` does the actual
translation (geographic BBox -> pixel BBox via the scene's inverted affine
transform, M2's raw detections -> contract `Feature`/`FeatureProperties`,
plus an equirectangular `area_m2` estimate for segmentation that M2's engine
doesn't compute). Full rationale in that file's docstring.

**Verified, not just written:** ran real YOLOv8n-OBB + FastSAM inference
against the actual committed model weights and real test imagery (not
mocked) - confirmed `get_cv()` resolves to the real adapter (not the mock
fallback), the Sentinel-2 physics gate correctly allows reliable classes and
blocks unreliable ones through the full pipeline, a real positive detection
round-trips through schema construction with no validation errors, the
geographic<->pixel bbox inversion round-trips exactly, and the `area_m2`
estimate is accurate to <0.5% against a known reference area. Caught and
fixed one real bug in the process: an ROI that doesn't overlap the scene at
all produced a 0x0 crop that crashed the detector instead of returning an
empty result - `tests/test_e2e.py::test_features_land_inside_the_roi` covers
this now.

**Needs updating separately, not a CV bug:** `test_detection_roundtrip`
asserted `count > 0` for a `storage tank` query - that class is always
physics-blocked now (correct behavior), and the seeded
`demo`/`coastal`/`urban`/`farmland` scenes are synthetic 256x256
placeholders with no real detectable content regardless of target class.
The test now asserts the (correct) zero-count instead; there's a TODO in it
for whoever owns the demo fixtures to add a real scene so a genuine
positive-path e2e test can exist.

Requires `requirements-cv.txt` (`torch`, `ultralytics`, `shapely`,
`rasterio` - not in `requirements-mac.txt`, since the MLX/mock-CV path
doesn't need any of this). Without it, `get_cv()` just falls back to
`MockCVService` same as before - nothing breaks, you only lose real
detections.
