#!/usr/bin/env bash
# Grant the OCI Run Command agent user (ocarun) passwordless sudo on every estate VM.
#
# Owner-requested (2026-09-23): OCI Run Command runs as the unprivileged uid=999(ocarun); the
# zero-touch enrollment step needs root and stops with DIAL_ENROLL_NEEDS_OCARUN_SUDO until this
# grant exists. OCI cannot create the grant itself (Run Command has no sudo), so Dial Control
# does it over SSH using the ubuntu admin identity.
#
# Channel: this grant is a PRE-enrollment bootstrap. The private WireGuard overlay (10.77.0.x)
# does not exist until enrollment runs, so peers are reached at their PUBLIC IPs (resolved via
# OCI) here, not over the overlay. Once a peer is enrolled its overlay hostname also works, so
# re-runs from either state are fine.
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
OCI_CONFIG="${OCI_CONFIG:-/home/ubuntu/.oci/config}"
ESTATE="${DIAL_ORACLE_ESTATE:-/etc/dial/oracle-estate.env}"
SSH_USER="${DIAL_ESTATE_SSH_USER:-ubuntu}"

die(){ echo "OCARUN_SUDO_REFUSED: $*" >&2; exit 2; }

[[ "$(hostname)" == dial-control ]] || die "run on Dial Control"
KEY="$PERM_KEY"
[[ -s "$KEY" ]] || KEY="$BOOT_KEY"
[[ -s "$KEY" ]] || die "no authorized SSH identity for the estate ($PERM_KEY / $BOOT_KEY)"
[[ -s "$OCI_CONFIG" ]] || die "OCI config missing at $OCI_CONFIG; run finish/prepare first"
[[ -s "$ESTATE" ]] || die "Oracle estate inventory missing at $ESTATE"

# shellcheck disable=SC1090
source "$ESTATE"

OCI=(runuser -u "$SSH_USER" -- env HOME="/home/$SSH_USER" OCI_CLI_CONFIG_FILE="$OCI_CONFIG"
  PATH=/home/"$SSH_USER"/.local/bin:/usr/local/bin:/usr/bin:/bin oci)

# The retained Oracle peers plus, while it is still present, the migration source. Each is
# resolved to its live public IP so the grant works before the overlay exists.
declare -A OCIDS=(
  [oracle-admin]="${ORACLE_ADMIN_OCID:-}"
  [vekl-worker]="${VEKL_WORKER_OCID:-}"
  [van-trading-core]="${VAN_TRADING_CORE_OCID:-}"
)
NAMES=(oracle-admin vekl-worker van-trading-core)
if [[ ! -f /var/lib/dial-control/state/a1-control-retired && -n "${DIAL_HERMES_CONTROL_SOURCE_OCID:-}" ]]; then
  OCIDS[old-dial-hermes-control]="$DIAL_HERMES_CONTROL_SOURCE_OCID"
  NAMES+=(old-dial-hermes-control)
fi

declare -A PEERS=()
for name in "${NAMES[@]}"; do
  id="${OCIDS[$name]}"
  [[ "$id" == ocid1.instance.* ]] || { echo "ocarun_sudo_${name//-/_}=SKIPPED_NO_OCID"; continue; }
  ip="$("${OCI[@]}" compute instance list-vnics --instance-id "$id" \
         --query 'data[0]."public-ip"' --raw-output 2>/dev/null | tr -d '\r' | tail -1)"
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PEERS[$name]="$ip"
  else
    echo "ocarun_sudo_${name//-/_}=NO_PUBLIC_IP"
  fi
done

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
  ip="${PEERS[$name]:-}"
  # Hosts with no OCID or no public IP were already reported above; they are not granted.
  [[ -n "$ip" ]] || { incomplete=1; continue; }
  out=""
  # ssh may fail (unreachable, auth); capture stdout+stderr without tripping errexit.
  set +e
  out="$(runuser -u "$SSH_USER" -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=8 \
           -o StrictHostKeyChecking=accept-new "$SSH_USER@$ip" \
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
