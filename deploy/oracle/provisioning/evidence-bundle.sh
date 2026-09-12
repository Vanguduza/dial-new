#!/usr/bin/env bash
# Build an offsite-safe evidence bundle for one host.
#
#   dial-evidence-bundle            # build, print the path
#   dial-evidence-bundle --verify   # build into a temp dir, scan, discard
#
# WHAT THIS IS FOR
#
# Boot volumes are not backed up here — that is 40-backup-policy.sh's job, and an OCI
# volume backup is the right tool for disaster recovery. This bundle carries the small
# set of things a volume backup restores too slowly or not at all: the audit history
# that is genuinely not re-derivable if a host is lost.
#
# WHY IT IS AN ALLOWLIST
#
# These hosts hold live credentials — the Desktop Commander device credential, SSH
# private material, Codex and Claude OAuth sessions, and at least one API key under
# ~/.dde-control/secrets/. Copying "the host" anywhere off-box exfiltrates all of it.
# So nothing is included unless it is named below, and the result is scanned before it
# is allowed to exist. A deny-list would be the wrong shape: it fails open on anything
# nobody thought of.

set -uo pipefail

HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
# Overridable so the allowlist and the credential scanner can be exercised against a
# staged tree in tests. A scanner that has only ever been run on a clean host is an
# assertion, not a control.
STATE="${DIAL_RECOVERY_STATE:-/var/lib/dial-recovery}"
CERT_DIR="${DIAL_RECOVERY_LOG_DIR:-/var/log/dial-recovery}"
ETC_DIR="${DIAL_RECOVERY_ETC:-/etc/dial-recovery}"
OUT_DIR="${DIAL_EVIDENCE_OUT:-$STATE/export}"
VERIFY_ONLY=false
[[ "${1:-}" == "--verify" ]] && { VERIFY_ONLY=true; OUT_DIR="$(mktemp -d)"; }

# Everything that may leave the host. Audit history first; it is the only category
# that cannot be rebuilt from the repository or by re-running bootstrap.
ALLOW=(
  "$STATE/bootstrap-state.json"
  "$STATE/fabric/recovery-evidence"
  "$STATE/fabric/decisions"
  "$STATE/fabric/recovery-state"
  "$STATE/fabric/telemetry"
  "$CERT_DIR/host-certification.json"
  "$ETC_DIR/fabric.env"
)

# Belt and braces. Nothing below may appear in a bundle even by accident — a symlink,
# a future allowlist edit, or a file written into an allowed directory by mistake.
DENY_PATHS_RE='(\.ssh/|\.desktop-commander-device/|\.codex|\.claude|\.dde-control|/secrets?/|authorized_keys|known_hosts)'
DENY_CONTENT_RE='(BEGIN [A-Z ]*PRIVATE KEY|ssh-rsa AAAA|"?(access|refresh|id)_token"?\s*[:=]|Bearer [A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_-]{30,}|ya29\.[A-Za-z0-9_-]{20,})'

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
root="$stage/$HOST_ID"
mkdir -p "$root"

included=0
for p in "${ALLOW[@]}"; do
  [[ -e "$p" ]] || continue
  if [[ "$p" =~ $DENY_PATHS_RE ]]; then
    echo "REFUSED: allowlist entry matches a deny pattern: $p" >&2
    exit 2
  fi
  # --no-dereference: a symlink into a secret directory must not be followed out.
  mkdir -p "$root$(dirname "$p")"
  cp -a --no-dereference "$p" "$root$(dirname "$p")/" 2>/dev/null && included=$((included + 1))
done

if [[ $included -eq 0 ]]; then
  echo "Nothing to bundle: none of the allowlisted paths exist on $HOST_ID." >&2
  exit 1
fi

# Drop anything that slipped in by path, then scan every remaining byte by content.
while IFS= read -r f; do
  echo "REMOVED (deny path): ${f#$root}" >&2
  rm -f "$f"
done < <(find "$root" -type f | grep -E "$DENY_PATHS_RE" || true)

offenders="$(grep -rlEI "$DENY_CONTENT_RE" "$root" 2>/dev/null || true)"
if [[ -n "$offenders" ]]; then
  echo "REFUSED: credential-shaped content found. Nothing was written." >&2
  while IFS= read -r f; do echo "  ${f#$root}" >&2; done <<<"$offenders"
  exit 3
fi

# Symlinks pointing outside the bundle would resolve on the far side. Refuse.
dangling="$(find "$root" -type l 2>/dev/null || true)"
if [[ -n "$dangling" ]]; then
  echo "REFUSED: bundle contains symlinks; they may resolve outside it." >&2
  exit 3
fi

if [[ "$VERIFY_ONLY" == true ]]; then
  echo "VERIFY OK — $included path(s) staged, no credential-shaped content."
  rm -rf "$OUT_DIR"
  exit 0
fi

install -d -m 700 "$OUT_DIR"
bundle="$OUT_DIR/${HOST_ID}-${stamp}.tar.gz"
tar -czf "$bundle" -C "$stage" "$HOST_ID"
chmod 600 "$bundle"

# Keep the last 14 locally; the offsite copy is the long-term one.
find "$OUT_DIR" -name "${HOST_ID}-*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | tail -n +15 | cut -d' ' -f2- | while IFS= read -r old; do rm -f "$old"; done

echo "$bundle"
