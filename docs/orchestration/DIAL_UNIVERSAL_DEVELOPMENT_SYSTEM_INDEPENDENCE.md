# DIAL Universal Development System Independence

**Decision:** `DEC-043`  
**Status:** LOCKED architecture; repository foundation implemented; live universal E2E certification pending.  
**Authority:** Product owner → Project Truth → Hermes normal authority plane.

## 1. Governing identity

The DIAL Development System is a complete, independent, end-to-end development system.

It must be capable of developing arbitrary admitted projects without depending on
the runtime, state, memory, authority or deployment lifecycle of another development
system.

DDE is a separate independent development system. From DIAL's perspective, DDE is
one project target:

```text
OWNER
  |
 VAN
  |
Hermes
  |
DIAL DEVELOPMENT SYSTEM
  |
  +-- DIAL products
  +-- VAN
  +-- DDE  <--- independent development system developed as a project
  +-- GTR Auto
  +-- AECI Maintenance
  +-- future unrelated projects
```

The development relationship does not imply runtime coupling:

```text
DIAL mission
  -> DDE repository change
  -> DDE CI / verification
  -> DDE release

DDE then continues operating independently.
```

## 2. Hard independence contract

The following are canonical:

```text
DIAL change       != automatic DDE change
DDE change        != automatic DIAL change
DIAL failure      != DDE failure
DDE failure       != DIAL failure
DIAL Product Truth != DDE Product Truth
DIAL mutable memory != DDE mutable memory
DIAL authority    != DDE authority
DIAL deployment   != DDE deployment
```

DDE may be researched as a donor/reference. Any adopted pattern becomes a DIAL-owned
implementation only after normal research, qualification, Product Truth, implementation
and verification.

## 3. Complete DIAL-owned E2E pipeline

DIAL owns every normal capability required to take a project from intent to a
verified release:

```text
Project admission
Repository/baseline intelligence
PRD and owner-intent normalization
Product Truth compiler
Authority and decision compiler
Development Unit graph
Feature Registry / Feature Graph
Screen Registry x Feature Graph
State / workflow / event / data / API contracts
VEKL research and qualified knowledge
SPMRF shared project memory / context cache
Architecture / security / reliability engineering
UX/UI research and design
Frontend development
Backend development
Data/schema engineering
Infrastructure engineering
Automation/browser engineering
Provider/model/tool routing
Implementation DAG
Atomic implementation packets
Isolated execution/workspaces
Testing and mutation
Independent checkpoint review
Evidence / anti-gap closure
Environment certification
Release / migration / rollback
Production certification
Continuous evolution / truth-change impact
Recovery
```

DDE is not used to fill any missing layer in this list.

## 4. Project model

Every development target has an explicit project identity and isolated state.

Canonical project classes:

```text
PRODUCT_PROJECT
INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT
APPLICATION_PROJECT
LIBRARY_PROJECT
INFRASTRUCTURE_PROJECT
RESEARCH_PROJECT
```

The DIAL Development System itself is classified separately as `DEVELOPMENT_SYSTEM`.

DIAL-branded products are project tenants. A shared monorepo does not collapse
logical project boundaries: shared-repository projects must declare distinct scope
selectors.

Future projects are admitted by registry data rather than by adding project-specific
allowlists to reusable orchestration code.

## 5. DDE project contract

The seed registry records DDE as:

```yaml
project_id: dde
classification: INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT
repository:
  origin_url: https://github.com/Vanguduza/dde.git
  default_branch: main
independence:
  runtime_dependency_of_dial_development_system: false
  authority_dependency_of_dial_development_system: false
  shared_product_truth: false
  shared_mutable_memory: false
  shared_deployment_lifecycle: false
```

Any future bounded integration must be explicit and may not silently erase those
separate authority/state/lifecycle boundaries.

## 6. Hermes and VAN

Hermes remains the single normal DIAL orchestration authority plane.

VAN is the owner cockpit, not a second development authority. VAN exposes project,
mission, workspace, review, memory, knowledge, evidence, gate, release,
infrastructure, recovery and attention state from the DIAL Development System.

A project shown inside VAN does not acquire DIAL-system authority.

## 7. Project-scoped memory and research

SPMRF and VEKL are DIAL Development System capabilities.

All project-scoped data is namespaced by `project_id`.

Cross-project reuse occurs only through explicitly admitted shared knowledge
artifacts or explicit grants. Raw project memory does not leak across projects.

Native ChatGPT/Claude account memory is never project authority.

## 8. Frontend independence

DIAL owns its own frontend/design pipeline:

```text
Product Truth
 -> Screen Registry x Feature Graph
 -> truth hydration
 -> qualified design knowledge
 -> design-provider packet
 -> visual/interaction authority
 -> DIAL-native production binding
 -> implementation
 -> visual + interaction + functional parity
```

DDE is not the production-binding layer.

DDE may implement a similar pipeline independently; that similarity creates no
dependency.

## 9. Auxiliary intelligence independence

DIAL HAIF is installed and operated only as DIAL infrastructure.

The DIAL installer does not create a DDE HAIF service, read a DDE control root or
manage DDE credentials. Reusable HAIF code can operate under arbitrary valid DIAL
project IDs, with explicit project/account state.

If DDE chooses to use xKiro or equivalent infrastructure, DDE owns that capability.

## 10. Universal project readiness

Every project processed by DIAL must independently compile the preparation contract:

```text
Gate 0  baseline
Gate 1  Product Truth
Gate 2  Development Unit graph
Gate 3  Feature graph
Gate 4  Screen Registry
Gate 5  bidirectional Screen x Feature proof
Gate 6  research
Gate 7  architecture
Gate 8  failure/recovery
Gate 9  implementation readiness
Gate 10 verification
Gate 11 closure
Gate 12 operations
```

The DIAL Development System itself additionally carries an independence/universality
certification condition: no required E2E development stage may rely on DDE.

## 11. Causal integration law

For every reusable component:

```text
producer
 -> typed/durable state
 -> consumer
 -> production caller
 -> observable effect
 -> evidence
 -> verifier
```

A class, endpoint, screen or registry entry existing without a real production caller
does not count as integration.

## 12. Universal certification matrix

DIAL is not certified universal until all four classes succeed through the same
pipeline:

1. **DIAL product project** — e.g. DIAL Groceries.
2. **Independent development-system project** — DDE.
3. **Existing non-DIAL application** — e.g. GTR Auto.
4. **Clean-slate unrelated project** — an intentionally unrelated reference product.

The fourth class must not require a code change to introduce a new project identifier,
a DIAL-product schema workaround, or a DDE dependency.

## 13. Counterexamples that keep certification open

Any of the following falsifies completion:

```text
DIAL frontend work fails when DDE is offline
DIAL installer creates or manages DDE runtime services
DIAL reusable code permits only dial and dde project IDs
DDE memory is read as DIAL memory without explicit admission
a DDE authority record mutates DIAL Product Truth
a DIAL change automatically deploys into DDE
DDE changes alter DIAL runtime without a DIAL project mission
an unrelated project cannot pass the same preparation pipeline
a DIAL product becomes implicit development-system authority
a shared monorepo collapses two project scopes
the UI reports BUILD_READY while an applicable gate is failed
```

## 14. Repository enforcement

The active foundation is enforced by:

```text
agent-system/registries/UNIVERSAL_PROJECT_REGISTRY.json
agent-system/orchestration/project-registry.mjs
agent-system/orchestration/project-repository-resolver.mjs
agent-system/orchestration/auxiliary/authority-gate.mjs
agent-system/orchestration/auxiliary/r2-evidence-store.mjs
agent-system/orchestration/auxiliary/quota-allocator.mjs
agent-system/orchestration/auxiliary/haif-tenant-daemon.mjs
agent-system/orchestration/providers/xkiro/xkiro-qualification.mjs
agent-system/orchestration/providers/xkiro/elite-benchmark.mjs
deploy/oracle/hermes-codex/install-haif.sh
agent-system/orchestration/frontend-generation-architecture-check.mjs
docs/dial/architecture/CANONICAL_FRONTEND_GENERATION_ARCHITECTURE.md
tests/universal-development-system-independence.test.mjs
```

## 15. Maturity truth

This repository change establishes the architecture and executable foundation. It
does **not** by itself prove production universality.

The following still require runtime/evidence certification after merge/deployment:

```text
non-DIAL local project checkout admission
DDE project mission through the normal DIAL pipeline
clean-slate unrelated project full pipeline
cross-project isolation mutation tests in live services
multi-project VAN owner UX
DIAL-native frontend E2E on an unrelated UI project
release/rollback drill
recovery drill
```

The system may claim those states only after corresponding evidence exists.

## Final invariant

> The DIAL Development System develops projects. DDE and DIAL products are projects
> from its perspective. DDE remains an independent development system, and DIAL
> remains complete even when DDE does not exist.
