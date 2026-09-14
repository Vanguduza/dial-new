#!/usr/bin/env bash
# Push the evidence bundle to the owner's offsite storage (Google Drive by default).
#
#   dial-offsite-push            # build a bundle and upload it
#   dial-offsite-push --dry-run  # build and scan, upload nothing
#
# TRANSPORT
#
# rclone, configured at /etc/dial-recovery/rclone.conf (0600, root-owned, outside the
# git checkout). The remote is named by DIAL_OFFSITE_REMOTE, default "dialdrive".
#
# SCOPE — this matters more than the transport
#
# Configure the Drive remote with `scope = drive.file`, not the default full scope.
# drive.file restricts the token to files this application itself created: it cannot
# read, list or delete anything else in the owner's Drive. A backup job has no business
# holding a token that can read the owner's whole Drive, and a token on a recovery host
# is a token that can be stolen from a recovery host.
#
# WHAT IS AND IS NOT SENT
#
# Only what evidence-bundle.sh allowlists, and only after it has scanned the result for
# credential-shaped content and refused on any match. Boot volumes are NOT sent here —
# OCI volume backups (40-backup-policy.sh) are the disaster-recovery mechanism. This is
# the offsite copy of audit history that a volume backup cannot restore quickly.

set -uo pipefail

REMOTE="${DIAL_OFFSITE_REMOTE:-dialdrive}"
REMOTE_PATH="${DIAL_OFFSITE_PATH:-DIAL/oracle-evidence}"
RCLONE_CONF="${DIAL_RCLONE_CONF:-/etc/dial-recovery/rclone.conf}"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }

command -v dial-evidence-bundle >/dev/null 2>&1 \
  || { log "dial-evidence-bundle not installed; re-run bootstrap."; exit 1; }

if [[ "$DRY_RUN" == true ]]; then
  dial-evidence-bundle --verify || exit $?
  log "Dry run: bundle verified, nothing uploaded."
  exit 0
fi

command -v rclone >/dev/null 2>&1 || { log "rclone is not installed on $HOST_ID."; exit 1; }

if [[ ! -r "$RCLONE_CONF" ]]; then
  log "No rclone config at $RCLONE_CONF."
  log "This is the one step that needs the owner: authorize Drive once, then place the"
  log "resulting config here with mode 600. See docs/orchestration/DIAL_ORACLE_RECOVERY_METHODS.md."
  exit 1
fi

perm="$(stat -c '%a' "$RCLONE_CONF" 2>/dev/null || echo 000)"
if [[ "$perm" != "600" && "$perm" != "400" ]]; then
  # The config holds an OAuth refresh token. World- or group-readable is not acceptable
  # on a host that other processes and, during recovery, other operators touch.
  log "REFUSED: $RCLONE_CONF is mode $perm; expected 600. Fix it before uploading."
  exit 2
fi

# Warn loudly if the token was granted more than it needs. Not fatal — the owner may
# have a considered reason — but it must never pass silently.
if grep -q '^scope *= *drive *$' "$RCLONE_CONF" 2>/dev/null; then
  log "WARNING: the Drive remote uses full 'drive' scope. 'drive.file' limits this token"
  log "         to files this job created and is strongly preferred on a recovery host."
fi

bundle="$(dial-evidence-bundle)" || { log "bundle refused; nothing uploaded."; exit $?; }
[[ -s "$bundle" ]] || { log "bundle is empty; nothing uploaded."; exit 1; }

log "Uploading $(basename "$bundle") ($(stat -c %s "$bundle") bytes) to ${REMOTE}:${REMOTE_PATH}/${HOST_ID}/"
if rclone --config "$RCLONE_CONF" copy "$bundle" "${REMOTE}:${REMOTE_PATH}/${HOST_ID}/" \
     --no-traverse --retries 3 --low-level-retries 5 --timeout 120s 2>&1 | sed 's/^/  /' >&2; then
  log "Uploaded."
else
  log "Upload FAILED. The local bundle is kept at $bundle"
  exit 4
fi

# Prove it landed rather than trusting the exit code — the whole point of this session's
# certification work is that "the command succeeded" is not the same as "the thing exists".
if rclone --config "$RCLONE_CONF" lsf "${REMOTE}:${REMOTE_PATH}/${HOST_ID}/" 2>/dev/null \
     | grep -qF "$(basename "$bundle")"; then
  log "Verified present offsite: $(basename "$bundle")"
else
  log "REFUSED TO CLAIM SUCCESS: upload reported OK but the file is not listed remotely."
  exit 5
fi
