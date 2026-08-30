# Acura CL — generated visual draft, not a completed transition

The first queue entry now has its own real hero photograph, studio CGI, assembled line art and exploded endpoint candidate. No Hilux media was reused.

## Files

- `source/hero-original.jpg`: original second-generation Acura CL photograph, IFCAR, public domain. Source: https://commons.wikimedia.org/wiki/File:2nd_Acura_CL.jpg
- `assets/studio-cgi.png`: source-based generated studio rendering.
- `assets/line-art.png`: assembled line-art candidate.
- `assets/exploded-reference-v3.png`: retained near-side exploded category illustration.
- `assets/exploded-reference-v1.png` and `v2.png`: rejected drafts retained for traceability; do not publish.
- `prompts.json`: exact prompts, reference chain and outputs; built-in image generation, no external image API runner.
- `../../../catalog-data/production/vehicles/VF-ACURA-CL.json`: authoritative production receipt, file hashes, source attribution, scope, invisible category regions and review state.

## Remaining work

This is **not** a video, frame sequence or continuous animation. The part-based scene and its render are absent. The photo/CGI/line art must be registered to the same camera and component scene before production motion can be rendered. Do not slide crops from the endpoint to pretend this work is complete.

The stock pipeline's renderer is a hardcoded development pickup; its live CGI adapter is unimplemented. It must not generate this car or other catalog vehicles. A production renderer must accept the per-vehicle identity and separated component scene, preserve tyre ownership, output continuous frames, and be checked against the endpoint and click regions.

The retained exploded illustration shows only the near-side front and rear wheel assemblies. Neither is duplicated on the body shell. The V6 and transverse transaxle are representative category art, **not OEM diagrams or evidence of fitment**. Human generation/body approval, mechanical validation and motion checks remain pending.

Catalog injection is separate from media completion: the future reviewed media may become `READY_FOR_CATALOG_INJECTION` without catalog IDs. Customer navigation becomes available only after an exact catalog family, fitment and release are bound. Do not infer these IDs from the generic `acura/cl` model name.

Run `npm run catalog:transition-status` to verify actual file hashes and rebuild the production ledger without altering the source queue or marking planned jobs complete.
