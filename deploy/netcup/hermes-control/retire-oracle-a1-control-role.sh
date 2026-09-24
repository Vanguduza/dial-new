#!/usr/bin/env bash
# Retire the old Oracle Hermes control source after a verified Netcup cutover.
#
# Owner topology (2026-09-23): dial-hermes-control is a SEPARATE Oracle A1, the migration source.
# Hermes and its files are cloned from it to Netcup, then it is terminated. The retained Oracle
# peers are van-trading-core (A1, 10.77.0.4), vekl-worker and oracle-admin; none is touched here.
#
# This step makes the source permanently inert (control units stopped and disabled, so two
# control planes can never run) and removes it from the private overlay. It deletes nothing on
# the source and does not rename it: its data stays as a fallback until the owner terminates the
# instance, which final certification requires.
set -Eeuo pipefail
umask 077

TARGET_HOST="${HERMES_SOURCE_HOST:-old-dial-hermes-control}"
SOURCE_IP=10.77.0.5
CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
RECEIPT="${DIAL_PEER_RECEIPT:-/var/lib/dial-control/github-oidc/oracle-peer-keys.json}"
WG_CONF=/etc/wireguard/wg-dial.conf
PERM_KEY=/home/ubuntu/.ssh/dial-oracle-admin
BOOT_KEY=/home/ubuntu/.ssh/dial-bootstrap-oracle
SSH_CONFIG=/home/ubuntu/.ssh/config

die(){ echo "SOURCE_RETIREMENT_REFUSED: $*" >&2; exit 2; }

[[ "$(hostname)" == dial-control ]] || die "run on Dial Control"
for marker in migration-cutover-complete netcup-control-active source-retirement-preflight-complete; do
  [[ -f "$CONTROL_HOME/state/$marker" ]] || die "required Netcup marker missing: $marker"
done
grep -qE "^${SOURCE_IP//./\\.}[[:space:]]+$TARGET_HOST([[:space:]]|$)" /etc/hosts ||
  die "$TARGET_HOST does not resolve to the migration source address $SOURCE_IP; refusing to act on any other peer"

SOURCE_OCID="$(sed -n 's/^DIAL_HERMES_CONTROL_SOURCE_OCID=//p' /etc/dial/oracle-estate.env 2>/dev/null | head -1)"
SOURCE_WG_PUB="$(jq -r '.peers.hermes_source // ""' "$RECEIPT" 2>/dev/null || true)"
[[ "$SOURCE_WG_PUB" =~ ^[A-Za-z0-9+/]{43}=$ ]] || die "migration source WireGuard key missing from $RECEIPT"

KEY="$PERM_KEY"
[[ -s "$KEY" ]] || KEY="$BOOT_KEY"
[[ -s "$KEY" ]] || die "no authorized SSH identity for the migration source"

SSH=(runuser -u ubuntu -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "ubuntu@$TARGET_HOST")

# The retained VAN host must never be the target, whatever the aliases say.
[[ "$("${SSH[@]}" hostname)" != van-trading-core ]] || die "$TARGET_HOST answers as van-trading-core"

"${SSH[@]}" 'set -e
  test -f /var/lib/dial-control/state/migration-source-quiesced-at
  test -d "$HOME/.hermes"
  test -d "$HOME/dial-new"
' >/dev/null || die "migration source is not in the required quiesced state"

SOURCE_MANIFEST_SHA="$("${SSH[@]}" 'sudo find /var/lib/dial-control "$HOME/.hermes" "$HOME/dial-new" -xdev -type f -printf "%p\n" 2>/dev/null | LC_ALL=C sort | sha256sum | awk "{print \$1}"')"
[[ "$SOURCE_MANIFEST_SHA" =~ ^[0-9a-f]{64}$ ]] || die "could not fingerprint the migration source tree"

LATEST_CUTOVER="$(find "$CONTROL_HOME/migration" -type f -name cutover-verified-at -printf '%T@ %h\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "$LATEST_CUTOVER" && -f "$LATEST_CUTOVER/netcup-core-verification.json" ]] || die "verified Netcup cutover evidence missing"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$CONTROL_HOME/migration/source-retirement-$STAMP"
install -d -m 0700 -o ubuntu -g ubuntu "$EVIDENCE"
cat >"$EVIDENCE/pre-retirement.json" <<EOF
{
  "schema_version": 2,
  "migration_source": "$TARGET_HOST",
  "source_instance_ocid": "$SOURCE_OCID",
  "source_file_list_sha256": "$SOURCE_MANIFEST_SHA",
  "netcup_cutover_evidence": "$LATEST_CUTOVER",
  "action": "stop-and-disable-control-units; remove-from-overlay; owner-terminates-instance",
  "recorded_at_utc": "$(date -u +%FT%TZ)"
}
EOF
chmod 0600 "$EVIDENCE/pre-retirement.json"

REMOTE_SCRIPT="$(cat <<'REMOTE'
set -Eeuo pipefail
[[ -f /var/lib/dial-control/state/migration-source-quiesced-at ]] || { echo "refused: source not quiesced" >&2; exit 21; }
[[ "$(hostname)" != van-trading-core ]] || { echo "refused: this is van-trading-core" >&2; exit 22; }

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
  systemctl --user mask "$unit" >/dev/null 2>&1 || true
done
systemctl --user daemon-reload >/dev/null 2>&1 || true

# Data is deliberately kept: it is the fallback until the owner terminates this instance.
printf 'retired_at_utc=%s\nrole=RETIRED_MIGRATION_SOURCE\nnext=OWNER_TERMINATES_INSTANCE\n' "$(date -u +%FT%TZ)" |
  sudo tee /var/lib/dial-control/state/retired-migration-source >/dev/null

for unit in "${CONTROL_UNITS[@]}"; do
  ! systemctl --user is-active --quiet "$unit"
done
echo "SOURCE_CONTROL_ROLE_RETIRED=TRUE"
REMOTE
)"

REMOTE_B64="$(printf '%s' "$REMOTE_SCRIPT" | base64 -w0)"
OUTPUT="$("${SSH[@]}" "printf '%s' '$REMOTE_B64' | base64 -d | bash -s")"
printf '%s\n' "$OUTPUT"
grep -q '^SOURCE_CONTROL_ROLE_RETIRED=TRUE$' <<<"$OUTPUT" || die "source retirement receipt missing"

# Drop the source from the overlay: live peer, persisted hub config, hosts and SSH alias.
wg set wg-dial peer "$SOURCE_WG_PUB" remove 2>/dev/null || true
if [[ -f "$WG_CONF" ]]; then
  awk -v key="$SOURCE_WG_PUB" '
    BEGIN { RS=""; ORS="\n\n" }
    index($0, "PublicKey = " key) == 0 { print }
  ' "$WG_CONF" >"$WG_CONF.next"
  install -m 0600 "$WG_CONF.next" "$WG_CONF"
  rm -f "$WG_CONF.next"
fi
tmp="$(mktemp /tmp/dial-hosts.XXXXXX)"
grep -vE '(^|[[:space:]])old-dial-hermes-control([[:space:]]|$)' /etc/hosts >"$tmp"
install -m 0644 "$tmp" /etc/hosts
rm -f "$tmp"
if [[ -f "$SSH_CONFIG" ]]; then
  awk '/^Host /{skip=($2=="old-dial-hermes-control")} !skip' "$SSH_CONFIG" >"$SSH_CONFIG.next"
  install -m 0600 -o ubuntu -g ubuntu "$SSH_CONFIG.next" "$SSH_CONFIG"
  rm -f "$SSH_CONFIG.next"
fi

# The retained VAN peer must be untouched and still answer as itself.
if [[ ! -f "$CONTROL_HOME/state/van-trading-core-pending-rebuild" ]]; then
  FINAL_CHECK=(runuser -u ubuntu -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ubuntu@van-trading-core)
  [[ "$("${FINAL_CHECK[@]}" hostname)" == van-trading-core ]] || die "van-trading-core did not answer as itself after source retirement"
fi

cat >"$EVIDENCE/post-retirement.json" <<EOF
{
  "schema_version": 2,
  "state": "SOURCE_RETIRED_PENDING_OWNER_TERMINATION",
  "source_instance_ocid": "$SOURCE_OCID",
  "source_file_list_sha256": "$SOURCE_MANIFEST_SHA",
  "source_removed_from_overlay": true,
  "van_trading_core_unchanged": true,
  "verified_at_utc": "$(date -u +%FT%TZ)"
}
EOF
chmod 0600 "$EVIDENCE/post-retirement.json"
printf '%s\n' "$(date -u +%FT%TZ)" >"$CONTROL_HOME/state/a1-control-retired"

echo "HERMES_SOURCE_RETIRED=GREEN"
echo "NEXT_OWNER_ACTION=terminate OCI instance dial-hermes-control ${SOURCE_OCID:-<see estate inventory>}"
