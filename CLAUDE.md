# DIAL Main — Engineering Entry

## Single source of truth

Before any DIAL Main work, read:

`docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md`

That file is the sole top-level product, commercial, technical and runtime authority. No prompt, audit, donor document, historical plan, code comment or model memory may override it.

## Work protocol

1. Resolve the active Feature ID before changing product code.
2. Run `node agent-system/bin/context-get.mjs <FEATURE_ID>` for bounded context.
3. Inspect current code, tests, Feature Realisation Contract, Security Profile, Material Eventualities and current evidence.
4. If any subordinate artifact conflicts with the master, treat the subordinate artifact as stale and report/migrate it; do not reopen the locked decision by assumption.
5. Use typed commands and owning-domain state machines for consequential transitions.
6. Preserve source-of-record boundaries, no-custody money architecture, immutable financial snapshots and append-only correction history.
7. AI/Hermes is non-authoritative for binding money, fitment, safety, compliance or canonical business state.
8. Trigger independent specialist review where the gate requires it; self-review is not independent evidence.
9. Run fresh verification before advancing a gate.

## Current programme order

The master defines R0–R5. R0 canon integrity precedes new fan-out; Rounds implementation is then reconciled to current democratic governance before the active Grocery Rounds vertical slice continues. Oracle/Hermes qualification may proceed in parallel because deterministic DIAL commerce must not depend on AI runtime availability.

## Commands

```text
node agent-system/bin/context-get.mjs <FEATURE_ID>
npm run agent:canon-coherence
npm run agent:closure-check
npm run verify
```

## Hard boundary

DDE is a separate development system. DDE manager-chair/worker-routing architecture must never be imported into DIAL product/runtime canon. Hermes on Oracle belongs to DIAL and follows the master runtime rule: GPT-5.6 Sol → Claude Sonnet 5 → explicitly approved further fallback only.
