#!/usr/bin/env python3
"""Day 2: RSVQA -> Qwen2-VL chat JSONL.

  # real data
  python scripts/prepare_dataset.py --rsvqa-dir ~/data/RSVQA-LR --out data/train.jsonl

  # synthetic smoke set - exercises the whole training path with no download
  python scripts/prepare_dataset.py --synthetic 64 --out data/smoke.jsonl

Output is one JSON object per line in Qwen2-VL message format. Ship it to Drive
AND to a Kaggle Dataset as a single .tar so both training lanes read the same
artifact:

  tar -cf rsvqa.tar data/train.jsonl data/images/
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path


def to_record(image_path: str, question: str, answer: str) -> dict:
    return {
        "messages": [
            {"role": "user", "content": [
                {"type": "image", "image": image_path},
                {"type": "text", "text": question},
            ]},
            {"role": "assistant", "content": [{"type": "text", "text": answer}]},
        ]
    }


def load_rsvqa(root: Path, split: str) -> list[dict]:
    """RSVQA-LR / -HR layout: questions and answers are separate files joined
    on question id, images are {img_id}.tif under Images_*."""
    q_file = next(root.glob(f"*{split}_questions.json"), None)
    a_file = next(root.glob(f"*{split}_answers.json"), None)
    if not q_file or not a_file:
        sys.exit(
            f"could not find *{split}_questions.json / *{split}_answers.json in {root}\n"
            f"present: {sorted(p.name for p in root.glob('*.json'))}"
        )

    questions = json.loads(q_file.read_text())["questions"]
    answers = json.loads(a_file.read_text())["answers"]
    by_qid = {a["question_id"]: a["answer"] for a in answers if a.get("active", True)}

    img_dir = next((d for d in root.iterdir() if d.is_dir() and "image" in d.name.lower()), None)
    if img_dir is None:
        sys.exit(f"no Images_* directory under {root}")

    records, missing = [], 0
    for q in questions:
        if not q.get("active", True):
            continue
        ans = by_qid.get(q["id"])
        if ans is None:
            continue
        img = img_dir / f"{q['img_id']}.tif"
        if not img.exists():
            img = img_dir / f"{q['img_id']}.png"
        if not img.exists():
            missing += 1
            continue
        records.append(to_record(str(img.resolve()), q["question"], str(ans)))

    if missing:
        print(f"warn: skipped {missing} entries with no image on disk", file=sys.stderr)
    return records


SYNTH_TEMPLATES = [
    ("Is there water in this image?", ["yes", "no"]),
    ("How many buildings are present?", ["0", "3", "12", "47"]),
    ("What is the dominant land cover?", ["vegetation", "urban", "water", "bare soil"]),
    ("Are there any ships visible?", ["yes", "no"]),
    ("Is this an agricultural area?", ["yes", "no"]),
    ("What is the extent of vegetation?", ["low", "moderate", "high"]),
]


def make_synthetic(n: int, out_dir: Path) -> list[dict]:
    """Random RGB tiles + templated QA. Not for training quality - purely to
    prove the collator, masking, and step loop before burning GPU quota."""
    try:
        import numpy as np
        from PIL import Image
    except ImportError:
        sys.exit("synthetic mode needs numpy and pillow")

    img_dir = out_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(0)
    nprng = __import__("numpy").random.default_rng(0)

    records = []
    for i in range(n):
        p = img_dir / f"synth_{i:05d}.png"
        if not p.exists():
            Image.fromarray(
                nprng.integers(0, 255, (448, 448, 3), dtype=np.uint8)
            ).save(p)
        q, choices = rng.choice(SYNTH_TEMPLATES)
        records.append(to_record(str(p.resolve()), q, rng.choice(choices)))
    return records


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rsvqa-dir", type=Path)
    ap.add_argument("--split", default="train")
    ap.add_argument("--synthetic", type=int, default=0)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=0, help="0 = all")
    ap.add_argument("--val-split", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if args.synthetic:
        records = make_synthetic(args.synthetic, args.out.parent)
    elif args.rsvqa_dir:
        records = load_rsvqa(args.rsvqa_dir, args.split)
    else:
        sys.exit("pass --rsvqa-dir or --synthetic N")

    random.Random(args.seed).shuffle(records)
    if args.limit:
        records = records[: args.limit]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n_val = int(len(records) * args.val_split)
    val, train = records[:n_val], records[n_val:]

    def dump(path: Path, rows: list[dict]) -> None:
        with path.open("w") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")

    dump(args.out, train)
    print(f"wrote {len(train)} train -> {args.out}")
    if val:
        val_path = args.out.with_name(args.out.stem + "_val.jsonl")
        dump(val_path, val)
        print(f"wrote {len(val)} val   -> {val_path}")

    ans = [r["messages"][1]["content"][0]["text"] for r in train]
    top = sorted({a: ans.count(a) for a in set(ans)}.items(), key=lambda kv: -kv[1])[:8]
    print("answer distribution (top 8):", top)
    return 0


if __name__ == "__main__":
    sys.exit(main())
