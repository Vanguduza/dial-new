# DIAL Implementation Evidence Library

This directory is **not** a source of product truth.

Canonical product/architecture authority is:

`docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md`

The material retained here exists only for implementation detail, machine registries, feature contracts, security/eventuality contracts, donor qualification, NFR/deployment evidence, audits, specialist design and provenance.

If anything in this tree conflicts with the canonical master, the master wins and the subordinate artifact must be migrated or retired.

## Live machine state

- Feature Registry: `agent-system/registries/FEATURE_REGISTRY.json`
- Decision Registry: `agent-system/registries/DECISION_LOG.json`
- Feature contracts: `20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/`
- Eventualities: `20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/`
- Security: `17_SECURITY/`
- Activation: `20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/`
- Readiness state: `docs/dial/status/BUILD_READINESS_SCORECARD.json`

Historical top-level masters, anchor indexes, development prompts, duplicate `ref/` copies and archived packs have been removed from the active authority system. Compatibility pointer files exist only where a live registry still resolves the historical pathname; they contain no doctrine.
