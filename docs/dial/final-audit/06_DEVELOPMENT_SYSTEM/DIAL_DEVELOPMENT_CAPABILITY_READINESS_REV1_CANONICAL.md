# DIAL Development Capability Readiness — Rev 1

**Status:** CANONICAL / owner-directed
**Decision:** DEC-033
**Date:** 2026-09-15

## Rule
Every operational tool/resource intentionally enrolled in the DIAL development system is a readiness requirement, not an optional bootstrap convenience. It must be installed or enrolled on its designated execution surface, configured, authenticated where applicable, functionally probed, integrated, and selection-ready before whole-system GREEN.

Runtime fallback is still required. A temporary provider/tool outage may reroute work safely after qualification, but fallback does not excuse an unconfigured capability and a fresh GREEN certificate requires restored live readiness. Emergency kill switches remain valid safety controls.

## Antigravity
Google Antigravity is a required worker-only harness beneath VEKL/AEF. Exact `agy` 1.2.0 installation, Google authentication, live canary, guard-denial evidence, receipt evidence and orchestrated Unit execution are blocking readiness evidence. Harness selection must consider Antigravity whenever its qualification/health and task constraints permit. Model selection is independent: every live-discovered provider-native Antigravity model pairing must be qualified and routed through `HARNESS_MODEL_COMPATIBILITY.json`; unsupported external model embedding is represented as multi-worker composition, never as a fabricated direct pairing.

## Other enrolled capabilities
Operational entries previously marked `OPTIONAL_CAPABILITY` are promoted by function: development tools/providers/connectors to `CORE_DEVELOPMENT_REQUIRED`, owner channels/observability to `OWNER_CONTROL_REQUIRED`, and recovery transports to `RECOVERY_REQUIRED`. This includes xKiro HAIF, Stitch, DIAL Truth MCP, Context7, Exa, structural snapshot/Graphify advisory production, declared owner WhatsApp adapters/dashboard, xKiro credentials, worker SSH diagnostics/recovery and declared StackExchange reachability.

`REFERENCE_ONLY` remains valid only for genuinely non-runtime records such as human-operated web/reference capabilities or deprecated historical entries. Pomelli remains GMPC-owned human-operated creative tooling under DEC-031; the experimental Astra API remains distinct from any Astra model that may become available through an authorised Codex subscription and model discovery.
