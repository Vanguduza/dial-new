# DIAL VEKL Research Harvest Operations Runbook

## Preconditions

Confirm the host role is `vekl-worker`, the private MCP URL file is present, the OpenRouter credential exists only on `dial-hermes-control`, and the exact catalog identity `stealth/union-alpha` is both available and zero-priced. Never place the key on the worker or command line. Never run this workload on `oracle-admin`.

The known 2026-09-18 state is `FREE_WINDOW_CLOSED`. Keep `DIAL_UNION_ALPHA_FREE_WINDOW_CLOSED=1` (or controller provider state equivalent), do not start inference, do not select Pareto, and do not configure a fallback.

## Commands

Use `npm run agent:vekl:research -- <operation>`. Read-only/offline operations are `status`, `coverage`, `verify`, and `certify`. Lifecycle operations are `create`, `start`, `pause`, `resume`, and `retry [batch-id]`. `admit`, `graph-compile`, and `capsule-build` must remain refused until all source, schema, citation, lineage, contradiction and coverage gates pass.

Install only on a worker with `DIAL_HOST_ROLE=vekl-worker bash deploy/oracle/execution-fabric/install-vekl-research-harvest.sh`. The installer is idempotent, does not start the timer, and contains no secret. Provision `/etc/dial/research-harvest.env` with root-only permissions before enabling execution.

## Incident handling

- `FREE_WINDOW_CLOSED`: pause; preserve state; no retry until an exact free qualification is independently observed.
- `AUTH_REQUIRED`: repair the control-host secret reference; never copy credentials to the worker.
- `CAPACITY_LIMITED`, `PROVIDER_OUTAGE`, `TIMEOUT`: retain checkpoint and retry with bounded exponential backoff/jitter.
- `INVALID_OUTPUT` or fabricated citation: quarantine and block admission.
- stale repository, Project Truth, graph or DU binding: create a newly bound mission; never relabel old evidence.
- private MCP unavailable: preserve queue/checkpoint and report worker connectivity blocked.

## Certification

Certification requires 309 current units, every applicable dimension verified/admitted or explicitly not applicable, shared-artifact deduplication, contradiction retention, admitted-only GraphRAG, deterministic retrieval, fresh capsules and all repository tests green. The phrase indicating final success is forbidden while the provider window or worker connectivity is blocked.
