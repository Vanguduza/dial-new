"""Scoped live check (Commons only, 1 family): Suzuki Swift current generation."""
from pathlib import Path

import hero_batch_downloader as h

rows = h.load_manifest(Path("transition_visual_family_manifest.csv"))
ctxs = h.build_family_contexts(rows)
row = [r for r in rows if r["Proposed VISUAL_FAMILY_ID"] == "VF-SUZUKI-SWIFT-CURRENT-GENERATION-HATCHBACK-CURRENT"][0]
ctx = ctxs[row["Proposed VISUAL_FAMILY_ID"]]
print("queries:", h.make_queries(row, ctx))
print("window:", ctx.year_start, ctx.year_end, "eraReq:", ctx.era_evidence_required)
for c in sorted(h.commons_search(row, 12, enough=3, ctx=ctx), key=lambda x: x.score, reverse=True)[:8]:
    y, kind = h.title_year_kind(c.title)
    print(f"  {c.score:7.1f} [{kind or 'nodate'} {y}]  {c.title}")
