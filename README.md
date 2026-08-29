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

The transition window intentionally shows only “Know your {exact model}. Find the right part.” It has no visible progress bar, stage labels, controls, or hotspot markers. Its public sequence is Hero → CGI → Line art → continuously separating exploded parts. Invisible, forgiving hit regions route every exploded part into the selected vehicle’s EPC category family; runtime URLs are derived from the structured `VisualEpcMapping` v2 binding rather than stored as catalog truth.

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
npm run api
npm test
npm run build
```

## Production inputs

Replace the synthetic source with approved vehicle references and matching provenance hashes, disable development mode, configure a live CGI adapter, supply production video encoding, and complete all eight human approval gates. See `docs/IMPLEMENTATION_PLAN.md` and `docs/DEVELOPMENT_FIXTURE_POLICY.md`.

For the complete website, Garage and release design, use `DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md`. For the catalog pipeline handoff, use `CATALOG_AGENT_BUILD_PROMPT.md` together with the visual mapping, flow-pack and coverage-ledger schemas.
