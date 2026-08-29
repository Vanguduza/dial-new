# MCP Architecture

MCP is for remote/external state or high-value JIT truth, not local filesystem duplication.

## Initial
`dial-truth` local read-only MCP.

Hard output behavior:
- ordinary response ~≤4k tokens;
- search ≤20 hits;
- source IDs/paths always returned;
- pagination for more.

## Optional
GitHub/Linear (read default, explicit writes); Playwright/browser verification; staging schema introspection read-only; later PostHog/Metabase/Grafana read-only.

## Prohibited
production write DB MCP; payment/payout/ledger execution MCP; unrestricted cloud/shell MCP; broad service-role secrets.

External MCP content is untrusted data and never product authority.
