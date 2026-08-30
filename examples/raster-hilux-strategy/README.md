# Real-source raster experiments

`hilux.json` and `acura.json` use the same adapter, renderer and choreography.
They are development experiments, **not approved website replacements**. The
original Hilux demo remains the style target. The first separated source-cut
candidate failed agent visual inspection despite passing reassembly checks.

Run from repository root:

```powershell
npm run dial-visual -- raster examples/raster-hilux-strategy/hilux.json
npm run dial-visual -- raster examples/raster-hilux-strategy/acura.json
```

Inputs use normalized source-image coordinates, not player rectangles. Four
physical wheel positions are explicit. Occluded Acura wheels are marked as
illustrations derived from visible tyre references, not independently verified
back-side photographs. The passenger rear-suspension illustration is distinct
from the pickup reference. Actual internal fitment is never asserted.

Generated preparation and pack files live under `prepared/`, with source hashes,
strict receipts, saved failures and pending visual approval. Do not transfer
these masks to another hero. No input annotations here claim human review.

See `docs/HILUX_RASTER_PRODUCTION_PLAYBOOK.md` for the current method, limitations
and the required complete-part artwork authoring step.

Asset generation used the built-in image tool. Source photography was copied
from already-retained project assets; no new vehicle imagery was scraped.
`mechanical-illustrations-v1.png` is a six-cell transparent illustration atlas,
not an exploded-car still. `passenger-rear-suspension-v1.png` is a separate
passenger-car illustration. Generated alpha was checked and preserved.

Generation prompts are recorded in `assets/generation-prompts.md`.
