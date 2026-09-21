# Netcup Hermes Control Plane

This directory is the provider-specific entrypoint for the physical host that backs the
logical DIAL role `dial-hermes-control`. The authority name does not change when the
provider changes.

## Target

- Provider: Netcup
- Product: RS 1000 G12
- Architecture: x86_64
- Canonical role: `CONTROL_AUTHORITY`
- Canonical logical host: `dial-hermes-control`
- Persistent control state: `/var/lib/dial-control`
- Canonical repository: `~/dial-new`

`vekl-worker` and `oracle-admin` remain Oracle E2.1 Micro nodes with
`BACKGROUND_COORDINATOR` and `RECOVERY_CONTROL_ONLY` respectively.

## Migration gates

The old Oracle control instance is not deleted because files copied successfully. Retirement
is allowed only after all of the following are evidenced on the Netcup host:

1. RS1000 host inventory matches `deploy/oracle/resource-fabric/hosts.json`.
2. `CONTROL_AUTHORITY` role resolves locally.
3. Hermes state/config/auth material and `/var/lib/dial-control` were transferred over an authenticated channel.
4. The canonical repository is reconciled; old uncommitted/worktree material is preserved in the migration snapshot.
5. Codex, Claude, Hermes and required subordinate capabilities are installed from pinned sources.
6. Required owner auth gates are completed on the new host.
7. Hermes runtime, mission control, operator/owner gateway, MCPs and development bootstrap probes pass.
8. Netcup↔`vekl-worker` private MCP and Netcup↔`oracle-admin` recovery reachability pass.
9. A fresh signed `dial-hermes-control` role report is produced.
10. Recovery from `oracle-admin` to the new control endpoint is proven.
11. No production/owner action still targets the retired Oracle control address.

Only then may the old Oracle instance be terminated. Preserve an out-of-instance backup until
post-cutover soak is accepted; deletion of a VM must never be the rollback mechanism.

## Bootstrap order

1. Install Ubuntu 24.04 x86_64 and connect an owner-approved private cross-cloud interface.
2. Set `DIAL_CONTROL_OVERLAY_IP` to the Netcup address on that private interface.
3. Clone `Vanguduza/dial-new` to the service user's `~/dial-new`.
4. Run `bash deploy/netcup/hermes-control/bootstrap-rs1000.sh`.
5. Complete `./ops/development-bootstrap/bootstrap.sh --auth --role dial-hermes-control` owner gates.
6. Run the migration script with `--prepare`.
7. Verify the initial copy, then run it with `--cutover`.
8. Re-run whole-system certification and recovery tests.
9. Retire the old Oracle control instance only after the retirement gate is green.

## ChatGPT/OpenAI surface

The server bootstrap installs the repository-pinned OpenAI Codex runtime and configures the
Hermes OpenAI/Codex provider path. ChatGPT-account authentication remains an explicit owner
login gate; credentials are never copied into Git or shell arguments. A desktop/browser UI is
not an authority component and must not be substituted for the typed Hermes control plane.
