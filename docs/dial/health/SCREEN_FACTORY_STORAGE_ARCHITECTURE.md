# Dial Health Screen Factory Storage Architecture

**Status:** Canonical implementation policy  
**Policy:** `R2_PRIMARY_DRIVE_ARCHIVE_LOCAL_BOUNDED_CACHE_V1`

## Purpose

The Oracle VM is a compute/control node, not the long-term artifact warehouse. Generated screen evidence must survive phone/app disconnection without allowing Screen Factory output to consume the VM disk indefinitely.

The storage plane is deliberately independent from generation. A cloud upload failure does not convert a valid generated screen into a failed design. Storage has its own state and retry lifecycle.

## Storage roles

1. **Oracle local cache** — active rendering, QA and platform-pack staging only.
2. **Cloudflare R2** — primary durable machine artifact store for screen bundles and complete platform ZIPs.
3. **Google Drive** — secondary human-facing archive for complete platform ZIPs only.

Batch ZIPs remain prohibited. Packaging is one ZIP per completed business-unit/platform.
## Oracle protection limits

The default local Screen Factory cache target is **2 GiB**. Generation also preserves an **8 GiB free-disk reserve** on the VM.

Before claiming a new REQUIRED screen, the worker evaluates local artifact size and filesystem free space. If either guardrail is crossed, the worker enters `STORAGE_BLOCKED` while preserving `requested_state=RUNNING`. No generation retry is consumed and no later screen is skipped.

The storage worker continues retrying independently. Once storage pressure clears, the Screen Factory automatically continues in canonical order.

## Remote layout

R2 receives implementation bundles under `dial-health-screen-factory/v2/live/outputs/` and platform ZIPs under `dial-health-screen-factory/v2/platform-packs/`.

Google Drive receives complete platform ZIPs under `Dial Health Screen Factory/Platform Packs/`.

The storage worker uses low-concurrency transfers (`2` transfers / `4` checkers) to reduce CPU, memory and network pressure on the free-tier Oracle node.
## Platform-pack lifecycle

1. Screens render and pass deterministic basic QA locally.
2. The storage service copies screen bundles to R2 without blocking the design worker.
3. When the entire platform is complete, the factory builds the platform ZIP from the authoritative local bundles.
4. The storage service copies the ZIP to R2 and, when configured, Google Drive.
5. After R2 reports a successful copy, duplicate platform staging directories are deleted.
6. After the optional Drive archive also succeeds (or Drive is not configured), the local ZIP may be deleted. The dashboard can materialize the completed ZIP back from R2 on demand.

The per-screen PNG preview remains locally available for the live dashboard; durable implementation artifacts remain in R2 and the platform ZIP.

## Authentication boundary

Cloud credentials are never committed to the Dial repository or embedded in the dashboard/APK. `rclone` stores provider configuration only in `/var/lib/dial-control/secrets/rclone.conf` with the control directory protected from normal repository access.

Required remote names are `dial-r2` and `dial-drive`. Until a remote is authenticated the storage dashboard shows `WAITING_AUTH`; the local guardrails still protect Oracle and the factory will eventually enter `STORAGE_BLOCKED` rather than fill the disk.
## Operations

`dial-health-screen-factory-storage status` shows provider state and configured remote names.

`dial-health-screen-factory-storage config` opens the one-time `rclone` provider configuration. Create the R2 remote with the exact name `dial-r2` and the Google Drive remote with the exact name `dial-drive`.

`dial-health-screen-factory-storage sync` performs an immediate storage pass; the persistent service otherwise retries every 120 seconds.

The live dashboard exposes local cache use, free disk, R2 state, Google Drive state, last successful sync and storage errors. Storage status is informational unless the Oracle guardrails are crossed; only then does it become a generation gate.
