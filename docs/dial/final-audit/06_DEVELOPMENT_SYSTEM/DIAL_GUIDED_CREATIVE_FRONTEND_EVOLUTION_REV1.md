# DEC-039 amendment — external references are inspiration only

The guided-generation mechanisms in this document remain active, but `DEC-039` supersedes `DONOR_ADAPT`, `DONOR_PRESERVE`, donor-semantic-preservation and donor-screen authority. Reference-informed design is now `REFERENCE_INSPIRED_DIAL_NATIVE`: Product Truth and the canonical Screen Registry × Feature Graph remain superior, external repositories contribute only synthesized abstract inspiration descriptors, Stitch authors a new DIAL-native candidate, and DDE productionizes accepted DIAL experience authority. Raw donor screens/code/components/assets/schemas/business logic are not implementation or visual authority.

# DIAL Guided Creative Frontend Evolution — Rev 1

**Subordinate to:** `DIAL_DEVELOPMENT_PRODUCT_INTELLIGENCE_AUTOMATION_ARCHITECTURE_REV_3_1.md` (§6, §28)
**Decision:** `DEC-037`
**Status:** Implemented
**Evidence:** `DIAL_REV_3_1_IMPLEMENTATION_EVIDENCE.md`

## 1. Position in the existing pipeline

Guided generation sits **upstream of candidate admission and downstream of Product Truth
projection**. The pipeline it composes with is unchanged:

```
projectDesignAuthority()
    ↓
design packet enrichment            ← Screen Quality Packet enters here
    ↓
guided multi-candidate generation   ← new
    ↓
quarantineDesignArtifact()          ← unchanged
    ↓
critic / evaluation evidence        ← new
    ↓
admitDesignCandidate()              ← unchanged for legacy callers
    ↓
promotion / visual authority        ← unchanged authority rules
    ↓
implementation → parity verification
```

Backward compatibility is measured, not asserted. `guided-design-architecture-check.mjs`
imports `HEAD`'s copy of `design-authority-projector.mjs`, `design-provider-router.mjs` and
`design-candidate-admission.mjs` and compares their output against the current modules for
every legacy input, including hashes. A drift fails the gate.

## 2. The schema correction

`design_mode` has always carried **provenance**. It keeps that meaning and its serialized
position, and gains `design_provenance_mode` as an explicit semantic alias. Iteration phase is
a new and separate field.

```yaml
design_context:
  design_provenance_mode: DONOR_ADAPT     # NEW_DIAL_DESIGN | DONOR_ADAPT | DONOR_PRESERVE | LOCKED_BASELINE_REPAIR
  design_iteration_phase: EXPLORE         # EXPLORE | CONVERGE | RECONSTRUCT
```

Both can be true at once. The vocabularies are disjoint and each rejects a value from the
other axis: passing `EXPLORE` as a provenance mode throws, and so does the reverse.

When no iteration phase is supplied the projection is **byte-identical** to the pre-guided one,
so stored projection hashes, existing packets and donor checks are untouched.

## 3. Freedom is a budget, not a request

`PHASE_FREEDOM_CEILINGS` encodes Principle 7 as a table, and total latitude strictly decreases
`EXPLORE > CONVERGE > RECONSTRUCT`. Five dimensions carry meaning rather than appearance and
are pinned to `none` in every phase, whether or not they are requested:

`navigation_semantics`, `business_logic`, `money_behavior`, `security_behavior`,
`donor_semantics`.

Asking for latitude over any of them fails the budget with
`SEMANTIC_FREEDOM_FORBIDDEN:<dimension>`. Candidates also may not be *diversified* over them.

## 4. Screen Quality Packet

Built by `buildScreenQualityPacket`, carrying: frozen Product Truth and its hash, the design
authority projection hash, intent and hierarchy, both design-state axes, design grammar,
creative direction, the freedom budget, references, the prohibited-pattern set from the
registry, candidate count and diversity policy, the critic manifest and the acceptance
contract.

It refuses to build when the run would be incoherent: `EXPLORE` outside 2–4 candidates, any
later phase with more than one, a missing mandatory critic, a donor mode without the donor
critic, diversity declared over a semantic dimension, or absent Product Truth.

`assertProductTruthInvariant` proves every candidate in a run was generated against the same
Product Truth hash, which catches a provider quietly re-briefed mid-run.

## 5. Anti-patterns are one versioned registry

`agent-system/registries/DESIGN_ANTI_PATTERN_REGISTRY.json` holds an `enforced_baseline` —
the six patterns `design-authority-projector.mjs` has always emitted, never reduced — and a
`guided_additional` set of twelve. `loadDesignAntiPatterns` throws if the registry ever drops
a baseline pattern. Prompts read the registry; they do not carry their own copies, because two
copies drift.

## 6. Critics produce evidence, not opinions

Seven structural critics (`product`, `donor`, `ux`, `visual`, `accessibility`, `responsive`,
`implementation`) each emit a hashed `DesignCriticReport` with named findings at `BLOCKING`,
`MAJOR` or `MINOR`. One rule decides acceptance in one place: any blocking finding rejects.

A candidate declares its own structure — actions, states, displayed values and their sources,
controls, navigation, contrast pairs, touch targets, breakpoints, components, bindings. A
provider that will not declare fails the product critic rather than passing silently.

These are deterministic structural critics; they do not judge beauty. A model-based aesthetic
critic is a provider behind the same contract, and its findings arrive through
`mergeCriticReports` in the same shape.

`admitDesignCandidate` makes critic rejection binding for guided candidates: no evidence, a
rejecting verdict, or evidence belonging to another candidate each refuse admission. This is
what stops functional correctness passing a visually degraded screen.

## 7. Diversity is bounded in both directions

A run fails for being too similar (`INSUFFICIENT_DIVERSITY`) **and** for being too different
(`SEMANTIC_DRIFT_ACROSS_CANDIDATES`). Variable: section composition, imagery position, surface
strategy, emphasis, typography proportion. Fixed: Product Truth, required content, navigation
semantics, donor semantics, money behaviour, security behaviour.

## 8. Convergence, synthesis, freeze

A convergence packet must state `preserve` / `correct` / `improve` / `forbid`, may not select
a rejected candidate, and may not leave a blocking finding unaddressed.

Synthesis emits a **regeneration brief**, never a merged artifact. `buildSynthesisManifest`
refuses any contribution carrying an `artifact_fragment`, so §6.13's prohibition on collage is
structural rather than advisory.

`freezeVisualAuthority` requires `OWNER` or `AUTHORIZED_DESIGN_AUTHORITY`. No agent may
promote on its own evidence. The frozen authority locks composition, hierarchy, section order
and design tokens, and its identity hash excludes the promotion timestamp.

## 9. RECONSTRUCT parity

`verifyReconstructionParity` fails on a locked-dimension deviation or a design-token drift even
when every required action and state is present. An implementation that "improves" the accepted
design into a different screen is caught there.

Golden screens require a visual authority, passing parity evidence and explicit validation.
They define a quality floor and family resemblance; they do not force identical composition
across DIAL products.

## 10. Learning

Only the accepted, evidenced candidate teaches reusable design knowledge. Rejected candidate
content is withheld — except its anti-pattern findings, which are exactly the knowledge worth
keeping.

## 11. Provider contract

Every provider declares `provider_id`, `authority: NON_AUTHORITATIVE_CANDIDATE`, qualification
state, health, supported phases, inputs and outputs, and sensitive-data posture. An undeclared
provider is never eligible; there is no permissive default, because "unknown capability" and
"capable" are not the same thing. A provider outage falls back to a qualified route without
relaxing acceptance, and when nothing is eligible the router fails closed.

## 12. Surfaces

| Concern | Module |
| --- | --- |
| both design axes, anti-pattern loading | `agent-system/orchestration/design-authority-projector.mjs` |
| packet, freedom budget, Product Truth | `agent-system/orchestration/screen-quality-packet.mjs` |
| seven critics and the merge contract | `agent-system/orchestration/design-critics.mjs` |
| diversity, convergence, synthesis, freeze, parity, golden screens | `agent-system/orchestration/design-convergence.mjs` |
| phase-aware provider routing | `agent-system/orchestration/design-provider-router.mjs` |
| guided admission | `agent-system/orchestration/design-candidate-admission.mjs` |
| gate | `agent-system/orchestration/guided-design-architecture-check.mjs` (`agent:design:guided-check`) |
| negative tests + Dial a Spare certification | `tests/orchestration-guided-design.test.mjs` |

## 13. Research instruction and required evidence

Frontend research must assess `EXPLORE`, `CONVERGE` and `RECONSTRUCT` independently. It must
name the applicable freedom budget, keep navigation, business logic, money, security and donor
semantics fixed, and provide evidence relevant to every mandatory critic. Candidate diversity
is evidence only within the declared visual dimensions; it is not permission for semantic drift.

The admissible evidence chain is sanitized research packet → cited provider result → candidate
identity → hashed critic reports → convergence or rejection → authorised visual-authority
promotion. Missing or rejected critic evidence cannot be replaced by prose or model confidence.
