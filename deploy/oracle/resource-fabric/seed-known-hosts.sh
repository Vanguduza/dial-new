#!/usr/bin/env bash
# Seed strict known_hosts entries for this host's recovery targets.
#
#   seed-known-hosts.sh                       # seed every target in this host's `recovers`
#   seed-known-hosts.sh --expect <host>=<fp>  # seed one target, verified against a fingerprint
#   seed-known-hosts.sh --verify              # report what is seeded, change nothing
#
# WHY THIS EXISTS
#
# recovery-agent.mjs SSHes with StrictHostKeyChecking=yes, which is correct and which is
# also why the recovery agent has never been started: with no known_hosts entry every
# probe fails closed, producing noise rather than recovery. Seeding is therefore not a
# convenience, it is the last thing between a staged recovery plane and a running one.
#
# TRUST
#
# `ssh-keyscan` alone is trust-on-first-use: it believes whatever answers on port 22.
# During an outage — exactly when this gets run — that is the wrong moment to be
# credulous. So each target's key SHOULD be checked against the fingerprint its own
# certification recorded (`ssh.host_key_fingerprint` in host-certification.json), which
# reaches you over a different channel: OCI Run Command, or the offsite evidence bundle.
#
# Without --expect this seeds on first use and says plainly that it did. With --expect it
# refuses on any mismatch and writes nothing.

set -uo pipefail

FABRIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
KNOWN_HOSTS="${DIAL_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
KEYSCAN_TIMEOUT="${DIAL_KEYSCAN_TIMEOUT:-10}"

die() { echo "seed-known-hosts: $*" >&2; exit 1; }
log() { echo "$*" >&2; }

# Tooling is checked where it is used, below. "This host has no recovery targets" is a
# fact about the fabric, not about what happens to be installed, and reporting it that way
# keeps --verify usable on a machine with no ssh tooling at all.

# Targets, and the address each resolves to, straight from the fabric. Env overrides win,
# the same way recovery-agent.mjs resolves them, so the two cannot disagree.
targets_raw="$(node -e '
  const f = require(process.argv[1]);
  const self = f.hosts.find((h) => h.host_id === process.argv[2]);
  if (!self) process.exit(2);
  for (const t of self.recovers) {
    const key = `DIAL_FABRIC_${t.toUpperCase().replace(/-/g, "_")}_SSH_HOST`;
    const addr = process.env[key] || (f.hosts.find((h) => h.host_id === t) || {}).private_ip;
    if (addr) process.stdout.write(`${t} ${addr}\n`);
  }
' "$FABRIC_DIR/hosts.json" "$HOST_ID" 2>/dev/null)" \
  || die "$HOST_ID is not a fabric host, or hosts.json could not be read"

mapfile -t TARGETS <<<"$targets_raw"
[[ ${#TARGETS[@]} -gt 0 ]] && [[ -n "${TARGETS[0]:-}" ]] \
  || die "$HOST_ID has no recovery targets; nothing to seed"

mkdir -p "$(dirname "$KNOWN_HOSTS")" && chmod 700 "$(dirname "$KNOWN_HOSTS")"
touch "$KNOWN_HOSTS" && chmod 600 "$KNOWN_HOSTS"

# --- --verify ----------------------------------------------------------------------
if [[ "${1:-}" == "--verify" ]]; then
  rc=0
  for row in "${TARGETS[@]}"; do
    read -r target addr <<<"$row"
    if ! command -v ssh-keygen >/dev/null 2>&1; then
      # No tooling: say that, rather than reporting every target as MISSING. A report
      # that cannot tell "absent" from "cannot look" is worse than no report.
      echo "UNKNOWN  $target ($addr) — ssh-keygen not installed, cannot read known_hosts"
      rc=2
    elif fp="$(ssh-keygen -F "$addr" -f "$KNOWN_HOSTS" 2>/dev/null | { grep -v '^#' || true; } | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')" \
       && [[ -n "$fp" ]]; then
      echo "SEEDED   $target ($addr) $fp"
    else
      echo "MISSING  $target ($addr)"; rc=1
    fi
  done
  exit $rc
fi

# Seeding, unlike reporting, genuinely needs both tools.
command -v ssh-keyscan >/dev/null 2>&1 || die "ssh-keyscan is not installed"
command -v ssh-keygen  >/dev/null 2>&1 || die "ssh-keygen is not installed"

# --- expected fingerprints, if given -------------------------------------------------
declare -A EXPECT=()
while [[ "${1:-}" == --expect ]]; do
  shift
  spec="${1:-}"; shift || true
  [[ "$spec" == *=* ]] || die "--expect takes <host>=SHA256:... (got '$spec')"
  key="${spec%%=*}"; val="${spec#*=}"
  [[ "$val" == SHA256:* ]] \
    || die "expected fingerprint for $key must be the SHA256:... form that host-certification.json records"
  EXPECT["$key"]="$val"
done

seeded=0 refused=0 tofu=0
for row in "${TARGETS[@]}"; do
  read -r target addr <<<"$row"

  scan="$(timeout "$KEYSCAN_TIMEOUT" ssh-keyscan -t ed25519 "$addr" 2>/dev/null | { grep -v '^#' || true; })"
  if [[ -z "$scan" ]]; then
    log "UNREACHABLE  $target ($addr) — no ed25519 host key answered within ${KEYSCAN_TIMEOUT}s"
    continue
  fi

  got="$(ssh-keygen -lf - <<<"$scan" 2>/dev/null | awk '{print $2}')"
  [[ -n "$got" ]] || { log "UNPARSEABLE  $target ($addr) — keyscan output is not a host key"; continue; }

  want="${EXPECT[$target]:-${EXPECT[$addr]:-}}"
  if [[ -n "$want" ]]; then
    if [[ "$got" != "$want" ]]; then
      # A mismatch is either the wrong host or an interposed one. Neither is a reason to
      # continue, and neither is fixed by seeding it anyway.
      log "REFUSED      $target ($addr)"
      log "             expected $want"
      log "             got      $got"
      refused=$((refused + 1))
      continue
    fi
  else
    tofu=$((tofu + 1))
  fi

  existing="$(ssh-keygen -F "$addr" -f "$KNOWN_HOSTS" 2>/dev/null | { grep -v '^#' || true; } | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')"
  if [[ -n "$existing" && "$existing" != "$got" ]]; then
    log "REFUSED      $target ($addr) — a DIFFERENT key is already trusted for this address."
    log "             trusted $existing"
    log "             offered $got"
    log "             Remove it deliberately (ssh-keygen -R $addr) once you know why it changed."
    refused=$((refused + 1))
    continue
  fi

  if [[ -n "$existing" ]]; then
    log "ALREADY      $target ($addr) $got"
  else
    printf '%s\n' "$scan" >> "$KNOWN_HOSTS"
    log "SEEDED       $target ($addr) $got${want:+ (verified)}"
    seeded=$((seeded + 1))
  fi
done

chmod 600 "$KNOWN_HOSTS"

if [[ $tofu -gt 0 ]]; then
  log ""
  log "$tofu host key(s) were accepted on first use, UNVERIFIED. Check each against"
  log "ssh.host_key_fingerprint in that host's host-certification.json and re-run with"
  log "  --expect <host>=SHA256:...   to make the check binding."
fi

[[ $refused -eq 0 ]] || exit 3
exit 0
