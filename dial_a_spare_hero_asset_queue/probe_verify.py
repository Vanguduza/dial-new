"""Verification probe: sibling duplicates, era-range violations, eraReq symmetry."""
import collections
import csv
from pathlib import Path

import hero_batch_downloader as h

rows = h.load_manifest(Path("transition_visual_family_manifest.csv"))
ctxs = h.build_family_contexts(rows)
b = list(csv.DictReader(open("hero_queue_p0_dryrun_v2/candidate_review.csv", encoding="utf-8-sig")))

print("=== duplicate photo shared across siblings in v2 ===")
seen = collections.defaultdict(list)
for r in b:
    if r["source"] == "none":
        continue
    ctx = ctxs.get(r["visual_family_id"])
    seen[(ctx.group_key, r["title"])].append(r["visual_family_id"])
dups = {k: sorted(set(v)) for k, v in seen.items() if len(set(v)) > 1}
print(dups if dups else "NONE")

print("\n=== v2 candidates whose title year falls outside the family production range ===")
bad = 0
for r in b:
    if r["source"] == "none":
        continue
    ctx = ctxs.get(r["visual_family_id"])
    y = h.title_year(r["title"])
    if y and ctx.year_start and not (ctx.year_start <= y <= (ctx.year_end or y)):
        bad += 1
        print(f"  {r['visual_family_id']}: y={y} range={ctx.year_start}-{ctx.year_end} score={r['score']} :: {r['title']}")
print("  none" if not bad else f"  ({bad} violations)")

print("\n=== eraReq symmetry: Hilux ===")
for r in rows:
    if r["Model Family"] == "Hilux":
        c = ctxs[r["Proposed VISUAL_FAMILY_ID"]]
        print(f"  {r['Body Style']:12} {r['Facelift / Visual Phase']:32} window={c.year_start}-{c.year_end} eraReq={c.era_evidence_required}")

print("\n=== scoring undated / photo-dated titles against Hilux FACELIFT family ===")
f3 = [r for r in rows if r["Model Family"] == "Hilux" and r["Facelift / Visual Phase"] == "Facelift"][0]
c3 = ctxs[f3["Proposed VISUAL_FAMILY_ID"]]
for t in [
    "File:Toyota Hilux Invincible 50 (38438265462).jpg",
    "File:2016 Toyota Hilux double cab.jpg",
    "File:Moscow, Toyota Hilux blue, Sept 2025 01.jpg",
    "File:Toyota Hilux AN120 double cab.jpg",
]:
    print(f"  gen={h.generation_score(t, c3):7.1f} total={h.score_candidate(title=t, width=2000, height=1300, row=f3, ctx=c3):7.1f}  {t}")

print("\n=== scoring the same titles against Hilux PRE-FACELIFT double cab family ===")
f2 = [r for r in rows if r["Model Family"] == "Hilux" and r["Facelift / Visual Phase"] == "Pre-facelift"][0]
c2 = ctxs[f2["Proposed VISUAL_FAMILY_ID"]]
for t in [
    "File:Toyota Hilux Invincible 50 (38438265462).jpg",
    "File:2016 Toyota Hilux double cab.jpg",
    "File:2024 Toyota HiLux SR 4X4 mild hybrid front (1).jpg",
    "File:Toyota Hilux AN120 double cab.jpg",
]:
    print(f"  gen={h.generation_score(t, c2):7.1f} total={h.score_candidate(title=t, width=2000, height=1300, row=f2, ctx=c2):7.1f}  {t}")

print("\n=== detect_cab on combined-cab body styles ===")
for v in ["Single Cab", "Double Cab", "Single/Double Cab", "Single/Extended/Double Cab"]:
    print(f"  {v!r:32} -> {h.detect_cab(v)!r}")

print("\n=== extract_platform_codes noise check ===")
for v in ["Current two generations", "IV/V", "D/E/F", "Current", "Single family", "QY", "AN120/AN130", "H200/H300"]:
    print(f"  {v!r:28} -> {h.extract_platform_codes(v)}")
