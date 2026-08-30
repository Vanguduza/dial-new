# DIAL gate ladder — single canonical progression

**Status:** Canon. Supersedes every other stated ladder.

Three ladders were live at once, each asserting continuity with the others:

| Source | Ladder |
|---|---|
| `DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md` | DESIGN_CLOSED → BUILDABLE → CODE_PRESENT → DOMAIN_TESTED → INTEGRATION_GREEN → STAGING_GREEN → CERTIFIED_DORMANT → ACTIVATION_BLOCKERS_GREEN → ACTIVE |
| `DIAL_MASTER_DEVELOPMENT_PLAN_AND_PROMPT_v1_6.md` §7 | SPECIFIED → MAPPED → CODE_PRESENT → DOMAIN_TESTED → INTEGRATION_GREEN → STAGING_GREEN → PRODUCTION_GREEN → CERTIFIED_DORMANT → ACTIVE |
| `DIAL_Module_Expansion_and_Operational_Realisation_Architecture_v1.md` §34 | PLANNED → THIN_SLICE_REQUIRED → THIN_SLICE_GREEN → INTEGRATION_GREEN → STAGING_GREEN → PRODUCTION_GREEN → CERTIFIED_DORMANT or ACTIVE |

`FEATURE_REGISTRY.schema.json` enforced the second. The live registry uses
`SPECIFIED` and `CODE_PRESENT`. The expansion ladder omits `DOMAIN_TESTED`
entirely while its own §34.1 is headed "Domain Green" and open bootstrap task
RBC-009 is "prove one pilot Feature to DOMAIN_TESTED".

## The canonical ladder

```text
SPECIFIED
→ DESIGN_CLOSED
→ BUILDABLE
→ CODE_PRESENT
→ DOMAIN_TESTED
→ INTEGRATION_GREEN
→ STAGING_GREEN
→ CERTIFIED_DORMANT
→ ACTIVATION_BLOCKERS_GREEN
→ ACTIVE
```

Ten states, each meaning something the others do not. It is the closure canon's
ladder with `SPECIFIED` restored at the front, because 183 registry records
already sit there and a ladder that cannot express the state most features are
in is not the live ladder.

## Alias map

These names appear in superseded documents. They are not additional states.

| Superseded name | Canonical state | Note |
|---|---|---|
| `PLANNED` | `SPECIFIED` | |
| `MAPPED` | `BUILDABLE` | v1_6's "mapped into the repository" is the buildable condition |
| `THIN_SLICE_REQUIRED` | `BUILDABLE` | |
| `THIN_SLICE_GREEN` | `CODE_PRESENT` | a thin slice proves architecture, not completeness |
| "Domain Green" | `DOMAIN_TESTED` | |
| `PRODUCTION_GREEN` | `ACTIVATION_BLOCKERS_GREEN` | see ordering note below |

## Why PRODUCTION_GREEN moved

v1_6 and the expansion both place `PRODUCTION_GREEN` — live credentials,
regulatory and partner prerequisites, approved disclosures — *before*
`CERTIFIED_DORMANT`. That ordering requires live merchant contracts and
regulatory clearance before software can be certified, which inverts DIAL's
stated model: build broad, certify deeply, activate selectively.

The closure canon's ordering is kept. Software is certified on its own evidence
and reaches `CERTIFIED_DORMANT`. The external prerequisites are the
`ACT-REG-*` activation blockers, and clearing them is
`ACTIVATION_BLOCKERS_GREEN` — the state between dormant and active.

## Enforcement

`agent-system/bin/gate-ladder-check.mjs` fails on any `status` or
`current_gate` value in any registry that is not one of the ten canonical
states, and names the alias when a superseded name is used. A blocked
capability may additionally not be reported at or above `DOMAIN_TESTED`
(`v2-closure-check`).
