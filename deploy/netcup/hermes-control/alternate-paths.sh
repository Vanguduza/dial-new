#!/usr/bin/env bash
# Alternate Dial Control -> Oracle connection paths, configured and proven. Run as root on Dial Control.
#
#   alternate-paths.sh configure   # write the direct-SSH fallback entries (idempotent)
#   alternate-paths.sh verify      # prove every path to every enrolled peer; writes evidence JSON
#
# Owner decision auth-20260924-owner-network-hardening-recovery-paths. Each path is independent of
# the WireGuard overlay and of Cloudflare:
#
#   overlay      ssh over wg-dial (primary)
#   direct       ssh to the peer's public address from Dial Control's public address; the peer
#                firewall admits only that source (harden-oracle-peer.sh "netcup-direct")
#   run_command  OCI Run Command with Dial Control's durable least-privilege recovery key; the
#                agent pulls the command from OCI, so it needs no inbound path to the VM at all
#   bastion      OCI Bastion managed SSH (needs the owner-granted bastion policy; reported, not faked)
#
# The GitHub-side path (oracle-recovery.yml -> OCI Run Command) does not run through here.
set -Eeuo pipefail
umask 077

MODE="${1:-verify}"
OCI_CONFIG="${OCI_CONFIG:-/home/ubuntu/.oci/config}"
ESTATE="${DIAL_ORACLE_ESTATE:-/etc/dial/oracle-estate.env}"
WG_IF="${DIAL_WG_INTERFACE:-wg-dial}"
SSH_CONFIG=/home/ubuntu/.ssh/config
EVIDENCE="${DIAL_ALT_PATHS_EVIDENCE:-/var/lib/dial-control/state/alternate-paths.json}"
KEY=/home/ubuntu/.ssh/dial-oracle-admin; [[ -f "$KEY" ]] || KEY=/home/ubuntu/.ssh/dial-bootstrap-oracle
BEGIN="# >>> dial-alternate-paths (managed) >>>"
END="# <<< dial-alternate-paths (managed) <<<"
declare -A OVERLAY=([oracle-admin]=10.77.0.2 [vekl-worker]=10.77.0.3 [van-trading-core]=10.77.0.4)

die() { echo "ALT_PATHS_REFUSED: $*" >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || die "run as root"
[[ "$(hostname)" == dial-control ]] || die "wrong host"

OCI=(runuser -u ubuntu -- env HOME=/home/ubuntu OCI_CLI_CONFIG_FILE="$OCI_CONFIG"
  PATH=/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin oci)
ssh_as() { runuser -u ubuntu -- timeout 30 ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 \
  -o ControlMaster=no -o ControlPath=none "$@"; }

# Peer public addresses as the WireGuard hub sees them (the peers dial out to us).
public_ip_of() {
  local overlay="$1"
  wg show "$WG_IF" dump | awk -v ip="$overlay/32" 'NR>1 && $4==ip {split($3,a,":"); print a[1]}'
}

enrolled() { local n; for n in oracle-admin vekl-worker van-trading-core; do
  [[ -n "$(public_ip_of "${OVERLAY[$n]}")" ]] && echo "$n"; done; }

configure() {
  local n pub block=""
  for n in $(enrolled); do
    pub="$(public_ip_of "${OVERLAY[$n]}")"
    block+=$'\n'"Host $n-direct"$'\n'"  HostName $pub"$'\n'"  User ubuntu"$'\n'"  IdentityFile $KEY"$'\n'"  IdentitiesOnly yes"$'\n'"  HostKeyAlias ${OVERLAY[$n]}"$'\n'
  done
  install -d -m 0700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
  touch "$SSH_CONFIG"; chown ubuntu:ubuntu "$SSH_CONFIG"; chmod 0600 "$SSH_CONFIG"
  awk -v b="$BEGIN" -v e="$END" '$0==b{skip=1} !skip{print} $0==e{skip=0}' "$SSH_CONFIG" >"$SSH_CONFIG.next"
  printf '%s%s%s\n' "$BEGIN" "$block" "$END" >>"$SSH_CONFIG.next"
  chown ubuntu:ubuntu "$SSH_CONFIG.next"; chmod 0600 "$SSH_CONFIG.next"; mv "$SSH_CONFIG.next" "$SSH_CONFIG"
  echo "ALT_PATHS_CONFIGURED peers=$(enrolled | tr '\n' ' ')"
}

# The Run Command plugin pulls work on its own schedule (observed 2026-09-24: "scheduling to run
# PollCommand after 3m26s"), so a command can sit ACCEPTED/VISIBLE for ~4 minutes before the agent
# sees it. Every peer's command is created first and all are awaited together, for up to two poll cycles.
RC_WAIT_SECONDS="${DIAL_RC_WAIT_SECONDS:-480}"
declare -A RC_ID=() RC_DETAIL=() RC_HOST=()

run_command_create() { # <peer> <instance-ocid>
  local n="$1" instance="$2" tmp id
  tmp="$(mktemp -d)"; chown ubuntu:ubuntu "$tmp"
  jq -n '{source:{sourceType:"TEXT",text:"hostname"},output:{outputType:"TEXT"}}' >"$tmp/c.json"
  jq -n --arg i "$instance" '{instanceId:$i}' >"$tmp/t.json"; chown ubuntu:ubuntu "$tmp"/*.json
  # stdout carries only the id; OCI CLI warnings go to stderr and are kept apart for the diagnosis.
  id="$("${OCI[@]}" instance-agent command create --compartment-id "$DIAL_OCI_COMPARTMENT" \
        --content "file://$tmp/c.json" --target "file://$tmp/t.json" --timeout-in-seconds 120 \
        --query data.id --raw-output 2>"$tmp/create.err")" || true
  if [[ "$id" == ocid1.instanceagentcommand.* ]]; then RC_ID[$n]="$id"; RC_DETAIL[$n]="state=ACCEPTED"
  else RC_DETAIL[$n]="create_failed:$(grep -v -i warning "$tmp/create.err" | tr '\n' ' ' | cut -c1-160)"; fi
  rm -rf "$tmp"
}

run_command_await() { # <peer> <instance-ocid>; succeeds once the execution is terminal
  local n="$1" instance="$2" json state
  json="$("${OCI[@]}" instance-agent command-execution get --command-id "${RC_ID[$n]}" --instance-id "$instance" 2>/dev/null)" || return 1
  state="$(jq -r '.data."lifecycle-state" // empty' <<<"$json" 2>/dev/null)"
  RC_DETAIL[$n]="state=${state:-none} delivery=$(jq -r '.data."delivery-state" // "none"' <<<"$json" 2>/dev/null) exit=$(jq -r '.data.content."exit-code" // "none"' <<<"$json" 2>/dev/null)"
  [[ "$state" == SUCCEEDED ]] && RC_HOST[$n]="$(jq -r '.data.content.text // ""' <<<"$json" | tr -d '\n')"
  [[ "$state" == SUCCEEDED || "$state" == FAILED || "$state" == TIMED_OUT || "$state" == CANCELED ]]
}

verify() {
  [[ -s "$ESTATE" ]] || die "Oracle estate inventory missing"
  # shellcheck source=/dev/null
  source "$ESTATE"
  declare -A OCID=([oracle-admin]="${ORACLE_ADMIN_OCID:-}" [vekl-worker]="${VEKL_WORKER_OCID:-}" [van-trading-core]="${VAN_TRADING_CORE_OCID:-}")
  local n out results='[]' pub overlay direct rc bastion
  # AVAILABLE only when a bastion exists and this identity may read it; otherwise the owner-granted policy/bastion is missing.
  bastion="$("${OCI[@]}" bastion bastion list --compartment-id "$DIAL_OCI_COMPARTMENT" --all 2>/dev/null | jq -e '[.data[]? | select(."lifecycle-state"=="ACTIVE")] | length > 0' >/dev/null && echo AVAILABLE || echo OWNER_ACTION_REQUIRED)"
  local peers=() pending deadline
  declare -A RC_DONE=()
  mapfile -t peers < <(enrolled)
  for n in "${peers[@]}"; do run_command_create "$n" "${OCID[$n]}"; done
  deadline=$((SECONDS + RC_WAIT_SECONDS))
  while :; do
    pending=0
    for n in "${peers[@]}"; do
      [[ -n "${RC_ID[$n]:-}" && -z "${RC_DONE[$n]:-}" ]] || continue
      if run_command_await "$n" "${OCID[$n]}"; then RC_DONE[$n]=1; else pending=1; fi
    done
    (( pending && SECONDS < deadline )) || break
    sleep 10
  done
  for n in "${peers[@]}"; do
    pub="$(public_ip_of "${OVERLAY[$n]}")"
    out="$(ssh_as ubuntu@"${OVERLAY[$n]}" hostname 2>/dev/null || true)"; [[ "$out" == "$n" ]] && overlay=PASS || overlay=FAIL
    out="$(ssh_as -o HostKeyAlias="${OVERLAY[$n]}" ubuntu@"$pub" hostname 2>/dev/null || true)"; [[ "$out" == "$n" ]] && direct=PASS || direct=FAIL
    [[ "${RC_HOST[$n]:-}" == "$n" ]] && rc=PASS || rc=FAIL
    results="$(jq -c --arg n "$n" --arg pub "$pub" --arg o "$overlay" --arg d "$direct" --arg r "$rc" --arg b "$bastion" \
      --arg rd "${RC_DETAIL[$n]:-none}" '. + [{peer:$n, public_ip:$pub, overlay:$o, direct:$d, run_command:$r, run_command_detail:$rd, bastion:$b}]' <<<"$results")"
    echo "peer=$n overlay=$overlay direct=$direct run_command=$rc (${RC_DETAIL[$n]:-none}) bastion=$bastion"
  done
  install -d -m 0700 "$(dirname "$EVIDENCE")"
  jq -n --argjson r "$results" --arg at "$(date -u +%FT%TZ)" \
    '{schema:"dial.alternate-paths.v1", observed_at_utc:$at, peers:$r,
      independent_non_overlay_paths_per_peer: ($r | map({(.peer): ([.direct, .run_command] | map(select(.=="PASS")) | length)}) | add)}' >"$EVIDENCE"
  # Every enrolled peer needs at least two proven paths that do not depend on the overlay.
  jq -e '(.peers | length) > 0 and ([.peers[] | ([.direct, .run_command] | map(select(.=="PASS")) | length) >= 2 and .overlay=="PASS"] | all)' "$EVIDENCE" >/dev/null &&
    echo "ALT_PATHS=GREEN" || { echo "ALT_PATHS=PARTIAL"; return 1; }
}

case "$MODE" in
  configure) configure ;;
  verify) verify ;;
  *) echo "usage: $0 configure|verify" >&2; exit 2 ;;
esac
