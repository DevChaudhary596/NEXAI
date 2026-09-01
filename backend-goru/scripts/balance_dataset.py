#!/usr/bin/env python3
"""Day 3: balance the yes/no-dominated RSVQA set before training.

RSVQA-LR is 69% yes/no ("Is there water?", "Are there roads?"). Fine-tuning
on that as-is teaches the model to answer yes/no for everything, including
counting and land-cover questions - the majority class swamps the gradient.
Every numeric answer ("0".."20"+) and every land-cover answer ("urban",
"rural") is already scarce by comparison and is exactly what balancing is
trying to protect, so those rows are left untouched. Only yes/no is
downsampled, capped to parity with everything else (50/50 by default).

  python scripts/balance_dataset.py
  python scripts/balance_dataset.py --in data/train.jsonl --out data/train_balanced.jsonl

Does NOT touch data/train_val.jsonl on purpose - validation should reflect
the true (unbalanced) distribution so the reported accuracy is honest.
"""
from __future__ import annotations

import argparse
import collections
import json
import random
import sys
from pathlib import Path

YES_NO = {"yes", "no"}


def answer_text(record: dict) -> str:
    return record["messages"][1]["content"][0]["text"]


def load(path: Path) -> list[dict]:
    with path.open() as fh:
        return [json.loads(line) for line in fh if line.strip()]


def report(label: str, records: list[dict]) -> None:
    counts = collections.Counter(answer_text(r).strip().lower() for r in records)
    total = sum(counts.values())
    yes_no = counts["yes"] + counts["no"]
    other = total - yes_no
    other_distinct = len(counts) - sum(1 for a in YES_NO if a in counts)

    print(f"--- {label}: {total} rows ---")
    print(f"  yes/no  {yes_no:6d}  ({yes_no / total * 100:5.1f}%)")
    print(f"  other   {other:6d}  ({other / total * 100:5.1f}%)  "
          f"[{other_distinct} distinct answers]")
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:10]
    print("  top 10:", ", ".join(f"{a!r}={n}" for a, n in top))


def balance(records: list[dict], cap_ratio: float, seed: int) -> list[dict]:
    """Downsample yes/no to at most `cap_ratio` times the size of every other
    answer combined. cap_ratio=1.0 -> yes+no ends up == other, i.e. 50/50."""
    yes = [r for r in records if answer_text(r).strip().lower() == "yes"]
    no = [r for r in records if answer_text(r).strip().lower() == "no"]
    other = [r for r in records if answer_text(r).strip().lower() not in YES_NO]

    yes_no_total = len(yes) + len(no)
    target_yes_no = int(len(other) * cap_ratio)
    if yes_no_total == 0 or target_yes_no >= yes_no_total:
        return records  # already at or below parity - never upsample

    # Split the shared budget between yes/no in their original proportion
    # (~50/50 already) so we don't flip "always yes" into "always no".
    target_yes = round(target_yes_no * len(yes) / yes_no_total)
    target_no = target_yes_no - target_yes

    rng = random.Random(seed)
    kept_yes = rng.sample(yes, min(target_yes, len(yes)))
    kept_no = rng.sample(no, min(target_no, len(no)))

    balanced = other + kept_yes + kept_no
    rng.shuffle(balanced)
    return balanced


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="inp", type=Path, default=Path("data/train.jsonl"))
    ap.add_argument("--out", type=Path, default=Path("data/train_balanced.jsonl"))
    ap.add_argument(
        "--cap-ratio", type=float, default=1.0,
        help="yes+no capped to this many times the rest of the dataset "
             "(default 1.0 = 50/50 split)",
    )
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if not args.inp.exists():
        sys.exit(f"not found: {args.inp}")

    records = load(args.inp)
    report("before", records)

    balanced = balance(records, args.cap_ratio, args.seed)
    print()
    report("after", balanced)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w") as fh:
        for r in balanced:
            fh.write(json.dumps(r) + "\n")
    print(f"\nwrote {len(balanced)} rows -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
