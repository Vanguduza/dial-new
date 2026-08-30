"""Ad-hoc comparison of the old vs generation-aware P0 dry runs."""
import csv
from collections import Counter, defaultdict
from pathlib import Path


def load(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def summarize(name, rows):
    real = [r for r in rows if r["title"] != "NO_ACCEPTABLE_CANDIDATE"]
    empty = sorted(r["visual_family_id"] for r in rows if r["title"] == "NO_ACCEPTABLE_CANDIDATE")
    fams = {r["visual_family_id"] for r in real}
    print(f"\n### {name}")
    print(f"  rows(all)={len(rows)} real_candidates={len(real)}")
    print(f"  families with candidates={len(fams)} empty={len(empty)}")
    print(f"  sources={dict(Counter(r['source'] for r in real))}")
    print(f"  review_status={dict(Counter(r['review_status'] for r in rows))}")
    dupes = Counter(r["title"] for r in real)
    shared = {t: n for t, n in dupes.items() if n > 1}
    print(f"  titles reused across families={len(shared)}")
    return real, set(empty), fams


old = load("hero_queue_p0_dryrun/candidate_review.csv")
new = load("hero_queue_p0_dryrun_v2/candidate_review.csv")
old_real, old_empty, old_fams = summarize("OLD", old)
new_real, new_empty, new_fams = summarize("NEW (generation-aware)", new)

print("\n### families that LOST all candidates")
for vfid in sorted(new_empty - old_empty):
    print(f"  - {vfid}")
print("\n### families that GAINED candidates")
for vfid in sorted(old_empty - new_empty):
    print(f"  + {vfid}")

print("\n### Hilux before/after")
for label, rows in (("OLD", old_real), ("NEW", new_real)):
    per = defaultdict(list)
    for r in rows:
        if "HILUX" in r["visual_family_id"]:
            per[r["visual_family_id"]].append((r["rank"], r["score"], r["title"]))
    for vfid, items in per.items():
        print(f"  [{label}] {vfid}")
        for rank, score, title in sorted(items):
            print(f"        {rank} {score:>7}  {title}")

print("\n### per-family candidate count delta")
oc = Counter(r["visual_family_id"] for r in old_real)
nc = Counter(r["visual_family_id"] for r in new_real)
for vfid in sorted(set(oc) | set(nc)):
    if oc[vfid] != nc[vfid]:
        print(f"  {oc[vfid]} -> {nc[vfid]}  {vfid}")
