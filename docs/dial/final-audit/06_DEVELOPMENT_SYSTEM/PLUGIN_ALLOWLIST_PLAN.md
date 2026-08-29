# Plugin Allowlist Plan

## First-party
Build `dial-development` after the standalone `.claude` harness passes evals. It may package reusable DIAL skills, read-only agents, hook helpers and DIAL Truth MCP. Critical product truth remains visible in the repo.

## Initial external allowlist
- `github@claude-plugins-official` — optional authenticated GitHub workflow.
- `mcp-server-dev@claude-plugins-official` — development-only while building DIAL Truth MCP.

Every extra plugin needs exact version/source, tool/hook/MCP inventory, network/secrets review, prompt/instruction review, owner and upgrade policy.

Do not wholesale install Everything Claude Code, Superpowers or other all-in-one packs. Adopt patterns selectively.
