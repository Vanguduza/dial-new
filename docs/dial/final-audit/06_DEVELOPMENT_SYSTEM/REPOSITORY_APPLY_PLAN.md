# Repository Apply Plan

Apply this final pack through a reviewed branch, not by copying random files ad hoc.

## 1. Canonical documentation
Copy this pack into:
`docs/dial/final-audit/`

Keep the human/audit plan there; do not load it all at Claude startup.

## 2. Harness
Copy the contents of:
`06_DEVELOPMENT_SYSTEM/ready_to_copy/`
to repository root, **except** `.mcp.json.example`, which remains an example until DIAL Truth MCP is implemented and tested.

## 3. Existing Cursor integration
Do not delete existing Cursor skills/rules first. Create the neutral `agent-system/canon` source, then migrate each Cursor rule/skill to a thin adapter/generated copy and add drift checks. Remove old duplicate content only after parity checks.

## 4. Supersession cleanup
Before broad coding:
- mark D-51 owned-stock/dual-capacity material superseded;
- replace stale FixItNow quarantine wording with `Sachinrajawat/FixItNow` → `PORT-WHOLESALE / MIT`;
- add Dial Health as a required standalone division and Command Centre room;
- mark old Command Centre CC-0→CC-5 target sequencing superseded;
- correct old evidence inheritance wording.

## 5. Package scripts
Add repository scripts equivalent to:
```json
{
  "context:feature": "node agent-system/bin/context-get.mjs",
  "agent:drift-check": "node agent-system/bin/drift-check.mjs",
  "agent:feature-coverage": "node agent-system/bin/feature-coverage.mjs",
  "agent:realization-coverage": "node agent-system/bin/realization-coverage.mjs",
  "agent:security-coverage": "node agent-system/bin/security-coverage.mjs"
}
```

## 6. MCP
Implement/pin the official MCP SDK in a dedicated internal tool package, test it, then rename/copy `.mcp.json.example` to `.mcp.json`.

## 7. Harness smoke
Run:
- Claude `/doctor`
- `/memory`
- `/skills`
- `/agents`
- `/hooks`
- `/mcp`
- `pnpm agent:drift-check`
- `pnpm agent:realization-coverage`
- `pnpm agent:security-coverage`
- fixed harness evals

Only then treat Claude Code as a production development harness.
