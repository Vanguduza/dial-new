# DIAL VEKL Open-World Discovery & Knowledge Qualification — Rev 1

**Subordinate to:** `DIAL_DEVELOPMENT_PRODUCT_INTELLIGENCE_AUTOMATION_ARCHITECTURE_REV_3_1.md` (§5, §28)
**Decision:** `DEC-036`
**Status:** Implemented; adapters, executable trials and horizon scanning ship disabled
**Evidence:** `DIAL_REV_3_1_IMPLEMENTATION_EVIDENCE.md`

## 1. What this adds, and what it does not replace

The admitted VEKL corpus, its `T0_DIAL_PROJECT` → `T4_COMMUNITY_SIGNAL` source tiers,
`ENGINEERING_RESOURCE_SOURCE_REGISTRY.json`, `ENGINEERING_RESOURCE_REGISTRY.json` and the
GraphRAG determinism policy are unchanged. This document adds a **staging plane** in front of
them and a **retrieval contract** behind them.

Nothing here creates a second trust vocabulary. A discovery candidate is not a registry row;
admission converts one into a registry row using the existing vocabulary, or it does not
happen.

## 2. The two axes

| | Question it answers | Values |
| --- | --- | --- |
| `lifecycle_state` | How far has DIAL evaluated this? | `DISCOVERED` → `TRIAGED` → `INVESTIGATING` → `EXPERIMENTAL` → `QUALIFIED` → `ADMITTED`; also `REJECTED`, `SUPERSEDED`, `DEPRECATED`, `QUARANTINED` |
| `trust_tier` | What authority class is the source? | `T0_DIAL_PROJECT` … `T4_COMMUNITY_SIGNAL` (existing) |

Conflating them is the specific failure this design prevents: a community repository DIAL
sandboxed successfully is still community material. `assignTrustTier` never reads trial
results — the function takes provenance and the finding adapter, and nothing else.

`agent-system/registries/DISCOVERY_POLICY.json` holds the transition table, the evidence each
transition requires, the tier rules and the adapter caps. The code reads that file; it does
not restate it.

## 3. Tier assignment is fail-closed

A tier is granted only when every declared requirement is satisfied by provenance, and the
adapter that found the candidate caps what it can claim. An unverifiable claim falls to
`T4_COMMUNITY_SIGNAL`, never upward.

- `T0_DIAL_PROJECT` — `open_world_assignable: false`. Unreachable from discovery, full stop.
- `T1_OFFICIAL` — requires `official_publisher_verified` **and** a canonical locator on the
  publisher's own domain or repository. Successful experimentation never promotes to T1.
- `T2_MAINTAINER_COMMUNITY` — requires a linked maintainer identity.
- `T3_COMMUNITY_CORROBORATION` — requires at least two independent corroborations.
- `T4_COMMUNITY_SIGNAL` — the default. A T4 source may lead DIAL to a T1 source; it does not
  inherit that source's authority.

## 4. Identity and the ledger

`normalizeLocator` collapses views of one resource onto one identity: scheme, host and path,
with GitHub `owner/repo` treated as the identity and `tree/`, `blob/` and `issues/` treated as
views of it. `candidateIdFor` derives `DISC-<24 hex>` from that identity, so two adapters
finding the same repository produce one candidate and the second sighting becomes
corroboration rather than a duplicate row.

`DISCOVERY_CANDIDATE_REGISTRY.json` is history-preserving. Every transition appends a hashed
record; `verifyAppendOnly` fails a truncated or rewritten history, and
`validateCandidateRegistry` additionally re-checks every recorded hop against the live
transition table, so a ledger edited by hand into an impossible shape is caught.

## 5. Sensitive context never leaves

Discovery queries are built from abstracted engineering intent by `buildDiscoveryQuery`, which
refuses outright when the payload matches any denylist class: secrets, API keys, service-role
references, payment details, customer identifiers, private order data, identifiable Health
information, owner credentials or production database content. The refusal names the class
that fired. There is no "probably fine" branch, because a false negative here is disclosure
that cannot be undone.

## 6. Trial is not activation

An unknown executable resource may be evaluated only under an isolation contract checked
**before** execution. A single unsatisfied property produces a `REFUSED` manifest rather than
a degraded run:

- ephemeral sandbox, rooted outside the repository;
- environment built by allowlist, not by redacting a copy of `process.env`;
- no DIAL credential, production secret, service-role key or Oracle control credential;
- no Project Truth or production-database write path; no sensitive fixtures;
- network deny-by-default; an egress allowlist is required when network is enabled and
  forbidden when it is not;
- CPU, memory, disk, process and wall-clock limits at or below policy ceilings;
- an exact revision, artifact hash and dependency inventory captured before the trial starts,
  so the thing evaluated and the thing admitted are provably the same.

The manifest declares `authority: TRIAL_EVIDENCE_NOT_AUTHORIZATION` on its face.

## 7. Executable admission

`DISCOVERY → IMMUTABLE_IDENTITY_RESOLUTION → EXACT_REVISION_PIN → LICENSE_REVIEW →
PROVENANCE_VERIFICATION → STATIC_INSPECTION → DEPENDENCY_SECURITY_REVIEW → ISOLATED_EXECUTION
→ TASK_SPECIFIC_EVALUATION → DONOR_SECURITY_EVAL_PROVENANCE_RECORD → QUALIFICATION →
REGISTRY_ADMISSION → GOVERNED_ACTIVATION_ELIGIBILITY`

Every stage is mandatory for executable material. A mutable reference is refused however good
the trial was, and a trial whose revision differs from the admitted pin is evidence about a
different artifact. Admission additionally refuses a `T0` claim and refuses to re-tier a source
family that already exists at another tier — a second source row for one publisher is a second
trust vocabulary under another name.

## 8. Two planes, one boundary

The canonical/admitted plane and the discovery/candidate plane need not be separate databases;
they need a boundary a resolver cannot cross by accident. `buildTrustProjection` emits, per
item: plane, lifecycle state, trust tier, authority role, exact version, source hash, admitted
timestamp, freshness state, executable eligibility, sensitive-data eligibility and task classes.

`enforceRetrievalBoundary` **removes** violations rather than flagging them, and returns the
audit record of what it withheld. A candidate-plane item whose tier would imply `AUTHORITY` is
demoted to `CORROBORATION` at projection time, so it cannot carry authority even if a caller
asks for it explicitly.

## 9. Reassessment

Admitted resources move between `CURRENT`, `STALE`, `SUPERSEDED`, `DEPRECATED` and `REVOKED`.
Reassessment may recommend review. It may not rewrite Project Truth and may not change
programme priority — and no discovery trigger, horizon scanning included, may reprioritise the
Development Plan.

## 10. Rollback

Disable the adapters; admitted-registry retrieval continues unchanged. Discovery evidence is
never deleted (`discovery_evidence_deletion_forbidden`).

## 11. Surfaces

| Concern | Module |
| --- | --- |
| lifecycle, identity, tiering, ledger | `agent-system/orchestration/discovery-lifecycle.mjs` |
| outbound payload sanitization | `agent-system/orchestration/discovery-sanitizer.mjs` |
| isolated evaluation | `agent-system/orchestration/discovery-sandbox.mjs` |
| qualification and admission | `agent-system/orchestration/discovery-admission.mjs` |
| two-plane retrieval contract | `agent-system/orchestration/discovery-graph-projection.mjs` |
| gate | `agent-system/orchestration/discovery-architecture-check.mjs` (`agent:vekl:discovery-check`) |
| negative tests | `tests/orchestration-vekl-discovery.test.mjs` |

## 12. Research instruction and required evidence

Research workers receive only sanitized `PUBLIC_RESEARCH_ONLY` intent. For every newly found
resource they must return the candidate locator, publisher/provenance basis, exact version or
revision where one exists, freshness observation, contradictions and unresolved unknowns.
Discovery output remains non-authoritative candidate evidence: it cannot mint T0, promote a
trust tier from trial success, activate executable content or rewrite programme priority.

Evidence is the persisted provider packet hash, response hash and admitted result only after
schema/citation validation. An absent provider response is `NOT_STARTED` or blocking state,
never a synthetic finding. The 309-DU inventory, 17 dimensions (5,253 cells) and all 18
research roles remain the coverage boundary.
