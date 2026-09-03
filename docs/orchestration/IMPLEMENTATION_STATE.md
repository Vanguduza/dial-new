# DIAL Hermes + Codex Control-Plane Implementation State

Status: **REPO_QUALIFIED**

Last updated: 2026-09-03

This record tracks deployment qualification only. It is not DIAL product canon and must not advance product Feature gates.

## State ladder

- `DESIGNED` — complete
- `REPO_QUALIFIED` — **current**
- `HOST_DEPLOYED` — pending
- `RUNTIME_QUALIFIED` — pending
- `FAILOVER_QUALIFIED` — pending
- `REBOOT_QUALIFIED` — pending
- `QUOTA_SOAK_PENDING` — expected until a genuine provider-capacity event is observed and recovered without manufacturing quota exhaustion
- `PRODUCTION_GREEN` — not reached

## Repository qualification evidence

- Qualification branch: `chore/hermes-codex-control-plane`
- PR: `#1` — remains draft
- Repository verification on head `ac062ca7a12778385a253590640f2060cff67084`: GREEN in GitHub Actions run `33770622879` / run number 46
- Explicit `agent:orchestration:qualify` CI gate: GREEN on that head
- Product/pipeline verification on that head: GREEN
- `master` at qualification time: `11933e9fbb00eb2f4686ad420a71007263de6a37`
- Qualification branch was not behind `master` at the repository qualification boundary

## Repository defects repaired during qualification

1. New manager leases now require fresh, identity-proven `HEALTHY` runtime evidence rather than accepting indefinitely persisted health.
2. Supervisor restart invalidates previous runtime evidence and active lease, then performs fresh Codex and Claude probes before normal election.
3. Lease issuance validates manager eligibility independently rather than trusting caller-selected candidates.
4. Claude fallback execution requires an active healthy identity-proven Sonnet lease.
5. Feature memory and handoff capsules reject additional secret classes, including access/refresh/OAuth tokens, private-key material and cookies.
6. The full repository CI now explicitly runs the orchestration qualification suite.
7. The installed-runtime qualification now runs full repository verification, requires ARM64, rejects ambient OpenAI/Codex/Anthropic API-key billing paths, and requires fresh health provenance on primary/failover/recovery leases.
8. Source-of-truth ordering was aligned to the locked eight-layer control-plane authority order.

## Pending host/runtime evidence

No host/runtime item below may be marked complete from simulation or documentation alone:

- Oracle Always Free/free-allocation confirmation and host deployment
- Oracle host OS/architecture/resource evidence
- ChatGPT subscription OAuth for Codex
- Hermes `openai-codex` OAuth and supported Codex App Server migration
- Claude subscription authentication
- installed-runtime qualification
- live Codex engineering packet
- actual Codex process-death test
- actual Sonnet takeover with model provenance and tools
- bounded HOT/WARM/COLD memory takeover verification
- Hermes process-death/restart test
- DIAL supervisor process-death/restart test
- full Oracle reboot recovery
- safe return from Sonnet to Sol at an atomic boundary
- final secret/security audit
- independent Codex and Claude cross-provider review against the final PR diff and evidence
- final CI after evidence/status commits

## Real provider capacity gate

`REAL_QUOTA_SOAK = PENDING`

A simulated `ACCOUNT_LIMITED`, `MODEL_LIMITED`, or `RATE_LIMITED` route proves only the deterministic state machine. It must not be promoted to genuine provider-capacity evidence. Excessive quota must not be deliberately consumed merely to force this event. Until a genuine event is observed and passes recovery qualification, PR #1 remains draft and unmerged if this gate remains mandatory.
