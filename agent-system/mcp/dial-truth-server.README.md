# DIAL Truth MCP implementation contract

Do not enable `.mcp.json.example` until this server is implemented with a pinned official MCP TypeScript SDK.

Read-only tools:
- `get_feature(feature_id)`
- `get_decision(decision_id)`
- `get_module(module_id)`
- `get_donor(donor_id)`
- `get_evidence(evidence_id)`
- `search_canon(query, limit, cursor?)`

Requirements:
- no write tools;
- bounded output;
- source paths/IDs in every result;
- no secrets;
- registry JSON schema validation;
- tests for unknown IDs and pagination.
