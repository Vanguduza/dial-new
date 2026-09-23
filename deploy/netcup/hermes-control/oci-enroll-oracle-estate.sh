#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

OCI_CONFIG="${OCI_CONFIG:-/home/ubuntu/.oci/config}"
ESTATE="${DIAL_ORACLE_ESTATE:-/etc/dial/oracle-estate.env}"
PEER_SCRIPT="${DIAL_ZERO_TOUCH_PEER_SCRIPT:-/usr/local/lib/dial-control/runtime/deploy/oracle/resource-fabric/zero-touch-enroll-peer.sh}"
CONTROL_ROOT="${DIAL_GITHUB_OIDC_ROOT:-/var/lib/dial-control/github-oidc}"
OUT="$CONTROL_ROOT/oracle-peer-keys.json"
NETCUP_PUBLIC_IP="${NETCUP_PUBLIC_IP:-62.83.35.103}"
WG_PUB_FILE="${NETCUP_WG_PUBLIC_KEY_FILE:-/etc/wireguard/dial-netcup.pub}"
SSH_PUB_FILE="${NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY_FILE:-/home/ubuntu/.ssh/dial-bootstrap-oracle.pub}"
# Owner plan (auth-20260923-owner-estate-rebuild-hermes-becomes-van): the current van-trading-core is
# being dropped and dial-hermes-control is re-roled into it after the Hermes clone. While this marker
# exists van-trading-core is not enrolled; final certification still requires it.
VAN_PENDING_MARKER="${DIAL_VAN_PENDING_MARKER:-/var/lib/dial-control/state/van-trading-core-pending-rebuild}"
VAN_PENDING=0; [[ -f "$VAN_PENDING_MARKER" ]] && VAN_PENDING=1

die(){ echo "OCI_ESTATE_ENROLL_REFUSED: $*" >&2; exit 2; }
[[ "$(hostname)" == dial-control ]] || die "wrong host"
[[ -s "$OCI_CONFIG" ]] || die "OCI config missing"
[[ -s "$ESTATE" ]] || die "Oracle estate inventory missing"
[[ -s "$PEER_SCRIPT" ]] || die "zero-touch peer script missing"
[[ -s "$WG_PUB_FILE" ]] || die "Dial Control WireGuard public key missing"
[[ -s "$SSH_PUB_FILE" ]] || die "bootstrap SSH public key missing"

# shellcheck disable=SC1090
source "$ESTATE"
: "${DIAL_OCI_COMPARTMENT:?DIAL_OCI_COMPARTMENT missing}"
: "${ORACLE_ADMIN_OCID:?ORACLE_ADMIN_OCID missing}"
: "${VEKL_WORKER_OCID:?VEKL_WORKER_OCID missing}"
: "${VAN_TRADING_CORE_OCID:?VAN_TRADING_CORE_OCID missing}"

[[ "$DIAL_OCI_COMPARTMENT" == ocid1.compartment.* || "$DIAL_OCI_COMPARTMENT" == ocid1.tenancy.* ]] || die "invalid compartment OCID"
for id in "$ORACLE_ADMIN_OCID" "$VEKL_WORKER_OCID" "$VAN_TRADING_CORE_OCID"; do
  [[ "$id" == ocid1.instance.* ]] || die "invalid instance OCID"
done
[[ "$ORACLE_ADMIN_OCID" != "$VEKL_WORKER_OCID" &&
   "$ORACLE_ADMIN_OCID" != "$VAN_TRADING_CORE_OCID" &&
   "$VEKL_WORKER_OCID" != "$VAN_TRADING_CORE_OCID" ]] || die "Oracle physical instances are not unique"
# The migration source (dial-hermes-control, a separate A1) is enrolled only while it exists and
# has not been retired; it is cloned to Netcup and then terminated.
SOURCE_OCID="${DIAL_HERMES_CONTROL_SOURCE_OCID:-}"
[[ -f /var/lib/dial-control/state/a1-control-retired ]] && SOURCE_OCID=""
if [[ -n "$SOURCE_OCID" ]]; then
  [[ "$SOURCE_OCID" == ocid1.instance.* ]] || die "invalid migration source OCID"
  for id in "$ORACLE_ADMIN_OCID" "$VEKL_WORKER_OCID" "$VAN_TRADING_CORE_OCID"; do
    [[ "$SOURCE_OCID" != "$id" ]] || die "migration source resolved to a retained peer"
  done
fi

OCI=(runuser -u ubuntu -- env
  HOME=/home/ubuntu
  OCI_CLI_CONFIG_FILE="$OCI_CONFIG"
  PATH=/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
  oci)

"${OCI[@]}" iam region list >/dev/null

NETCUP_WG_PUBLIC_KEY="$(cat "$WG_PUB_FILE")"
NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY="$(cat "$SSH_PUB_FILE")"
[[ "$NETCUP_WG_PUBLIC_KEY" =~ ^[A-Za-z0-9+/]{43}=$ ]] || die "invalid Netcup WireGuard public key"
[[ "$NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY" == ssh-* ]] || die "invalid bootstrap SSH public key"

SCRIPT_B64="$(base64 -w0 "$PEER_SCRIPT")"
WG_B64="$(printf '%s' "$NETCUP_WG_PUBLIC_KEY" | base64 -w0)"
SSH_B64="$(printf '%s' "$NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY" | base64 -w0)"

declare -A INSTANCE_IDS=(
  [oracle-admin]="$ORACLE_ADMIN_OCID"
  [vekl-worker]="$VEKL_WORKER_OCID"
  [van-trading-core]="$VAN_TRADING_CORE_OCID"
)
HOSTS=(oracle-admin vekl-worker)
[[ "$VAN_PENDING" == 1 ]] || HOSTS+=(van-trading-core)
if [[ -n "$SOURCE_OCID" ]]; then
  INSTANCE_IDS[old-dial-hermes-control]="$SOURCE_OCID"
  HOSTS+=(old-dial-hermes-control)
fi
declare -A KEYS=()

TMPDIR="$(mktemp -d /tmp/dial-oci-enroll.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT
# The OCI CLI runs as ubuntu (see OCI=...), but this script runs as root with umask 077: a
# root-owned 0700 directory makes every file:// argument read as "did not exist" to the CLI.
chown ubuntu:ubuntu "$TMPDIR"

for HOST_ID in "${HOSTS[@]}"; do
  INSTANCE_ID="${INSTANCE_IDS[$HOST_ID]}"
  # OCI Run Command runs as the unprivileged ocarun user (probed: uid=999(ocarun), no sudo by
  # default). Enrollment needs root, so each VM must carry the owner-granted sudoers entry
  # /etc/sudoers.d/90-dial-ocarun; refuse with that instruction when it is missing.
  CMD="set -Eeuo pipefail; sudo -n true 2>/dev/null || { echo 'DIAL_ENROLL_NEEDS_OCARUN_SUDO: grant /etc/sudoers.d/90-dial-ocarun on this VM'; exit 41; }; printf '%s' '$SCRIPT_B64' | base64 -d >/tmp/dial-zero-touch-enroll.sh; chmod 700 /tmp/dial-zero-touch-enroll.sh; sudo -n env DIAL_HOST_ID='$HOST_ID' NETCUP_PUBLIC_IP='$NETCUP_PUBLIC_IP' NETCUP_WG_PUBLIC_KEY=\"\$(printf '%s' '$WG_B64' | base64 -d)\" NETCUP_BOOTSTRAP_SSH_PUBLIC_KEY=\"\$(printf '%s' '$SSH_B64' | base64 -d)\" bash /tmp/dial-zero-touch-enroll.sh"
  CONTENT="$TMPDIR/content-$HOST_ID.json"
  TARGET="$TMPDIR/target-$HOST_ID.json"
  jq -n --arg text "$CMD" '{source:{sourceType:"TEXT",text:$text},output:{outputType:"TEXT"}}' >"$CONTENT"
  jq -n --arg instance "$INSTANCE_ID" '{instanceId:$instance}' >"$TARGET"
  chown ubuntu:ubuntu "$CONTENT" "$TARGET"

  COMMAND_ID="$("${OCI[@]}" instance-agent command create \
    --compartment-id "$DIAL_OCI_COMPARTMENT" \
    --content "file://$CONTENT" \
    --target "file://$TARGET" \
    --timeout-in-seconds 300 \
    --query data.id --raw-output)"
  [[ "$COMMAND_ID" == ocid1.instanceagentcommand.* ]] || die "invalid Run Command id for $HOST_ID"

  STATE=ACCEPTED
  EXEC_JSON=
  for _ in $(seq 1 60); do
    EXEC_JSON="$("${OCI[@]}" instance-agent command-execution get --command-id "$COMMAND_ID" --instance-id "$INSTANCE_ID")"
    STATE="$(jq -r '.data."lifecycle-state"' <<<"$EXEC_JSON")"
    case "$STATE" in
      SUCCEEDED|FAILED|TIMED_OUT|CANCELED) break ;;
    esac
    sleep 5
  done
  if [[ "$STATE" != SUCCEEDED ]]; then
    # The peer's own output is the only evidence of why it failed; show its tail (no secrets are printed by the peer script).
    jq -r '.data.content.text // "" | split("\n") | .[-25:] | .[]' <<<"$EXEC_JSON" >&2 || true
    die "OCI peer enrollment failed for $HOST_ID: $STATE (exit $(jq -r '.data.content."exit-code" // "n/a"' <<<"$EXEC_JSON"))"
  fi
  EXIT_CODE="$(jq -r '.data.content."exit-code" // -1' <<<"$EXEC_JSON")"
  [[ "$EXIT_CODE" == 0 ]] || die "peer enrollment exit code $EXIT_CODE for $HOST_ID"
  OUTPUT="$(jq -r '.data.content.text // ""' <<<"$EXEC_JSON")"
  grep -q '^ZERO_TOUCH_ORACLE_PEER=GREEN$' <<<"$OUTPUT" || die "peer enrollment receipt missing for $HOST_ID"
  PUB="$(grep '^DIAL_WG_PUBLIC_KEY=' <<<"$OUTPUT" | tail -1 | cut -d= -f2-)"
  [[ "$PUB" =~ ^[A-Za-z0-9+/]{43}=$ ]] || die "invalid peer WireGuard key for $HOST_ID"
  KEYS[$HOST_ID]="$PUB"
done

install -d -m 0700 "$CONTROL_ROOT"
jq -n \
  --arg admin "${KEYS[oracle-admin]}" \
  --arg vekl "${KEYS[vekl-worker]}" \
  --arg van "${KEYS[van-trading-core]:-}" \
  --argjson pending "$VAN_PENDING" \
  --arg src "${KEYS[old-dial-hermes-control]:-}" \
  --arg at "$(date -u +%FT%TZ)" \
  '{
    schema_version:2,
    enrolled_at_utc:$at,
    retained_oracle_instances:(if $pending == 1 then 2 else 3 end),
    van_trading_core_pending_rebuild:($pending == 1),
    hermes_source_enrolled:($src != ""),
    peers:({
      oracle_admin:$admin,
      vekl_worker:$vekl,
      van_trading_core:$van
    } + (if $src != "" then {hermes_source:$src} else {} end))
  }' >"$OUT"
chmod 0600 "$OUT"

echo "OCI_ORACLE_PEERS_ENROLLED=GREEN"
echo "retained_oracle_instances=$(( VAN_PENDING == 1 ? 2 : 3 ))"
echo "van_trading_core_pending_rebuild=$([[ "$VAN_PENDING" == 1 ]] && echo true || echo false)"
echo "hermes_source_enrolled=$([[ -n "${KEYS[old-dial-hermes-control]:-}" ]] && echo true || echo false)"
echo "peer_keys_file=$OUT"
