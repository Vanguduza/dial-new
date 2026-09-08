# DIAL Hermes xKiro Auxiliary Intelligence Fabric (HAIF)

**Decision:** `DEC-023`
**Authority:** DIAL development-control architecture
**Provider role:** non-authoritative auxiliary intelligence only

## Governing law

xKiro/HAIF is not a DIAL manager runtime, development fallback, source of truth,
repository writer, deployment authority, money authority, Health authority, or
premium-runtime substitute. DIAL's executable manager chain remains exactly:

`GPT-5.6 Sol -> Claude Sonnet 5 -> no runtime`

HAIF may preprocess, compare, classify, summarize, critique, cluster and synthesize
admitted evidence. Its output is evidence that existing DIAL gates may accept,
reject, re-check or escalate.

## Project/account isolation

DIAL and DDE use separate xKiro accounts and credentials. Separate accounts are
required so usage, provider wallet/spend policy, revocation and incident scope do
not collapse across projects. DIAL never reads DDE credentials, queues, evidence,
model ledger, provider-usage state or control tokens.

DIAL runtime state is rooted under `/var/lib/dial-control`. DDE remains a separate
project and control plane. A shared public provider catalogue may be reproduced,
but account usage/quota ledgers are project-account-local.

Completed auxiliary evidence can be mirrored to Cloudflare R2 through independently
scoped tenant credentials. Object keys are content-addressed under `haif/<project>/`
and never contain secret material. DIAL and DDE use separate buckets/credentials; a
missing or unavailable R2 mirror degrades archival only and never causes evidence to
be silently discarded from the local durable control root.

## Free-only / spend control

HAIF v1 is `FREE_ONLY` by code. Paid routes, wallet-backed fallback and silent
provider substitution are forbidden. Provider-side spend limits remain a separate
account-console control and must be set independently for each project account.
The client does not infer that a catalogue-labelled `free` route is usable: every
account must prove the route with a real canary.

## Elite-only model policy

The provider's free catalogue is discovery input, not an execution pool. Only the
small elite candidate set in `elite-model-policy.mjs` may enter qualification.
Normal HAIF execution additionally requires numerical benchmark promotion to
`CHAMPION`, `CHALLENGER` or explicitly `APPROVED` for the exact task archetype.

Initial elite candidates are DeepSeek V4 Flash, Qwen 3.5 Omni Plus free, MiniMax
M3 free, Mistral Medium 3.5 and GPT-5.3 Codex Spark where the specific account
actually permits it. Catalogue metadata never overrides account-specific runtime
proof.

## Data and security boundary

All requests are deterministically classified before serialization and receive a
second final egress DLP pass after prompt assembly. `SECRET_HIGH_SENSITIVITY` and
raw `RESTRICTED` data never leave the host. `INTERNAL_SANITIZED` remains disabled
until a time-bounded provider-governance record explicitly approves it. Public
research may not contain credentials, customer/payment records or identifiable
Health information.

Sparse aggregates are suppressed before model access. Sanitized internal aggregates
add deterministic quasi-identifier generalization, exact-timestamp reduction and
row-level identifier/precise-coordinate rejection before provider serialization.
Provider responses are non-authoritative, provenance-carrying evidence packets with
explicit unknowns, contradictions and source references.

## Restart/idempotency law

Tasks persist idempotency key, input hash, attempt identity, lease owner/expiry,
retry count, request-body hash, provider request ID and response-persisted state.
An uncertain provider outcome is parked after the provider deduplication window;
HAIF never blindly replays a request whose external outcome cannot be reconciled.
Content-addressed result reuse is permitted only for tasks marked cacheable.

## Diversity and escalation

S1 uses the best benchmarked champion for the archetype. S2 adds one strong model
from a different independence class. S3 is capped at three elite independent
models and is reserved for high-value analysis. Model agreement is never truth.
Disagreement produces a typed `PREMIUM_ADJUDICATION_CANDIDATE` that can enter only
the existing authorized DIAL router; HAIF has no Sol/Claude manager credentials.

## Numerical promotion gate

The elite benchmark requires at least twelve public fixtures per model/archetype
and enforces schema validity, evidence fidelity, unsupported-claim, correction,
timeout and provider-error ceilings. The strongest eligible route becomes
`CHAMPION`; the next eligible route may become `CHALLENGER`. A model that is merely
listed, free-labelled or transport-canary-green is not production-HAIF approved.

## Runtime surface

The tenant daemon is localhost-only and token-authenticated. It exposes status,
task submission and run-once operations; no generic shell exists. Credentials are
mode `0600` files outside Git. DIAL and DDE use separate control roots, provider
usage roots, control tokens and ports.

## Verification obligations

Repository gates must prove negative authority, DLP, project/account isolation,
FREE_ONLY behavior, uncertain-outcome recovery, cache determinism, elite-only
selection, benchmark promotion gates, diversity semantics and premium-escalation
non-authority. Live qualification must additionally prove the real account's
usage endpoint and at least one elite free inference route without exposing key
material.
