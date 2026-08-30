"""Scoped live re-run (Commons only) over the sibling families affected by the fixes."""
from pathlib import Path

import hero_batch_downloader as h

rows = h.load_manifest(Path("transition_visual_family_manifest.csv"))
ctxs = h.build_family_contexts(rows)

TARGETS = ("Hilux", "Swift", "Ranger", "D-Max", "Grand i10", "Corolla Cross")
sel = [r for r in rows if r["Priority"] == "P0" and r["Model Family"] in TARGETS]
print(f"families: {len(sel)}")

searched = []
for r in sel:
    ctx = ctxs[r["Proposed VISUAL_FAMILY_ID"]]
    print(f"\n-- {r['Proposed VISUAL_FAMILY_ID']}")
    print(f"   queries: {h.make_queries(r, ctx)}")
    found = h.commons_search(r, 12, enough=3, ctx=ctx)
    searched.append((r, found, []))
    for c in sorted(found, key=lambda x: x.score, reverse=True)[:6]:
        print(f"   pool {c.score:7.1f}  {c.title}")

print("\n=== after cross-sibling assignment ===")
assigned = h.assign_across_siblings(searched, ctxs, per_family=3, min_score=0.0)
for r in sel:
    vfid = r["Proposed VISUAL_FAMILY_ID"]
    ctx = ctxs[vfid]
    print(f"\n-- {vfid}  window={ctx.year_start}-{ctx.year_end} eraReq={ctx.era_evidence_required}")
    if not assigned[vfid]:
        print("   NO_ACCEPTABLE_CANDIDATE")
    for c in assigned[vfid]:
        y, kind = h.title_year_kind(c.title)
        print(f"   {c.score:7.1f}  [{kind or 'nodate'} {y}]  {c.title}")
