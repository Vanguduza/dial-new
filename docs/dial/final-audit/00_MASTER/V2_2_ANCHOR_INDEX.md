# DIAL v2.2 Anchor Index

The single map of where authority lives. Open this before anything else.

## Master

- Closure canon → `DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md`
- Active plan → `DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md`
- Active development prompt → `../13_PROMPTS/DIAL_MASTER_DEVELOPMENT_PROMPT_v2_1.md`
- Readiness → `BUILD_READINESS_SCORECARD.json`
- Closure validation → `../20_IMPLEMENTATION_CLOSURE/14_VALIDATION/CLOSURE_TEST_REPORT.md`
- Module expansion (canon extension) → `DIAL_Module_Expansion_and_Operational_Realisation_Architecture_v1.md`
- Gate ladder (single canonical progression) → `../20_IMPLEMENTATION_CLOSURE/13_GATE_LADDER/GATE_LADDER_CANON.md`
- Security classes S1-S4 → `../17_SECURITY/SECURITY_CLASS_CANON.md`

## Implementation closure

- Feature contracts → `../20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/`
- Eventualities → `../20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/`
- Donors → `../20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/`
- NFR → `../20_IMPLEMENTATION_CLOSURE/04_NFR/`
- Environments → `../20_IMPLEMENTATION_CLOSURE/05_DEPLOYMENT/`
- Activation blockers → `../20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/`
- Human operating model → `../20_IMPLEMENTATION_CLOSURE/07_OPERATING_MODEL/`
- Master data → `../20_IMPLEMENTATION_CLOSURE/08_MASTER_DATA/`
- API/event/workflow versioning → `../20_IMPLEMENTATION_CLOSURE/09_CONTRACT_VERSIONING/`
- Branch activation → `../20_IMPLEMENTATION_CLOSURE/10_ACTIVATION_CONFIG/`
- Repository alignment → `../20_IMPLEMENTATION_CLOSURE/11_REPOSITORY_ALIGNMENT/`
- Claude Code operating model → `../20_IMPLEMENTATION_CLOSURE/12_DEVELOPMENT_SYSTEM/`

## Realization and security

- Realization registries → `../11_FEATURE_REALIZATION/`
- Security profiles and controls → `../17_SECURITY/`
- Customer endpoints → `../12_CLIENT_EXPERIENCE/`
- Finance, positions, payments → `../18_FINANCE_PEOPLE/`
- Home, identity, WhatsApp → `../16_HOME_IDENTITY_WHATSAPP/`

## Commerce frontend and Spare transition (v2.1 decisions)

- Donor strategy → `../22_COMMERCE_FRONTEND_AND_TRANSITION/01_DONOR_STRATEGY/`
- Donor matrix → `../22_COMMERCE_FRONTEND_AND_TRANSITION/01_DONOR_STRATEGY/DONOR_ASSIMILATION_MATRIX_v2_1.json`
- Transition/EPC integration lock → `../22_COMMERCE_FRONTEND_AND_TRANSITION/02_TRANSITION_EPC_LOCK/TRANSITION_EPC_INTEGRATION_LOCK.md`
- Frozen: Catalog Agent prompt → `../22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md`
- Frozen: Vehicle-to-EPC blueprint → `../22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md`
- Implementation sequence → `../22_COMMERCE_FRONTEND_AND_TRANSITION/04_DEVELOPMENT_PLAN/UPDATED_DEVELOPMENT_PLAN_v2_1.md`
- Source registry → `../22_COMMERCE_FRONTEND_AND_TRANSITION/05_SOURCES/UPDATED_SOURCE_REGISTRY.md`
- Pack production guide (working notes, not canon) → `../22_COMMERCE_FRONTEND_AND_TRANSITION/06_TRANSITION_ENGINE/TRANSITION_ENGINE_PACK_PRODUCTION_GUIDE.md`

## Repository harness (applied, at repository root)

- Entry authority → `/CLAUDE.md`
- Project Truth → `/agent-system/canon/PROJECT_TRUTH.md`
- Feature Registry → `/agent-system/registries/FEATURE_REGISTRY.json`
- Bounded context retrieval → `/agent-system/bin/context-get.mjs`
- Gates → `/agent-system/bin/` and `npm run verify`
- Governor plugin → `/dial-development-governor/`

## Superseded

`../ARCHIVE/` — v1.6 and v2.0 entry points, anchor indexes and manifests. Provenance only.
