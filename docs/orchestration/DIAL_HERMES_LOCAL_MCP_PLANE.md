# DIAL Hermes Local MCP Development Plane

Status: owner-directed two-plane architecture.

## Topology

```text
Claude Code ----+
                +--> local dial-oracle-control MCP --> DIAL owner/control authority
Codex ----------+                                  |
                                                   v
                                             Hermes runtime
                                                   |
                                                   +--> dial_local_commander
                                                        local stdio MCP

Remote Desktop Commander --> oracle-admin --> OCI/recovery/diagnostics only
```

## Authority rules

1. `dial-hermes-control` is the development/runtime host.
2. Claude Code and Codex connect locally to the same `operator-control-stdio.mjs` DIAL MCP and retain independent `claude` / `codex` provenance.
3. Neither Claude Code nor Codex receives a direct Desktop Commander MCP registration.
4. Hermes owns the local Desktop Commander child MCP under `mcp_servers.dial_local_commander`.
5. The local Commander is a subordinate capability, never a second project authority.
6. The DIAL operator MCP remains typed and exposes no generic shell/filesystem proxy.
7. `oracle-admin` remains `RECOVERY_CONTROL_ONLY`; its remote Desktop Commander connection is independent of Hermes and is reserved for administration/recovery.
8. Normal development does not traverse `oracle-admin`.

## Local Commander boundary

Hermes MCP support natively spawns stdio MCP servers from `~/.hermes/config.yaml`. The installer pins Desktop Commander to `@wonderwhy-er/desktop-commander@0.2.50` and exposes only a read/inspection subset to Hermes:

- `read_file`
- `read_multiple_files`
- `list_directory`
- `get_file_info`
- `start_search`
- `get_more_search_results`
- `list_processes`
- `list_sessions`
- `get_config`

Mutating or generic execution tools such as `start_process`, `interact_with_process`, file writes/edits, process kills, configuration mutation and shutdown are deliberately not exposed through this subordinate MCP. Development mutations continue through the governed DIAL/Hermes execution paths.

## Installation

Run on `dial-hermes-control` only:

```bash
bash deploy/oracle/hermes-codex/install-hermes-local-mcp-plane.sh --dry-run   # inspect first
bash deploy/oracle/hermes-codex/install-hermes-local-mcp-plane.sh
bash deploy/oracle/hermes-codex/qualify-hermes-local-mcp-plane.sh
```

The installer runs every prerequisite check before it touches anything, including
the prerequisites of the operator-gateway installer it invokes last. A late
failure would otherwise leave the host half-applied -- local Commander registered
but the typed client MCPs absent -- which the qualifier reports as an opaque RED.

Because the Hermes agent reads a live, hand-maintained `~/.hermes/config.yaml`,
the installer edits that file by splicing in only the `mcp_servers.dial_local_commander`
block. Every other byte is preserved, so operator comments, YAML anchors and merge
keys survive. A full `safe_load`/`safe_dump` round-trip would silently discard all
three.

Safety properties of the config edit:

- the file is re-parsed and compared against the original before any write; if the
  splice changed anything other than the intended block, nothing is written;
- an unparseable config is refused rather than rewritten;
- a timestamped `config.yaml.dial-bak-<UTC>` backup (mode `0600`) is taken whenever
  a write occurs, and the rollback command is printed;
- re-running is idempotent: an already-correct config is left byte-identical and
  no backup is created;
- `--dry-run` reports what would change and writes nothing.

Both client CLIs must resolve on `PATH` for the owning user. The gateway installer
registers `dial-oracle-control` for `codex` and `claude` only when each binary is
present, and the qualifier fails closed unless both are enrolled, so a missing CLI
is treated as an installation error. `--allow-missing-clients` downgrades that to a
warning for a deliberate partial install.

The qualifier fails closed unless the Commander tool filter, Codex enrollment,
Claude Code enrollment and localhost DIAL MCP health all match this topology.

## Recovery independence

The remote Desktop Commander session on `oracle-admin` is intentionally separate. Losing Hermes, its MCP configuration, Codex, Claude Code or the local Commander must not remove the recovery foothold. Conversely, loss of `oracle-admin` must not stop ordinary Hermes-local development.
