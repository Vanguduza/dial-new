"""Ad-hoc probe: verify sibling families get distinct, era-appropriate heroes."""
from pathlib import Path

import hero_batch_downloader as h

rows = h.load_manifest(Path("transition_visual_family_manifest.csv"))
ctxs = h.build_family_contexts(rows)

TARGETS = ("Hilux", "Ranger", "D-Max")
sel = [r for r in rows if r["Model Family"] in TARGETS]

print("=== contexts ===")
for r in sel:
    c = ctxs[r["Proposed VISUAL_FAMILY_ID"]]
    print(
        f"{r['Make']:8} {r['Model Family']:8} {r['Generation / Platform']:12} "
        f"{r['Facelift / Visual Phase']:32} years={c.year_start}-{c.year_end} "
        f"own={c.own_codes} sib={c.sibling_codes} cab={c.cab!r} sibcab={c.sibling_cabs}"
    )

print("\n=== searches ===")
searched = []
for r in sel:
    ctx = ctxs[r["Proposed VISUAL_FAMILY_ID"]]
    found = h.commons_search(r, 12, enough=3, ctx=ctx)
    searched.append((r, found, []))
    print(f"\n-- {r['Proposed VISUAL_FAMILY_ID']}")
    for c in sorted(found, key=lambda x: x.score, reverse=True)[:6]:
        print(f"   {c.score:7.1f}  {c.title}")

print("\n=== after cross-family assignment ===")
assigned = h.assign_across_siblings(searched, ctxs, per_family=3, min_score=0.0)
for r in sel:
    vfid = r["Proposed VISUAL_FAMILY_ID"]
    print(f"\n-- {vfid}")
    for c in assigned[vfid]:
        print(f"   {c.score:7.1f}  {c.title}")
