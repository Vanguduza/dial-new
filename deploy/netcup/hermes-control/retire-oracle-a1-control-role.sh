#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

TARGET_HOST="${A1_TRANSITION_HOST:-old-dial-hermes-control}"
FINAL_HOST="${A1_FINAL_HOSTNAME:-van-trading-core}"
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
PERM_KEY=/home/ubuntu/.ssh/dial-oracle-admin
BOOT_KEY=/home/ubuntu/.ssh/dial-bootstrap-oracle
SSH_CONFIG=/home/ubuntu/.ssh/config

die(){ echo "A1_RETIREMENT_REFUSED: $*" >&2; exit 2; }

[[ "$(hostname)" == dial-control ]] || die "run on Dial Control"
for marker in migration-cutover-complete netcup-control-active source-retirement-preflight-complete; do
  [[ -f "$CONTROL_HOME/state/$marker" ]] || die "required Netcup marker missing: $marker"
done

KEY="$PERM_KEY"
[[ -s "$KEY" ]] || KEY="$BOOT_KEY"
[[ -s "$KEY" ]] || die "no authorized A1 transition SSH identity is available"

SSH=(runuser -u ubuntu -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "ubuntu@$TARGET_HOST")

"${SSH[@]}" 'set -e
  test -f /var/lib/dial-control/state/migration-source-quiesced-at
  test -d "$HOME/.hermes"
  test -d "$HOME/dial-new"
  test -s /etc/wireguard/wg-dial.conf
' >/dev/null || die "A1 source is not in the required quiesced migration state"

SOURCE_MANIFEST_SHA="$("${SSH[@]}" 'sudo find /var/lib/dial-control "$HOME/.hermes" "$HOME/dial-new" -xdev -type f -printf "%p\n" 2>/dev/null | LC_ALL=C sort | sha256sum | awk "{print \$1}"')"
[[ "$SOURCE_MANIFEST_SHA" =~ ^[0-9a-f]{64}$ ]] || die "could not fingerprint retiring source tree"

LATEST_CUTOVER="$(find "$CONTROL_HOME/migration" -type f -name cutover-verified-at -printf '%T@ %h\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "$LATEST_CUTOVER" && -f "$LATEST_CUTOVER/netcup-core-verification.json" ]] || die "verified Netcup cutover evidence missing"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$CONTROL_HOME/migration/a1-retirement-$STAMP"
install -d -m 0700 -o ubuntu -g ubuntu "$EVIDENCE"
cat >"$EVIDENCE/pre-retirement.json" <<EOF
{
  "schema_version": 1,
  "transition_source": "$TARGET_HOST",
  "final_identity": "$FINAL_HOST",
  "source_file_list_sha256": "$SOURCE_MANIFEST_SHA",
  "netcup_cutover_evidence": "$LATEST_CUTOVER",
  "preserve": ["wireguard", "ssh", "provider-user-credentials"],
  "delete": ["old-dial-control-state", "hermes-home", "dial-new-repository", "dial-control-user-units"],
  "recorded_at_utc": "$(date -u +%FT%TZ)"
}
EOF
chmod 0600 "$EVIDENCE/pre-retirement.json"

REMOTE_SCRIPT="$(cat <<'REMOTE'
set -Eeuo pipefail
FINAL_HOST="$1"

[[ -f /var/lib/dial-control/state/migration-source-quiesced-at ]] || {
  echo "A1 retirement refused: migration source is not quiesced" >&2
  exit 21
}
[[ -d "$HOME/.hermes" && -d "$HOME/dial-new" ]] || {
  echo "A1 retirement refused: old Hermes/DIAL source tree is already incomplete" >&2
  exit 22
}
[[ -s /etc/wireguard/wg-dial.conf ]] || {
  echo "A1 retirement refused: WireGuard recovery path missing" >&2
  exit 23
}

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
CONTROL_UNITS=(
  dial-owner-steering.service
  dial-mission-controller.service
  dial-chat-control.service
  dial-hermes-orchestrator.service
  dial-hermes-runtime.service
  dial-hermes-operations.service
  dial-hermes-whatsapp-operator.service
  dial-private-mcp-bind.service
  dial-remote-mcp-relay.service
  dial-external-orchestrator.service
  dial-operator-gateway.service
  dial-resource-scheduler.service
  dial-development-manager.service
  dial-development-manager.timer
)
for unit in "${CONTROL_UNITS[@]}"; do
  systemctl --user disable --now "$unit" >/dev/null 2>&1 || true
  rm -f "$HOME/.config/systemd/user/$unit"
done
systemctl --user daemon-reload >/dev/null 2>&1 || true

# Delete only the old DIAL/Hermes control installation. Provider credentials,
# SSH, WireGuard and all VAN/VATI-owned paths are intentionally preserved.
sudo rm -rf /var/lib/dial-control
rm -rf "$HOME/.hermes" "$HOME/dial-new"

sudo install -d -m 0755 /etc/dial
cat <<ROLE | sudo tee /etc/dial/host-role >/dev/null
ROLE=VAN_TRADING_CORE
HOSTNAME=van-trading-core
NODE_ID=van-trading-core
PHYSICAL_HOSTNAME=van-trading-core
ROLE
sudo chmod 0644 /etc/dial/host-role
sudo hostnamectl set-hostname "$FINAL_HOST"

sudo install -d -m 0755 -o ubuntu -g ubuntu /var/lib/van/estate-transition
cat <<RECEIPT | sudo tee /var/lib/van/estate-transition/dial-hermes-control-retired >/dev/null
retired_at_utc=$(date -u +%FT%TZ)
former_role=DIAL_HERMES_CONTROL
final_role=VAN_TRADING_CORE
old_control_state_deleted=true
hermes_home_deleted=true
dial_repo_deleted=true
wireguard_preserved=true
ssh_preserved=true
provider_user_credentials_preserved=true
RECEIPT
sudo chown ubuntu:ubuntu /var/lib/van/estate-transition/dial-hermes-control-retired
sudo chmod 0644 /var/lib/van/estate-transition/dial-hermes-control-retired

[[ "$(hostname)" == "$FINAL_HOST" ]]
[[ ! -e /var/lib/dial-control ]]
[[ ! -e "$HOME/.hermes" ]]
[[ ! -e "$HOME/dial-new" ]]
grep -q '^ROLE=VAN_TRADING_CORE$' /etc/dial/host-role
test -s /etc/wireguard/wg-dial.conf
sudo systemctl is-active --quiet wg-quick@wg-dial
test -d "$HOME/.ssh"

echo "A1_CONTROL_ROLE_RETIRED=TRUE"
echo "A1_FINAL_IDENTITY=$FINAL_HOST"
REMOTE
)"

REMOTE_B64="$(printf '%s' "$REMOTE_SCRIPT" | base64 -w0)"
OUTPUT="$("${SSH[@]}" "printf '%s' '$REMOTE_B64' | base64 -d | bash -s -- '$FINAL_HOST'")"
printf '%s\n' "$OUTPUT"
grep -q '^A1_CONTROL_ROLE_RETIRED=TRUE$' <<<"$OUTPUT" || die "A1 retirement receipt missing"

# Remove the temporary migration alias only after the remote host has completed
# its transition. van-trading-core remains the same physical WireGuard peer.
tmp="$(mktemp /tmp/dial-hosts.XXXXXX)"
grep -vE '(^|[[:space:]])(old-dial-hermes-control|van-trading-core)([[:space:]]|$)' /etc/hosts >"$tmp"
echo '10.77.0.4 van-trading-core' >>"$tmp"
install -m 0644 "$tmp" /etc/hosts
rm -f "$tmp"

if [[ -f "$SSH_CONFIG" ]]; then
  sed -i 's/^Host van-trading-core old-dial-hermes-control$/Host van-trading-core/' "$SSH_CONFIG"
fi

FINAL_CHECK=(runuser -u ubuntu -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ubuntu@van-trading-core)
"${FINAL_CHECK[@]}" 'set -e
  test "$(hostname)" = van-trading-core
  test ! -e /var/lib/dial-control
  test ! -e "$HOME/.hermes"
  test ! -e "$HOME/dial-new"
  grep -q "^ROLE=VAN_TRADING_CORE$" /etc/dial/host-role
  test -s /etc/wireguard/wg-dial.conf
  test -f /var/lib/van/estate-transition/dial-hermes-control-retired
' >/dev/null || die "final A1 identity verification failed"

cat >"$EVIDENCE/post-retirement.json" <<EOF
{
  "schema_version": 1,
  "state": "A1_CONTROL_ROLE_RETIRED",
  "final_identity": "van-trading-core",
  "overlay_address": "10.77.0.4",
  "source_file_list_sha256": "$SOURCE_MANIFEST_SHA",
  "old_control_state_deleted": true,
  "wireguard_preserved": true,
  "ssh_preserved": true,
  "verified_at_utc": "$(date -u +%FT%TZ)"
}
EOF
chmod 0600 "$EVIDENCE/post-retirement.json"
printf '%s\n' "$(date -u +%FT%TZ)" >"$CONTROL_HOME/state/a1-control-retired"

echo "A1_TRANSITION=GREEN"
echo "FINAL_A1_ROLE=VAN_TRADING_CORE"
