# DIAL v2.2 Anchor Index

The single map of where authority lives. Open this before anything else.

## Master

- Closure canon → `DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md`
- Active plan → `DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md`
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

## Grocery Rounds (v2.2 addition, proposed)

- Master plan (marked LOCKED PRODUCT DIRECTION) →
  `../25_GROCERY_ROUNDS/GROCERY_ROUNDS_MASTER_PLAN_v1.md`
- Review and blocking findings →
  `../25_GROCERY_ROUNDS/GROCERY_ROUNDS_REVIEW_v1.md`
- Features `GROC-F019`–`GROC-F034`, all `SPECIFIED`. **Unresolved:** the
  money-holding model conflicts with `TECH-F009` (Job Reserve / protected funds)
  and `ACT-REG-001` (licensed hold-and-release). Gated additionally on
  `ACT-REG-004` (fiscalisation/VAT) and `ACT-REG-007` (insurance
  characterisation).


## Growth, marketing & promotions (2026-09-06 canon extension)

- Canonical architecture, feature audit, page catalog, atomic mapping and commercial RAG profile → `../27_GROWTH_MARKETING_PROMOTIONS/DIAL_GROWTH_MARKETING_PROMOTIONS_CONTROL_CENTRE_REV2.md`
- Machine authority → `/agent-system/registries/FEATURE_REGISTRY.json` (`65` `GMPC-F*` anchors, all `SPECIFIED`) plus the realization, security and implementation-contract registries.
- `A001..A195` are the atomic feature-to-page acceptance inventory beneath the GMPC feature anchors.
- `GMPC-F200..F211` specialize the existing DKRF (`DKRF-F001..F022`); they do **not** establish a second RAG/vector authority.
- Promotion/campaign economics consume `PLAT-F014` and canonical Finance/Ledger; GMPC does not own a second pricing/money engine.
- Current programme priority does not change: GMPC is canonical breadth, but each GMPC feature remains `SPECIFIED` until it receives its dedicated acceptance contract and enters the normal gate ladder.

## Injection standards (what arrives from outside)

The catalogue and the transition flow packs are produced by separate pipelines
and injected when complete. This repository does not audit them; it states what
it accepts and checks a bundle at injection.

- Catalogue → `../24_INJECTION_STANDARDS/CATALOG_DATA_INJECTION_STANDARD_v1.md`
- Flow packs → `../24_INJECTION_STANDARDS/TRANSITION_FLOW_PACK_STANDARD_v1.md`
- Executable: `validateCatalogueInjection` (catalogue) and `npm run verify` +
  `npm run test:e2e` (flow packs).

## Knowledge & retrieval (v2.2 addition)

- Architecture (proposed, not built) → `../23_KNOWLEDGE_RETRIEVAL_FABRIC/DKRF_ARCHITECTURE_v1.md`
- Review and required changes → `../23_KNOWLEDGE_RETRIEVAL_FABRIC/DKRF_ARCHITECTURE_REVIEW_v1.md`
- Features `DKRF-F001`–`DKRF-F022`, all `SPECIFIED`. No code, no per-feature
  acceptance contracts yet, and two packages gated on open activation blockers
  (ACT-REG-011 content rights, ACT-REG-005 cross-border/DPO).

## Development engineering knowledge (VEKL — adopted 2026-09-07)

- Canonical architecture → `../06_DEVELOPMENT_SYSTEM/DIAL_VERSIONED_ENGINEERING_KNOWLEDGE_LAYER_GOOGLE_SKILLS_HERMES_v1.md`
- Tooling/activation policy → `../06_DEVELOPMENT_SYSTEM/TOOLING_USE_POLICY.md`
- Decisions → `/agent-system/registries/DECISION_LOG.json` (`DEC-019` immutable-skill foundation; `DEC-020` federated resources + ahead-of-work research)
- Skill/provenance/conflict/bundle registries → `/agent-system/engineering-knowledge/`
- Federated source/resource registries → `/agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_SOURCE_REGISTRY.json`, `ENGINEERING_RESOURCE_REGISTRY.json`
- Ahead-of-work research → `/agent-system/orchestration/engineering-research-manager.mjs`, `engineering-presearch.mjs`; Oracle state under `/var/lib/dial-control/knowledge/research/`
- Runtime broker/resolver/activation/outcome/learning → `/agent-system/orchestration/`
- Oracle project-scoped runtime state → `/var/lib/dial-control/knowledge/` (runtime, not canonical repository content)
- `android/skills@bac232fd02b0855df9275281a2a7a47643768719` is now the production pin for the selected qualified Android paths only. Adaptive Compose, Navigation 3, Edge-to-edge and Android Intent Security are approved with exact hashes and immutable Oracle snapshots; Android CLI remains quarantined and Testing Setup remains unapproved directly. The separately versioned DIAL wrappers `dial.android.device-verification` and `dial.android.testing-setup` are also approved as immutable guidance and are the governed alternatives for those blocked upstream procedures. `google/skills` remains research-reference-only until selected paths pass the same gate.

## Repository harness (applied, at repository root)

- Entry authority → `/CLAUDE.md`
- Project Truth → `/agent-system/canon/PROJECT_TRUTH.md`
- Feature Registry → `/agent-system/registries/FEATURE_REGISTRY.json`
- Bounded context retrieval → `/agent-system/bin/context-get.mjs`
- Gates → `/agent-system/bin/` and `npm run verify`
- Governor plugin → `/dial-development-governor/`

## Superseded

`../ARCHIVE/` — v1.6 and v2.0 entry points, anchor indexes and manifests. Provenance only.
