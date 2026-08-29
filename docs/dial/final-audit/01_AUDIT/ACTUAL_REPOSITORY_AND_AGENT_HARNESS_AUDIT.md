# Actual Repository & Agent-Harness Audit — `Vanguduza/dial`

Audited commit: `8945b57200612b119712ceccadb03a3784e85322`.

## Present
- pnpm/Turborepo/Node 20+ foundation;
- gateway auth-first scaffolding;
- design tokens and promotions package;
- Supabase migration foundation;
- typecheck/test scripts and Lefthook;
- Semgrep/Checkov/Renovate/Strix planning;
- Threat Dragon models;
- `AGENTS.md`;
- `.cursor/rules/*.mdc`;
- `.cursor/skills/dial-*`.

## Missing at audit time
- root `CLAUDE.md`;
- `.claude/settings.json`;
- `.mcp.json`.

## Drift risk
Older active agent/planning material still references the superseded D-51 dual-capacity/owned-stock concept. This is the exact class of context poisoning the final drift checker must detect.

## Maturity model
Never infer implementation from plans. Registry status is:
`SPECIFIED → MAPPED → CODE_PRESENT → DOMAIN_TESTED → INTEGRATION_GREEN → STAGING_GREEN → PRODUCTION_GREEN → CERTIFIED_DORMANT/ACTIVE`.
