#!/usr/bin/env bash
# Boot-volume backup policy — the difference between "the host is recoverable" and
# "the host is rebuildable".
#
# Until this ran, NO host in the estate had any backup policy at all. Every recovery
# story ended in re-provisioning from scratch, which is exactly what cost a day when
# the first oracle-admin became unreachable. Certification proved SSH and Run Command
# worked; nothing proved the disk would survive.
#
#   ./40-backup-policy.sh                 # report current assignments, change nothing
#   ./40-backup-policy.sh --apply         # assign to oracle-admin only
#   ./40-backup-policy.sh --apply --policy Silver
#   ./40-backup-policy.sh --apply --include-hermes   # see the warning below
#
# dial-hermes-control and oracle-admin-v2 are NOT touched without --include-hermes.
# Assigning a policy to their boot volumes is still a modification of a protected
# host, so it stays an explicit, deliberate owner action rather than a default.
#
# Policy choice, honestly: Bronze is monthly, Silver adds weekly, Gold adds daily.
# On a Free Tier account backup storage counts against the block-volume allowance,
# so Bronze is the default here. For a host whose state changes daily, Silver or Gold
# is the better answer and the storage cost is the reason to choose deliberately.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli

APPLY=false
INCLUDE_HERMES=false
POLICY_NAME="${DIAL_BACKUP_POLICY:-Bronze}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)          APPLY=true ;;
    --include-hermes) INCLUDE_HERMES=true ;;
    --policy)         POLICY_NAME="${2:?--policy needs a name}"; shift ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

TARGETS=("$TARGET_INSTANCE")
if [[ "$INCLUDE_HERMES" == true ]]; then
  log "WARNING: --include-hermes will assign a backup policy to the boot volumes of"
  log "         dial-hermes-control and oracle-admin-v2. That is a change to protected"
  log "         hosts. It adds no compute risk and does not reboot anything, but it is"
  log "         a modification and is being recorded as a deliberate owner action."
  TARGETS+=("dial-hermes-control" "oracle-admin-v2")
fi

# Resolve the named policy once.
policy_id="$(oci_ bv volume-backup-policy list --all \
  | jq -r --arg n "$POLICY_NAME" '[.data[]? | select(."display-name"==$n)] | (.[0].id // "")')"
[[ -n "$policy_id" ]] || die "No volume backup policy named '$POLICY_NAME'. Try Bronze, Silver or Gold."
log "Policy '$POLICY_NAME' -> $policy_id"

report='[]'

for name in "${TARGETS[@]}"; do
  instance_id="$(instance_ocid_by_name "$name")"
  if [[ -z "$instance_id" ]]; then
    log "SKIP $name — no live instance with that name in this compartment."
    continue
  fi

  ad="$(oci_ compute instance get --instance-id "$instance_id" | jq -r '.data."availability-domain"')"
  bv_id="$(oci_ compute boot-volume-attachment list \
      --compartment-id "$DIAL_OCI_COMPARTMENT" --availability-domain "$ad" \
      --instance-id "$instance_id" \
    | jq -r '[.data[]? | select(."lifecycle-state"=="ATTACHED")] | (.[0]."boot-volume-id" // "")')"
  [[ -n "$bv_id" ]] || { log "SKIP $name — could not resolve an attached boot volume."; continue; }

  current="$(oci_ bv volume-backup-policy-assignment get-volume-backup-policy-asset-assignment \
      --asset-id "$bv_id" 2>/dev/null \
    | jq -r '[.data[]?] | (.[0]."policy-id" // "")')"

  if [[ -n "$current" ]]; then
    cur_name="$(oci_ bv volume-backup-policy get --policy-id "$current" 2>/dev/null \
      | jq -r '.data."display-name" // "unknown"')"
    log "$name: boot volume already has policy '$cur_name'"
    action="already-assigned:$cur_name"
  elif [[ "$APPLY" != true ]]; then
    log "$name: NO BACKUP POLICY. Re-run with --apply to assign '$POLICY_NAME'."
    action="none-would-assign:$POLICY_NAME"
  else
    if oci_ bv volume-backup-policy-assignment create --asset-id "$bv_id" --policy-id "$policy_id" >/dev/null 2>&1; then
      log "$name: assigned '$POLICY_NAME'"
      action="assigned:$POLICY_NAME"
    else
      log "$name: FAILED to assign a policy — check permissions and the block-volume quota."
      action="failed"
    fi
  fi

  report="$(jq --arg h "$name" --arg i "$instance_id" --arg b "$bv_id" --arg a "$action" \
    '. + [{host:$h, instance_id:$i, boot_volume_id:$b, backup:$a}]' <<<"$report")"
done

OUT="$(dirname "${BASH_SOURCE[0]}")/backup-policy.json"
jq -n --argjson r "$report" --arg p "$POLICY_NAME" --argjson applied "$APPLY" \
  '{schema_version:1, policy:$p, applied:$applied, hosts:$r, observed_at:(now|todate)}' > "$OUT"

log "Wrote $OUT"
jq . "$OUT" >&2

# A host with no backup is not a recoverable host, so say so in the exit status.
if jq -e '[.hosts[] | select(.backup | startswith("none") or . == "failed")] | length > 0' "$OUT" >/dev/null 2>&1; then
  log ""
  log "At least one host has no boot-volume backup. Until that is fixed, losing its"
  log "boot volume means rebuilding, not restoring."
  exit 3
fi
