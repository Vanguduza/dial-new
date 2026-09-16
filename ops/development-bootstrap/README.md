# DIAL development bootstrap and certification

Deterministic, detect-first convergence and certification for the DIAL development hosts.
It answers one question with evidence: can this host, in its declared role, carry the DIAL
development workloads it is meant to carry, and can the owner give the green flag.

Authority: this directory grants nothing. Canonical installers under
`deploy/oracle/hermes-codex/` remain the mechanism for the Hermes control plane; the bootstrap
detects, verifies and wraps them. Project Truth, VEKL, the locked runtime chain and the
external development gate are unchanged by anything here.

## Interface

```text
./ops/development-bootstrap/bootstrap.sh --dry-run          [--role <role>]   plan convergence, change nothing
./ops/development-bootstrap/bootstrap.sh --verify           [--role <role>]   certify; prints readiness matrix + verdict
./ops/development-bootstrap/bootstrap.sh --verify --fast                       skip the long repository gates
./ops/development-bootstrap/bootstrap.sh --apply            [--role <role>]   converge (backups first)
./ops/development-bootstrap/bootstrap.sh --repair           [--role <role>]   verify, then apply only what failed
./ops/development-bootstrap/bootstrap.sh --rollback <run-id>                  restore every file a run changed
./ops/development-bootstrap/bootstrap.sh --self-test | --determinism | --fault-injection
flags: --json  --out <file>  --control-home <dir>  --repo <dir>
exit codes: 0 GREEN/ok, 1 RED/failure, 2 AMBER, 3 role guard refused, 4 role unknown
```

Roles: `dial-hermes-control`, `vekl-worker`, `oracle-admin`, `provider-container`.
The role is resolved from `DIAL_HOST_ROLE`, then `/etc/dial/host-role` (bare name or `ROLE=` line),
then provider-container detection, then hostname alias; otherwise `UNKNOWN`, and every governed
workload is refused. `roles/role-guard.mjs --workload <W>` is the same decision as a CLI for
schedulers and direct host commands.

## Layout

| Path | Purpose |
|---|---|
| `manifest.json` | declarative desired state: packages, runtimes, services, MCP servers, providers, plugins, credentials (references only), network dependencies, health checks, certification gates |
| `roles/roles.json`, `roles/role-guard.mjs` | host-role definitions and the fail-closed workload guard |
| `providers/` | Claude, Codex, Hermes, xKiro, Google: binary, version, ambient-key rejection, benign authentication probe |
| `mcp/` | one MCP inventory drives `.mcp.json` generation and a real stdio capability probe |
| `auth/gates.mjs` | owner-interactive authentication gates (`AUTH-GATE-*`) derived from probe results |
| `systemd/`, `containers/`, `network/` | supervision, container and reachability checks |
| `verify/` | repository, Project Truth, VEKL, GraphRAG, fingerprint, Oracle mirror, secrets, supply-chain checks and the certification aggregator that writes the machine-readable report |
| `repair/`, `rollback/` | idempotent convergence actions with backup-before-alter and byte-for-byte rollback |
| `selftest/` | read-only end-to-end chain, determinism (N identical runs), fault injection (9 scenarios) |
| `workers/` | `vekl-worker` job contract: allowlisted jobs, sealed receipts, local and forced-command SSH transports, installer |
| `DEVELOPMENT_CAPABILITY_REGISTRY.json` | every development capability with authority, host, auth type, probe, fallback and evidence-backed status |

## Evidence rules

A check is `PASS` only when a command ran and returned the expected result. A file existing is
not evidence. Authentication is `PASS` only after a benign live probe (`codex login status`,
`claude auth status`, `git ls-remote`). What cannot be probed from the current host is
`UNVERIFIED` or `EXTERNAL_GATE`, never inferred. Secrets are never read; only presence and mode.
Every run writes a JSONL event log under `<control-home>/bootstrap/logs/` after redaction.

Verdict law: `GREEN` requires every MANDATORY and REQUIRED check to pass with no open P0 and
no owner/external gate on a mandatory component; otherwise `AMBER`, or `RED` when a mandatory
check fails or cannot be certified.

## Where it runs

- `provider-container` (Claude Code Remote / Codex cloud): repository gates, self-tests,
  worker contract, MCP probe, GitHub reach. Systemd, Hermes and Codex checks are not applicable.
- `dial-hermes-control`: everything, including the external development gate, control-plane
  fingerprint equality, systemd units, provider authentication and loopback-only listeners.
- `vekl-worker`: toolchain, role separation, worker agent timer, job execution.
- `oracle-admin`: toolchain and the proof that development workloads are refused.

### External owner-gate handoff

Machine-side prerequisites must be complete before asking the owner for credentials. The canonical secret/config entrypoints are `configure-stitch-provider.sh`, `configure-hermes-whatsapp-control.sh`, and `configure-cloudflare-mcp-ingress.sh`. Exa uses the credential-free official MCP endpoint through DIAL's fixed stdio bridge and therefore has no owner authentication step. The secondary recovery overlay is authenticated with `sudo tailscale up` on each of the three hosts and verified locally with `verify-secondary-recovery-overlay.sh <peer>...`. After each owner action, rerun `bootstrap.sh --auth --resume <token> --role <role>` and then `bootstrap.sh --verify`; no credential value belongs in argv, Git, logs, or Project Truth evidence.
