# Dial Visual Transformation Generator

DVTG turns an approved vehicle visual-family reference set into a resumable cinematic navigation pack while keeping exact EPC truth under `FITMENT_ID` control.

## Working vertical slice

The repository includes a clearly labelled synthetic pickup fixture so the full generator and player can run without unlicensed photography. It is development-only and cannot pass production approval.

```text
npm install
npm run dial-visual -- validate examples/hilux-an130/job.json
npm run generate:hilux
npm run preview
```

Open `http://localhost:3000`. The homepage loads the saved primary Garage vehicle into a progressive cascade. Selecting **Search** commits the vehicle and starts the transformation automatically; there is intentionally no homepage Play button. The committed values remain visible as faint grey text until a field is edited.

The transition window permits two text elements: “click on the category image to browse parts” at the top and “Know your {exact model}. Find the right part.” at the bottom left. It has no visible progress bar, stage labels, controls, or hotspot markers. Its intended public sequence is Hero → CGI → Line art → continuously separating exploded parts. Invisible, forgiving hit regions route exploded parts into the selected vehicle’s EPC category family; runtime URLs are derived from structured catalog bindings rather than stored as fitment truth in the artwork.

Representative EPC routes:

```text
/epc/vehicles/hilux-an120-an130
/epc/vehicles/hilux-an120-an130/sections/body-exterior?group=bumpers-exterior-trim
/epc/vehicles/hilux-an120-an130/diagrams/DGM-HILUX-BODY-001
```

The EPC experience follows the Nissan GT-R project's Megazip-inspired hierarchy and improves it with persistent fitment context, group-level visual deep links, zoom, part filtering, readiness-aware fallbacks and stable internal diagram IDs.

Customer entry routes:

```text
/                         homepage cascade and automatic visual journey
/?autostart=1&source=garage  saved-vehicle visual journey
/garage                   My Garage visual/direct-EPC choices
/epc                      active-vehicle Browse EPC entry
```

## Commands

```text
npm run dial-visual -- --help
npm run dial-visual -- generate examples/hilux-an130/job.json --from cgi
npm run dial-visual -- qa examples/hilux-an130/job.json
npm run dial-visual -- package examples/hilux-an130/job.json
npm run catalog:coverage
npm run catalog:coverage:check
npm run catalog:visual-sources -- --limit 25
npm run catalog:transition-status
npm run api
npm test
npm run build
```

## Production inputs

The shared component factory is implemented in `packages/scene-engine/`. It supports measured scene validation, automatic duplicate-source-ownership repair, alternative candidates, bounded parallel batches, render checkpoints, complete source/layer packaging and geometry-derived click ownership. Run `npm run dial-visual -- batch path/to/production-plan.json`; optional trusted reconstruction workers are supplied with `--workers`.

See [Transition factory implementation and reconstruction decision](docs/TRANSITION_FACTORY_IMPLEMENTATION.md) for the supplied-guide corrections, researched backend recommendation, contracts, commands and remaining work. A [public ZeroGPU image-to-mesh pilot](workers/trellis-pilot/README.md) now connects to Microsoft's existing TRELLIS.2 demo and saves independent reconstruction evidence. **The photo-to-registered-parts worker is not complete**, and the current customer preview still uses the separate Hilux demonstration. A whole-object mesh and passing client tests must not be presented as an approved exploded pack or real-car visual approval.

The legacy live CGI adapter is **not implemented**, and its frame renderer draws only the development pickup. Credentials alone cannot enable catalog-wide production. The fixture renderer rejects other vehicle identities before generating media. The replacement uses one reusable renderer driven by each visual family's reconstructed component scene; it does not require a separately designed renderer for every car. Do not substitute the Hilux fixture or slide crops from a flattened exploded still. See `docs/IMPLEMENTATION_PLAN.md` and `docs/DEVELOPMENT_FIXTURE_POLICY.md`.

`npm run catalog:coverage` also creates a unique visual-transition source and mapping contract for every vehicle marked for catalog inclusion. The queue is written to `catalog-data/generated/visual-transition-source-queue.json`; the resumable `catalog:visual-sources` command searches Wikimedia Commons first and Openverse second for open-license hero candidates. It automatically accepts allowlisted license metadata and records attribution. Draft assets can be prepared before final identity approval, but cannot be published as verified vehicle coverage. Missing or conflicting license metadata is rejected or escalated.

Actual generated media is tracked separately from planned jobs. `catalog-data/production/vehicles/` contains per-vehicle receipts; `npm run catalog:transition-status` verifies local image bytes and hashes and rebuilds `catalog-data/generated/visual-transition-production.json`. The independent-stage Acura CL draft in `output/vehicle-transitions/VF-ACURA-CL/` was rejected for inconsistent views and remains diagnostic evidence, not a completed or approved transition. No draft is substituted into the customer preview. Media readiness does not require catalog IDs; customer activation additionally requires an exact verified catalog binding.

For the complete website, Garage and release design, use `DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md`. For the catalog pipeline handoff, use `CATALOG_AGENT_BUILD_PROMPT.md` together with the visual mapping, flow-pack and coverage-ledger schemas.
