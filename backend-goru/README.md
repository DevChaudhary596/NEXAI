# backend-goru

**Author**: Gaurang (Member 1, VLM)

An independent, working backend built in parallel with `backend/` on this
branch, for comparison before we decide which structure to keep. Nothing in
`backend/` was touched.

## What's here
- FastAPI app with config-driven VLM backends (mock / local CUDA / MLX)
  behind one interface - `app/services/vlm.py`
- RSVQA-LR dataset pipeline: `scripts/prepare_dataset.py`,
  `scripts/balance_dataset.py` (fixes the 69% yes/no imbalance -
  33,508 balanced rows in `data/train_balanced.jsonl`)
- Host sanity checks: `scripts/cuda_sanity.py`, `scripts/mac_sanity.py`
- Kaggle QLoRA -> merge -> MLX-convert notebook:
  `notebooks/train_lora_kaggle.ipynb` (see `scripts/README_LORA.md`)
- 81 passing tests (`tests/`)

## Run it
```bash
cd backend-goru
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-mac.txt
python -m pytest
```
