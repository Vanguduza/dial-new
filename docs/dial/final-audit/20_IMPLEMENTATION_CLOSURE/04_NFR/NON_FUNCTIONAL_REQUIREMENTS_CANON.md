# DIAL Non-Functional Requirements Canon

v2 makes performance, resilience and recoverability testable rather than adjectives.

The machine registry contains engineering targets for the core system classes. These are **product SLO targets**, not guarantees from third-party providers.

## Rules

1. Every deployable maps to an NFR class before STAGING_GREEN.
2. Third-party outages are measured separately from DIAL orchestration, but customer degraded behavior is still DIAL's responsibility.
3. `RPO=0` means DIAL must not knowingly lose a committed authoritative event. It does not mean every cache/telemetry sample is synchronous.
4. A stale projection must say stale; it must never silently display zero/current-looking data.
5. High-risk services fail closed rather than bypass authorization/accounting.
6. Load test at least 10x the credible initial peak for small/cheap deterministic services where practical, then reset targets from measured production.
7. Core Web Vitals are tested on realistic mid-tier/mobile network profiles, not only developer desktops.
8. Every SLO has an alert/runbook before ACTIVE.

## Performance budget ownership

- Product defines UX threshold.
- Domain team owns command/query latency.
- Platform owns gateway/DB/queue overhead.
- External-provider latency is separately tagged.
- Command Centre shows SLO breach and dependency attribution.

## Capacity model

Before activation, each branch supplies:
- expected orders/jobs/day;
- peak hourly multiplier;
- active users;
- catalogue/search size;
- media upload volume;
- delivery/telemetry concurrency;
- WhatsApp messages/Flow submits;
- payment transactions;
- support cases.

The load model becomes a versioned activation artifact.
