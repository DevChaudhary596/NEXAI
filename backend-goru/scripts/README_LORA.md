# Day 3-4: LoRA on Kaggle → running on the Mac

The trap this document exists to prevent: **a `peft` adapter trained on CUDA
does not load into MLX.** Different tensor layout, different key prefixes.
`MLXQwen2VL` refuses such a directory at construction rather than failing deep
inside `mlx_vlm.load`, but you still need a path that works.

There are two, and the second is the one to use.

## Option A — train in MLX directly (simplest, Mac-only)

`mlx_vlm.lora` trains against the same 4-bit model the demo serves, and
`load(..., adapter_path=...)` takes the result with no conversion at all.

```bash
python -m mlx_vlm.lora --model mlx-community/Qwen2.5-VL-3B-Instruct-4bit --dataset data/train.jsonl
```

Slow on an M3 Air and it competes with macOS for memory, so it suits a few
hundred samples, not the full RSVQA set. Good enough to prove the pipeline.

## Option B — train on Kaggle, merge and convert there (recommended)

Do **all three** steps in the Kaggle notebook. Never bring a raw adapter home.

```python
# 1. after training: merge into an fp16 base (you CANNOT merge into a 4-bit one)
base = Qwen2_5_VLForConditionalGeneration.from_pretrained(
    MODEL_ID, torch_dtype=torch.float16, device_map="auto")
merged = PeftModel.from_pretrained(base, "out/adapter").merge_and_unload()
merged.save_pretrained("out/merged"); processor.save_pretrained("out/merged")
```

```bash
# 2. convert the merged model to 4-bit MLX
pip install mlx-vlm
python -m mlx_vlm.convert --hf-path out/merged --mlx-path out/mlx-4bit -q --q-bits 4
```

3. Download `out/mlx-4bit` (~2 GB) and point the backend at it:

```bash
SATQUERY_VLM_BACKEND=mlx SATQUERY_MLX_MODEL_ID=/path/to/mlx-4bit uvicorn app.main:app
```

Yes, 2 GB instead of the 50 MB the deck promises. That download buys you the
removal of an entire class of Day-5 failure, and it happens once.

## Things that will bite you

**`max_pixels` must match between training and serving.** It is not a
performance knob, it changes what the model sees. `scripts/profile_mlx.py`
recommends the serving value; set training to the same number. The current Mac
recommendation is `200704` (256 × 28 × 28), *not* the `602112` default, which
is tuned for the CUDA lane.

**Pin versions across hosts.** The adapter is written by Kaggle's
`transformers`/`peft`; a different version on the other side can mis-map
modules and load "successfully" while answering badly. Freeze in the notebook:

```bash
pip freeze | grep -Ei "transformers|peft|accelerate|torch" > requirements-train.txt
```

**T4 has no bf16 and no flash-attn-2.** Set `fp16=True, bf16=False` and
`attn_implementation="sdpa"`. `scripts/cuda_sanity.py` checks both — run it as
the notebook's first cell.

**fp16 + LoRA on Qwen2-VL can NaN.** Keep LoRA layers in fp32, LR `5e-5` not
`1e-4`, and clip gradients.

**Verify what the adapter attached to.** Print the matched module list after
`get_peft_model`. `["q_proj","v_proj"]` should hit the language decoder only —
the vision tower uses a fused `qkv`. If training and serving disagree about
which layers carry the adapter, you get quality loss, not an error.

## Does the demo need this?

No. The router is rules-first: every query in M6's 50-query matrix lands in the
deterministic pass, and the VLM only narrates numbers the tools computed. The
base 3B already does that well — see the Day-2 end-to-end run.

Train the LoRA for the *deck* (fine-tuning is a novelty and feasibility point,
and M6 needs before/after numbers). Do not let it block the demo path.
