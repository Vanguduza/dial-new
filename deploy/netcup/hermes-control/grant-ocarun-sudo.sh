#!/usr/bin/env bash
# Grant the OCI Run Command agent user (ocarun) passwordless sudo on every estate VM.
#
# Owner-requested (2026-09-23): OCI Run Command runs as the unprivileged uid=999(ocarun); the
# zero-touch enrollment step needs root and stops with DIAL_ENROLL_NEEDS_OCARUN_SUDO until this
# grant exists. OCI itself cannot create it, so Dial Control does it over the private WireGuard
# overlay using the ubuntu admin identity, which already holds passwordless sudo on each peer.
#
# Consequence, accepted by the owner: whoever can create Run Commands (the owner and the
# dial-netcup-recovery user) then has root on these VMs.
#
# Safety: the sudoers drop-in is validated with `visudo -cf` in isolation BEFORE it is installed,
# and the whole sudoers tree is re-validated AFTER; a candidate that would break sudo is never
# installed, and an installed file that fails the tree check is rolled back. The step is
# idempotent and touches nothing but /etc/sudoers.d/90-dial-ocarun.
set -Eeuo pipefail
umask 077

PERM_KEY="${DIAL_ORACLE_ADMIN_KEY:-/home/ubuntu/.ssh/dial-oracle-admin}"
BOOT_KEY="${DIAL_ORACLE_BOOTSTRAP_KEY:-/home/ubuntu/.ssh/dial-bootstrap-oracle}"

die(){ echo "OCARUN_SUDO_REFUSED: $*" >&2; exit 2; }

[[ "$(hostname)" == dial-control ]] || die "run on Dial Control"
KEY="$PERM_KEY"
[[ -s "$KEY" ]] || KEY="$BOOT_KEY"
[[ -s "$KEY" ]] || die "no authorized SSH identity for the estate ($PERM_KEY / $BOOT_KEY)"

# The retained Oracle peers, on their overlay addresses. The migration source is included only
# while it is still an overlay peer (before retirement), so its own enrollment can also proceed.
declare -A PEERS=(
  [oracle-admin]=10.77.0.2
  [vekl-worker]=10.77.0.3
  [van-trading-core]=10.77.0.4
)
NAMES=(oracle-admin vekl-worker van-trading-core)
if [[ ! -f /var/lib/dial-control/state/a1-control-retired ]] &&
   grep -qE '^10\.77\.0\.5[[:space:]]+old-dial-hermes-control([[:space:]]|$)' /etc/hosts; then
  PEERS[old-dial-hermes-control]=10.77.0.5
  NAMES+=(old-dial-hermes-control)
fi

# Runs on each peer as ubuntu (which has passwordless sudo). Validates before it commits.
REMOTE_SCRIPT="$(cat <<'REMOTE'
set -Eeuo pipefail
sudo -n true 2>/dev/null || { echo "REMOTE=NO_PASSWORDLESS_SUDO"; exit 40; }
dst=/etc/sudoers.d/90-dial-ocarun
line='ocarun ALL=(ALL) NOPASSWD:ALL'
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
printf '%s\n' "$line" >"$tmp"; chmod 0440 "$tmp"
# Validate the candidate file in isolation before it can affect the live sudoers tree.
sudo -n visudo -cf "$tmp" >/dev/null 2>&1 || { echo "REMOTE=INVALID_SUDOERS"; exit 41; }
if sudo -n test -f "$dst" && sudo -n cmp -s "$tmp" "$dst"; then
  id ocarun >/dev/null 2>&1 && x=yes || x=no
  echo "REMOTE=ALREADY_GRANTED ocarun_exists=$x"
  exit 0
fi
sudo -n install -m 0440 -o root -g root "$tmp" "$dst"
# Re-validate the WHOLE tree; if the drop-in broke it, remove it to restore working sudo.
if ! sudo -n visudo -c >/dev/null 2>&1; then
  sudo -n rm -f "$dst" || true
  echo "REMOTE=TREE_INVALID_ROLLED_BACK"; exit 42
fi
id ocarun >/dev/null 2>&1 && x=yes || x=no
echo "REMOTE=GRANTED ocarun_exists=$x"
REMOTE
)"
REMOTE_B64="$(printf '%s' "$REMOTE_SCRIPT" | base64 -w0)"

incomplete=0
for name in "${NAMES[@]}"; do
  ip="${PEERS[$name]}"
  out=""
  # ssh may fail (unreachable, auth); capture stdout+stderr without tripping errexit.
  set +e
  out="$(runuser -u ubuntu -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 \
           -o StrictHostKeyChecking=accept-new "ubuntu@$ip" \
           "printf '%s' '$REMOTE_B64' | base64 -d | bash -s" 2>&1)"
  set -e
  # A no-match grep must not abort the run, so guard the extraction explicitly.
  status="$(printf '%s\n' "$out" | grep '^REMOTE=' | tail -1 || true)"
  status="${status#REMOTE=}"
  [[ -n "$status" ]] || status="UNREACHABLE"
  echo "ocarun_sudo_${name//-/_}=$status"
  case "$status" in
    GRANTED*|ALREADY_GRANTED*) ;;
    *) incomplete=1
       # Non-secret diagnostics (hostnames, ssh errors) to explain a non-grant.
       printf '%s\n' "$out" | tail -3 | sed "s/^/  ${name}: /" ;;
  esac
done

if [[ "$incomplete" != 0 ]]; then
  echo "OCARUN_SUDO=INCOMPLETE"
  exit 43
fi
echo "OCARUN_SUDO=GREEN"
