#!/usr/bin/env bash
# Shared guards for oracle-admin provisioning.
#
# Every script in this directory sources this file. The guards here exist because
# CLAUDE.md section 1 and the task brief both make one requirement absolute: no
# operation may mutate `dial-hermes-control`. hosts.json places Hermes at
# 10.0.0.184 and oracle-admin at 10.0.0.123 — the same /24 — so the VCN, subnet,
# internet gateway, route table and default security list are SHARED with the
# production control host. Anything that edits a shared object edits Hermes'
# network, which is why ingress for this host comes from a dedicated NSG bound to
# one VNIC instead of a security-list rule.

set -euo pipefail

PROTECTED_HOSTS=("dial-hermes-control" "oracle-admin-v2")
TARGET_INSTANCE="oracle-admin"

: "${OCI_CLI_PROFILE:=DEFAULT}"
: "${DIAL_OCI_REGION:=af-johannesburg-1}"

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die()  { printf '[FATAL] %s\n' "$*" >&2; exit 1; }

oci_() { oci --profile "$OCI_CLI_PROFILE" --region "$DIAL_OCI_REGION" "$@"; }

require_cli() {
  command -v oci  >/dev/null 2>&1 || die "OCI CLI not installed. See README.md section 'Operator prerequisites'."
  command -v jq   >/dev/null 2>&1 || die "jq not installed."
  [[ -n "${DIAL_OCI_COMPARTMENT:-}" ]] || die "DIAL_OCI_COMPARTMENT must be set to the target compartment OCID."
}

# Refuse any display name that is a protected host. Called at every boundary that
# names an instance, so a copy-paste of the wrong name cannot reach the API.
assert_target_is_oracle_admin() {
  local name="${1:?name required}"
  for protected in "${PROTECTED_HOSTS[@]}"; do
    [[ "$name" == "$protected" ]] && die "REFUSED: '$name' is a protected host. Only '$TARGET_INSTANCE' may be provisioned."
  done
  [[ "$name" == "$TARGET_INSTANCE" ]] || die "REFUSED: expected '$TARGET_INSTANCE', got '$name'."
}

# Resolve an instance OCID by display name, ignoring TERMINATED records so a
# previously destroyed oracle-admin does not shadow the new one.
instance_ocid_by_name() {
  local name="${1:?}"
  oci_ compute instance list \
    --compartment-id "$DIAL_OCI_COMPARTMENT" \
    --display-name "$name" \
    --all 2>/dev/null \
  | jq -r '[.data[]? | select(."lifecycle-state" != "TERMINATED")] | (.[0].id // "")'
}

# Snapshot every Hermes-owned object this provisioning could conceivably touch.
# Run before and after; `hermes-fingerprint.sh diff` proves section 19 compliance
# from evidence rather than from assertion.
hermes_fingerprint() {
  local hermes_id
  hermes_id="$(instance_ocid_by_name dial-hermes-control)"
  if [[ -z "$hermes_id" ]]; then
    jq -n '{present:false, note:"dial-hermes-control not found in this compartment; nothing to protect here"}'
    return 0
  fi
  local inst vnics
  inst="$(oci_ compute instance get --instance-id "$hermes_id" | jq '.data')"
  vnics="$(oci_ compute instance list-vnics --instance-id "$hermes_id" | jq '[.data[]? | {id, "display-name", "private-ip", "public-ip", "subnet-id", "nsg-ids", "skip-source-dest-check"}]')"

  local subnet_ids subnets="[]" rts="[]" sls="[]"
  subnet_ids="$(jq -r '[.[]."subnet-id"] | unique | .[]' <<<"$vnics")"
  for s in $subnet_ids; do
    local sn; sn="$(oci_ network subnet get --subnet-id "$s" | jq '.data')"
    subnets="$(jq --argjson n "$sn" '. + [$n | {id, "display-name", "cidr-block", "route-table-id", "security-list-ids", "prohibit-public-ip-on-vnic"}]' <<<"$subnets")"
    local rt_id; rt_id="$(jq -r '."route-table-id"' <<<"$sn")"
    local rt;    rt="$(oci_ network route-table get --rt-id "$rt_id" | jq '.data')"
    rts="$(jq --argjson n "$rt" '. + [$n | {id, "display-name", "route-rules"}]' <<<"$rts")"
    for sl_id in $(jq -r '."security-list-ids"[]?' <<<"$sn"); do
      local sl; sl="$(oci_ network security-list get --security-list-id "$sl_id" | jq '.data')"
      sls="$(jq --argjson n "$sl" '. + [$n | {id, "display-name", "ingress-security-rules", "egress-security-rules"}]' <<<"$sls")"
    done
  done

  jq -n --argjson i "$inst" --argjson v "$vnics" --argjson s "$subnets" --argjson r "$rts" --argjson l "$sls" \
    '{present:true,
      instance: ($i | {id, "display-name", "lifecycle-state", shape, "time-created", "image-id"}),
      vnics: $v, subnets: $s, route_tables: $r, security_lists: $l}'
}
