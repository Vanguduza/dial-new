# DIAL Google External Capabilities Rev 3 — Canonical Consolidated Architecture

**Status:** CANONICAL TARGET / owner-authorized adoption in this change set
**Prepared:** 2026-09-11
**Target repository:** `Vanguduza/dial-new`
**Canonical base at reconciliation start:** `master@b5939d4e3962f4d1f77e713fda46fc2c8868e63a`
**Applies to:** Google Antigravity, Google Stitch, Google Pomelli
**Authority:** subordinate to DIAL Project Truth, locked Decisions, specialist canon, FRC/security/Product Experience authorities, VEKL 2.2 and AEF Rev 2.

This document consolidates and supersedes the Google-tool integration guidance spread across three earlier artifacts. It does **not** replace AEF Rev 2; it closes the provider-specific integration gap that AEF Rev 2 left open.

## 0. Reconciled source lineage

| Source | SHA-256 | Retained role |
|---|---|---|
| `DIAL_Antigravity_Stitch_Pomelli_Quantum_Integration_Blueprint.md` | `f943dfbae09b4c49ecb365048a792e85672cfdb292064abcd3483a66ab452595` | Three-tool roles, provider-specific Definitions of Done, Pomelli creative governance, live-program acceptance gate |
| `DIAL_VEKL_Multi_Harness_Stitch_Donor_Integration_Engineering_Spec_v1_1.md` | `20a12ab606cc52b766914367995c45b0466d9ece1ba7955b0b73aee074415e4e` | Harness/HCX concepts, Stitch quarantine, donor boundaries, provider fail-closed behavior |
| `DIAL_ADAPTIVE_EXECUTION_FABRIC_REV2_CANONICAL.md` | `a16181ae561ce0c275806e3a57a573ce32d02142fb4b8f8358cfb46acbaa79c1` | Current VEKL/AEF execution fabric, leases/fencing, worker-only HCX, provider non-authority, execution receipts |

Rev 3 resolves the earlier reconciliation defect: Antigravity and Pomelli may not disappear merely because AEF can continue without them, and Stitch architecture may not be reported as a live provider integration without real provider evidence.
## 1. Correct product categorization

| Capability | Canonical DIAL home | Role | Production runtime dependency | Production content/state authority |
|---|---|---|---:|---|
| **Google Antigravity** | VEKL/AEF development system | Governed engineering worker/harness | No | None |
| **Google Stitch** | Design/development system beneath AEF and Design Authority | Non-authoritative design-generation provider | No | Accepted design evidence only; never runtime authority |
| **Google Pomelli** | **GMPC** | External creative-operations provider | No | Approved creative content may enter GMPC; GMPC retains all lifecycle/commercial authority |

Pomelli is therefore **not a development harness**. The shared external-capability registry records provider admission/maturity only. Functional ownership of Pomelli-derived assets belongs to GMPC.

Pomelli maps into existing GMPC authorities rather than creating a parallel marketing system:

- `GMPC-F050` — AI creative generation workflow;
- `GMPC-F051` — versioned asset library;
- `GMPC-F052` — business-unit brand rules;
- `GMPC-F053` and `GMPC-F140` — creative/approval decision state;
- `GMPC-F060`–`GMPC-F062` — social control/scheduling/publish connectors;
- `GMPC-F170` — marketing/promotion/privacy policy;
- `GMPC-F180`–`GMPC-F181` — immutable audit and provider/service health;
- `GMPC-F202` and `GMPC-F209` — verified creative/commercial memory.

Until those GMPC features advance beyond `SPECIFIED`, the Pomelli integration package is an admitted production-domain substrate, not evidence that the whole GMPC feature set is implemented.
## 2. Current provider surfaces verified at implementation time

Provider surfaces are implementation facts, not DIAL authority. They must be requalified when versions or authentication behavior change.

### 2.1 Antigravity

DIAL uses the official Antigravity CLI headless/SSH path (`agy`). The CLI supports remote sessions and Google Sign-In; on SSH it emits an authorization URL when no active session exists. DIAL does not treat a locally cached Google session as Project Truth or durable provider authority.

The canonical DIAL workspace plugin lives under `.agents/plugins/dial-governed/`. Its hooks translate Antigravity tool events into the existing DIAL pre-tool guard so VEKL stale-context refusal, Task Execution Envelope binding, repository leases/fencing and guarded Project Truth writes remain authoritative.

### 2.2 Stitch

DIAL pins `@google/stitch-sdk` exactly. The canonical transport is the official MCP endpoint `https://stitch.googleapis.com/mcp`. Authentication is `STITCH_API_KEY` or OAuth/access-token plus `GOOGLE_CLOUD_PROJECT`.

DIAL rejects arbitrary `STITCH_HOST`/base-URL substitution. The admitted tool set is explicitly allowlisted; unexpected tools quarantine the provider instead of silently expanding its capabilities.

### 2.3 Pomelli

Pomelli is treated as a human-operated Google Labs creative workstation. DIAL stores no Pomelli browser cookie/session and does not scrape the UI as a surrogate API. A future programmable adapter requires a separately reviewed supported interface and a new provider-admission decision.

Human-generated Pomelli exports enter DIAL only through GMPC quarantine/ingest. Google-provider availability never determines whether a GMPC asset is publishable.
## 3. Authority hierarchy and non-authority invariants

The effective precedence for all three integrations is:

```text
Owner-authenticated Project Truth authority
  > Project Truth / locked Decisions / specialist canon
  > FRC / Security / Product Experience / GMPC commercial authority
  > current Development Unit revision and VEKL evidence
  > AEF Task Execution Envelope / worker eligibility / leases
  > external provider capability state
  > provider output or recommendation
```

No Google provider may create or override:

- identity/auth authority;
- catalogue/product facts;
- pricing, promotion, entitlement, payment or ledger truth;
- GMPC campaign lifecycle/commercial approval truth;
- Health or other specialist-domain authority;
- Project Truth, Decision state or feature completion evidence;
- production runtime state merely because the provider generated an artifact.

Generated code, design or creative content is an **untrusted candidate** until DIAL normalizes, validates and admits it through the authority that owns the target domain.
## 4. External Capability Admission Layer and maturity model

All three providers are registered in `EXTERNAL_CAPABILITY_REGISTRY.json`. This registry records provider role, supported transport, required proofs, kill switches and forbidden authority. It does not own Pomelli creative state.

The canonical maturity vocabulary is:

```text
DISCOVERED
  → IMPLEMENTED
  → AUTH_REQUIRED
  → AUTHENTICATED
  → LIVE_QUALIFIED
  → ORCHESTRATED
  → INTEGRATED
```

`DEGRADED`, `DISABLED` and `QUARANTINED` are non-progress terminal/temporary states.

Hard rule:

> `INTEGRATED` may be claimed only when the provider-specific Definition of Done passes, live qualification evidence passes, and orchestrated-use evidence passes. Architecture, fixture tests, fallback availability or provider discovery are never sufficient.

`google-capability-program-check.mjs` enforces two separate gates:

- `ARCHITECTURE_GREEN` — static implementation and authority boundaries are present; credentials are not required;
- `PRODUCTION_GREEN` — `--require-live`; every provider has valid persisted `INTEGRATED` evidence.

This split is mandatory so ordinary CI can remain credential-free without creating another false-green integration claim.
## 5. Antigravity — governed engineering worker

Antigravity participates only beneath VEKL/AEF as an `EXECUTION_WORKER`. It is never manager-runtime eligible and never replaces Hermes, Project Truth, VEKL, AEF, Codex or Claude.

Implementation requirements:

1. official `agy` CLI **1.2.0** installed from the admitted Linux release asset and verified against the platform-specific SHA-256 before extraction;
2. Google authentication completed through the CLI's supported sign-in path;
3. workspace plugin is repository-scoped and versioned;
4. DIAL hooks apply the existing pre-tool guard before consequential actions;
5. material tasks require current VEKL activation and Task Execution Envelope;
6. repository writes require worktree lease and fencing token;
7. direct protected-branch writes and production secrets are unavailable;
8. headless result is normalized and hashed;
9. live canary proves actual provider execution;
10. guarded-write and network/permission denial are evidenced;
11. a real low-risk Development Unit is selected by HCX and executed through `hcx-worker-executor.mjs` with current envelope, lease and fencing-token checks before it emits independently verifiable worker evidence and a Development Execution Receipt;
12. failure reroutes through normal approved workers without weakening acceptance gates.

Kill switch: `DIAL_ANTIGRAVITY_ENABLED=false`.

Antigravity may be unavailable, rate-limited or unauthenticated without blocking DIAL development. That fallback property proves resilience only; it does not prove Antigravity integration.
## 6. Stitch — governed design-generation provider

Stitch is a non-authoritative design provider beneath existing DIAL Design Authority and AEF. Its output is never executable merely because the provider returned HTML.

Implementation requirements:

1. exact-pinned `@google/stitch-sdk`;
2. fixed MCP endpoint; arbitrary host override forbidden;
3. API key or OAuth credentials injected only in tooling/server scope;
4. MCP tool names checked against the DIAL allowlist;
5. unexpected tools quarantine the provider;
6. live health proves authenticated tool discovery;
7. live sandbox slice creates one synthetic non-production screen;
8. HTML and screenshot URLs must be HTTPS and on admitted Google artifact hosts;
9. redirects are not followed across the artifact boundary;
10. byte limits, content hashes and quarantine apply before admission;
11. unsafe HTML is rejected by existing DIAL design-candidate controls;
12. candidate/accepted design manifests bind provider output to current DIAL design authority;
13. one real DIAL screen must pass visual, functional, responsive, accessibility and security evidence;
14. one real AEF Development Unit must consume the accepted design evidence;
15. provider outage must fall back to an approved design path without changing runtime behavior.

Kill switches: `DIAL_STITCH_ENABLED=false` and `DIAL_STITCH_LIVE_TESTS_ENABLED=false`.

No customer/product runtime may call Stitch to render a required screen or execute a transaction.
## 7. Pomelli — GMPC external creative provider

Pomelli belongs to GMPC production creative operations. The provider may help create marketing content; **GMPC owns the resulting asset lifecycle**.

The provider/admin adapter may only:

- build a sanitized Business DNA projection;
- record non-secret human-session attestation;
- accept a manually exported asset into quarantine;
- hash and record provider provenance;
- report provider/admission maturity.

The provider adapter may **not** approve, publish, price, bind promotions, schedule spend or revoke GMPC assets.

The `@dial/gmpc-creative-providers` package owns production-domain controls:

- `CreativeAssetManifest` creation and immutable content hash;
- product-fidelity review;
- brand-conformance review;
- claims review;
- rights review;
- commercial-binding review;
- immutable product/promotion snapshot binding;
- publication eligibility;
- approval;
- expiry and revocation semantics.

A provider-generated commercial claim is not publishable until it binds a canonical GMPC product/promotion snapshot. Revocation always overrides previous approval without erasing provenance.
### 7.1 Business DNA egress boundary

Allowed Pomelli context is intentionally narrower than GMPC's internal state:

- sanitized DIAL/business-unit brand identity;
- brand promise, tone and visual principles;
- non-customer audience archetypes;
- public product/category facts;
- approved campaign brief;
- approved promotion/product snapshot;
- prohibited-claim guidance.

Forbidden context includes customer PII, Health data, payment/card data, authentication/provider secrets, raw customer segmentation rows, private supplier terms unless separately authorized, and unapproved prices/offers.

`buildSanitizedBusinessDna` fails closed when customer/secret-shaped fields or values are detected. Sanitization is not permission laundering: a source that is not authorized for external egress remains forbidden even if individual fields look harmless.

### 7.2 Pomelli authentication model

DIAL does not own the Pomelli browser session. An authorized human signs into the supported Pomelli web application and operates it interactively. DIAL may persist an owner/session **attestation**, but never the cookie, browser profile, refresh token or UI-scraped credential.

The current provider state is therefore expected to pass through `AUTH_REQUIRED → AUTHENTICATED` by human action, while the staging creative slice provides the provider-use proof. A future official API/SDK path requires separate admission and may not inherit trust from the manual workstation mode.
## 8. Secret, identity and network policy

Credential material is never committed, embedded in evidence, copied into prompts or exposed to client bundles.

| Secret/identity | Storage/handling |
|---|---|
| Antigravity Google session | Antigravity-supported system keyring/session only; DIAL stores status, not credential material |
| `STITCH_API_KEY` | approved server/tooling secret injection only |
| `STITCH_ACCESS_TOKEN` | approved server/tooling secret injection only |
| `GOOGLE_CLOUD_PROJECT` | non-secret identifier, environment-scoped |
| Pomelli browser session/cookie | never stored or automated by DIAL |

External-capability evidence uses hashes, status, timestamps, provider request identifiers when safe, latency/quota metadata and validation results. Evidence is scanned against obvious secret patterns before admission.

Network policy is provider- and task-scoped. Stitch credentials may only be sent to the fixed admitted MCP endpoint. Stitch artifact downloads require HTTPS, an admitted Google artifact host, size bounds and no redirect-following. Antigravity network/tool access remains governed by its plugin plus DIAL pre-tool guard and task envelope.

No provider receives production payment credentials, unrestricted database credentials or a wildcard outbound-network entitlement merely because it is a development/design/creative tool.
## 9. Provider-specific Definitions of Done

### 9.1 Antigravity is integrated only when

- repository-scoped governed plugin/hooks are active;
- official CLI is installed and version-qualified;
- Google authentication is proven;
- live headless canary succeeds;
- task envelope/worktree isolation is mandatory;
- guarded Project Truth writes are denied without authority;
- unauthorized/destructive tool/network actions are denied;
- normalized result and execution receipt exist;
- one real low-risk Unit executes through AEF;
- fallback to another approved worker is tested.

### 9.2 Stitch is integrated only when

- exact SDK/MCP wrapper and fixed-host policy are active;
- authentication is proven;
- live tool discovery matches the allowlist;
- live sandbox screen generation succeeds;
- output download/quarantine/security scanning succeeds;
- DesignArtifactManifest evidence exists;
- one real DIAL screen passes visual, functional, responsive, accessibility and security gates;
- one AEF Unit consumes the accepted design evidence;
- runtime has no Stitch dependency and outage fallback is tested.
### 9.3 Pomelli is integrated only when

- Pomelli remains classified as a GMPC external creative provider, not a development harness;
- a sanitized Business DNA pack is produced from GMPC-authorized fields only;
- customer, Health, payment, secret and other forbidden data are denied before egress;
- an authorized human Pomelli session is attested without storing browser/session credentials in DIAL;
- at least one real Pomelli export is ingested through the GMPC quarantine path;
- each asset has immutable content hash and provider provenance;
- product-fidelity, brand, claims, rights and commercial-binding reviews are enforced;
- a commercial creative binds the canonical product/promotion snapshot before publication;
- approval, publication eligibility, expiry and revocation are GMPC-owned and auditable;
- an approved staging creative reaches a DIAL staging content surface;
- cookie automation, UI scraping and unsupported API emulation remain absent;
- provider failure has zero impact on transaction, pricing or campaign-authority state.

Pomelli's human-operated web session is the provider-use proof. `LIVE_QUALIFIED` for Pomelli therefore means a real governed export/ingest cycle, not an automated API canary.

## 10. Programme-wide acceptance gate

The Google external-capability programme may be called **PRODUCTION_GREEN** only when every item below is evidenced:

- canonical document and Project Truth adoption complete;
- owner authorization recorded;
- external-capability maturity registry and false-green checker green;
- secret isolation, egress restrictions and kill switches green;
- Antigravity implementation, authentication, live canary, guarded-write denial, receipt, AEF Unit execution and fallback green;
- Stitch implementation, authentication, fixed-host/tool-allowlist health, live sandbox slice, quarantine, manifest, real-screen acceptance, AEF consumption and fallback green;
- Pomelli Business DNA, forbidden-data denial, human-session attestation, real export ingest, GMPC reviews, commercial binding, staging publication, expiry/revocation and audit green;
- provider outage produces zero customer transaction or money-authority impact;
- evidence records contain no credential material.

Anything less is an honest lower maturity state. `ARCHITECTURE_GREEN`, `IMPLEMENTED`, `AUTHENTICATED` or `LIVE_QUALIFIED` must never be reported as `INTEGRATED` or `PRODUCTION_GREEN`.

## 11. Canonical implementation map

| Concern | Canonical implementation |
|---|---|
| Capability admission/maturity | `agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json` |
| Programme false-green check | `agent-system/orchestration/google-capability-program-check.mjs` |
| Operational qualification CLI | `agent-system/orchestration/google-capability-cli.mjs` |
| Shared evidence/secret rules | `agent-system/orchestration/providers/google/external-capability-core.mjs` |
| Antigravity worker adapter | `agent-system/orchestration/providers/google/antigravity-adapter.mjs` |
| Antigravity HCX execution boundary | `agent-system/orchestration/hcx-worker-executor.mjs` |
| Antigravity Oracle installer | `deploy/oracle/hermes-codex/install-google-antigravity.sh` |
| Antigravity policy hooks | `.agents/plugins/dial-governed/**`, `antigravity-hook.mjs` |
| Stitch live transport | `agent-system/orchestration/providers/google/stitch-adapter.mjs` |
| Existing design route | `agent-system/orchestration/stitch-adapter.mjs`, `design-provider-router.mjs` |
| Pomelli provider/admin boundary | `agent-system/orchestration/providers/google/pomelli-workstation.mjs` |
| GMPC provider policy | `agent-system/registries/GMPC_EXTERNAL_CREATIVE_PROVIDER_POLICY.json` |
| GMPC production-domain rules | `packages/gmpc-creative-providers/**` |
| Regression evidence | `tests/orchestration-google-capabilities.test.mjs`, `tests/gmpc-pomelli-integration.test.ts` |

The shared capability registry reports provider state. It does not own design authority, worker-management authority or GMPC creative authority.

## 12. Rollout and recovery order

1. Commit architecture, provider wrappers, GMPC boundary and machine maturity checks with all live switches disabled.
2. Merge only after normal DIAL verification is green.
3. Install/rebind on `dial-hermes-control` without exposing provider secrets to repositories or client runtimes; install Antigravity only through the exact-pinned `install-google-antigravity.sh` path.
4. Authenticate Antigravity through its supported Google flow; persist status/evidence only.
5. Configure Stitch through approved secret injection; run authenticated tool discovery, then the synthetic sandbox slice.
6. Run one real low-risk Stitch design slice and one real low-risk Antigravity Unit through normal DIAL evidence gates.
7. For Pomelli, an authorized human signs in, produces one non-price staging creative from sanitized Business DNA, and exports it manually.
8. GMPC ingests/quarantines the real Pomelli export, completes all required reviews and binds any commercial claim to a canonical snapshot.
9. Publish the approved creative only to staging, then exercise expiry/revocation and audit.
10. Run `google-capability-program-check --require-live`; only its success permits the programme-level `PRODUCTION_GREEN` claim.

Rollback is switch-first. Disable the affected provider, preserve evidence, revoke provider credentials outside Git, and continue through approved fallback paths. Provider rollback must never require reverting customer transactional truth.

## 13. Adoption-time maturity state

At canonical adoption, provider maturity is intentionally truthful:

- **Antigravity:** implementation present; authentication/live/orchestrated proofs required before promotion beyond `AUTH_REQUIRED`/`LIVE_QUALIFIED`.
- **Stitch:** official SDK wrapper and security boundary present; authentication/live-screen/real-DIAL-screen/orchestrated proofs required before promotion.
- **Pomelli:** GMPC production integration code and policy present; human session, real export, review/binding/staging/revocation proofs required before promotion.

These open live proofs are not implementation omissions and must not be bypassed. They are real external-world acceptance gates requiring provider/account interaction.

## 14. Final invariant

External providers are replaceable. DIAL Project Truth, VEKL knowledge, AEF execution authority, Design Authority, GMPC commercial truth, security controls and evidence are durable.

A provider may increase throughput or quality. It may not create a second source of truth, silently gain authority, or become "fully integrated" because DIAL can safely fall back when it is absent.
