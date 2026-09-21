#!/usr/bin/env bash
set -euo pipefail

# Deterministic bootstrap for the Netcup RS 1000 G12 that assumes the canonical
# dial-new repository is already checked out. It installs no credentials and never
# makes this host authoritative merely because packages are present.
REPO="${DIAL_REPO_DIR:-$HOME/dial-new}"
EXPECTED_HOST="dial-hermes-control"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"

die(){ echo "NETCUP_BOOTSTRAP_REFUSED: $*" >&2; exit 2; }

[[ "$(uname -s)" == "Linux" ]] || die "Linux required"
case "$(uname -m)" in x86_64|amd64) ;; *) die "RS 1000 G12 control host must be x86_64" ;; esac
[[ -r /etc/os-release ]] || die "/etc/os-release missing"
. /etc/os-release
[[ "${ID:-}" == ubuntu && "${VERSION_ID:-}" == 24.04 ]] || die "Ubuntu 24.04 required; got ${PRETTY_NAME:-unknown}"
[[ -f "$REPO/ops/development-bootstrap/bootstrap.mjs" ]] || die "canonical repo missing at $REPO"
command -v sudo >/dev/null || die "sudo required"

cpu="$(nproc)"
mem_mb="$(awk '/MemTotal/{printf "%d",$2/1024}' /proc/meminfo)"
root_kb="$(df -Pk / | awk 'NR==2{print $2}')"
(( cpu >= 4 )) || die "expected >=4 logical CPUs; observed $cpu"
(( mem_mb >= 7000 )) || die "expected ~8 GB RAM; observed ${mem_mb} MB"
(( root_kb >= 200000000 )) || die "expected >=200 GB root filesystem for RS1000; observed $((root_kb/1024/1024)) GB"

if [[ "$(hostname)" != "$EXPECTED_HOST" ]]; then
  sudo hostnamectl set-hostname "$EXPECTED_HOST"
fi

# The private MCP must bind only to an authenticated cross-cloud interface.
CONTROL_OVERLAY="${DIAL_CONTROL_OVERLAY_IP:-}"
[[ -n "$CONTROL_OVERLAY" ]] || die "set DIAL_CONTROL_OVERLAY_IP to this host's owner-approved private-overlay IP before control-runtime installation"
export DIAL_CONTROL_OVERLAY_IP="$CONTROL_OVERLAY"
export DIAL_PRIVATE_MCP_BIND="${DIAL_PRIVATE_MCP_BIND:-$CONTROL_OVERLAY}"
export DIAL_PRIVATE_MCP_HEALTH="${DIAL_PRIVATE_MCP_HEALTH:-http://$CONTROL_OVERLAY:9133/health}"

cd "$REPO"
bash deploy/oracle/execution-fabric/install-host-role.sh CONTROL_AUTHORITY
bash deploy/oracle/hermes-codex/bootstrap-host.sh

sudo install -d -m 0700 -o "$USER" -g "$USER" "$CONTROL_HOME/config"
{
  printf 'DIAL_CONTROL_OVERLAY_IP=%s\n' "$CONTROL_OVERLAY"
  printf 'DIAL_PRIVATE_MCP_HEALTH=%s\n' "$DIAL_PRIVATE_MCP_HEALTH"
} | sudo tee "$CONTROL_HOME/config/development-network.env" >/dev/null
sudo chown "$USER:$USER" "$CONTROL_HOME/config/development-network.env"
sudo chmod 0600 "$CONTROL_HOME/config/development-network.env"

echo "NETCUP_MACHINE_BOOTSTRAP=COMPLETE"
echo "NEXT_OWNER_GATE: ./ops/development-bootstrap/bootstrap.sh --auth --role dial-hermes-control"
echo "DO_NOT_TERMINATE_OLD_CONTROL=TRUE"
