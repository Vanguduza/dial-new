#!/usr/bin/env bash
# PHASE N0 — resolve and verify the network BEFORE any compute launch.
#
# The previous oracle-admin attempt failed because the VCN/subnet were created
# inline with the launch request. This script settles the network first and emits
# the resolved OCIDs; 20-launch-oracle-admin.sh consumes that file and creates
# nothing networked except the instance VNIC.
#
# Discovery-first, by design. hosts.json puts dial-hermes-control at 10.0.0.184 and
# oracle-admin at 10.0.0.123 — one /24 — so the VCN, subnet, gateway and route table
# are almost certainly EXISTING, SHARED, Hermes-owned objects. This script therefore
# verifies them and refuses to mutate them. It creates only what is genuinely absent,
# plus one new NSG that is bound to the oracle-admin VNIC alone.
#
# Output: network.json

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli

VCN_NAME="dial-hermes-vcn"
VCN_CIDR="10.0.0.0/16"
SUBNET_NAME="dial-hermes-public-subnet"
SUBNET_CIDR="10.0.0.0/24"
NSG_NAME="oracle-admin-nsg"
TARGET_PRIVATE_IP="${DIAL_ORACLE_ADMIN_PRIVATE_IP:-10.0.0.123}"
SSH_CIDR="${DIAL_SSH_INGRESS_CIDR:-0.0.0.0/0}"
OUT="${DIAL_NETWORK_OUT:-$(dirname "${BASH_SOURCE[0]}")/network.json}"

created=()

# ---------------------------------------------------------------- VCN
vcn_id="$(oci_ network vcn list --compartment-id "$DIAL_OCI_COMPARTMENT" --display-name "$VCN_NAME" --all \
  | jq -r '[.data[]? | select(."lifecycle-state"=="AVAILABLE")] | (.[0].id // "")')"

if [[ -n "$vcn_id" ]]; then
  log "VCN $VCN_NAME exists: $vcn_id (SHARED — will not be modified)"
  actual_cidr="$(oci_ network vcn get --vcn-id "$vcn_id" | jq -r '.data."cidr-block"')"
  [[ "$actual_cidr" == "$VCN_CIDR" ]] || log "WARNING: VCN CIDR is $actual_cidr, brief expected $VCN_CIDR. Using existing; NOT altering a shared VCN."
else
  log "VCN $VCN_NAME genuinely absent — creating."
  vcn_id="$(oci_ network vcn create --compartment-id "$DIAL_OCI_COMPARTMENT" \
      --display-name "$VCN_NAME" --cidr-blocks "[\"$VCN_CIDR\"]" \
      --dns-label dialhermes --wait-for-state AVAILABLE | jq -r '.data.id')"
  created+=("vcn:$vcn_id")
fi

# ---------------------------------------------------------------- Internet gateway
igw_id="$(oci_ network internet-gateway list --compartment-id "$DIAL_OCI_COMPARTMENT" --vcn-id "$vcn_id" --all \
  | jq -r '[.data[]? | select(."lifecycle-state"=="AVAILABLE")] | (.[0].id // "")')"
if [[ -z "$igw_id" ]]; then
  log "No internet gateway on $VCN_NAME — creating."
  igw_id="$(oci_ network internet-gateway create --compartment-id "$DIAL_OCI_COMPARTMENT" \
      --vcn-id "$vcn_id" --is-enabled true --display-name "dial-hermes-igw" \
      --wait-for-state AVAILABLE | jq -r '.data.id')"
  created+=("igw:$igw_id")
else
  log "Internet gateway present: $igw_id"
fi

# ---------------------------------------------------------------- Subnet
subnet_id="$(oci_ network subnet list --compartment-id "$DIAL_OCI_COMPARTMENT" --vcn-id "$vcn_id" --display-name "$SUBNET_NAME" --all \
  | jq -r '[.data[]? | select(."lifecycle-state"=="AVAILABLE")] | (.[0].id // "")')"

if [[ -n "$subnet_id" ]]; then
  log "Subnet $SUBNET_NAME exists: $subnet_id (SHARED — will not be modified)"
  sn="$(oci_ network subnet get --subnet-id "$subnet_id" | jq '.data')"
  [[ "$(jq -r '."prohibit-public-ip-on-vnic"' <<<"$sn")" == "false" ]] \
    || die "Subnet $SUBNET_NAME prohibits public IPs. Changing that would alter a Hermes-shared subnet — STOP. Use an isolated new public subnet instead (set DIAL_SUBNET_NAME)."
  rt_id="$(jq -r '."route-table-id"' <<<"$sn")"
  has_default="$(oci_ network route-table get --rt-id "$rt_id" \
    | jq -r '[.data."route-rules"[]? | select(.destination=="0.0.0.0/0" and (."network-entity-id"|startswith("ocid1.internetgateway")))] | length')"
  [[ "$has_default" -ge 1 ]] \
    || die "Route table $rt_id has no 0.0.0.0/0 -> internet gateway rule. It is shared with dial-hermes-control; editing it is forbidden by section 19 — STOP and resolve with the owner."
  log "Subnet is public and its route table has a default route to the internet gateway."
else
  log "Subnet $SUBNET_NAME genuinely absent — creating a public subnet with its own route table."
  rt_id="$(oci_ network route-table create --compartment-id "$DIAL_OCI_COMPARTMENT" --vcn-id "$vcn_id" \
      --display-name "dial-hermes-public-rt" \
      --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$igw_id\"}]" \
      --wait-for-state AVAILABLE | jq -r '.data.id')"
  created+=("route-table:$rt_id")
  subnet_id="$(oci_ network subnet create --compartment-id "$DIAL_OCI_COMPARTMENT" --vcn-id "$vcn_id" \
      --display-name "$SUBNET_NAME" --cidr-block "$SUBNET_CIDR" --dns-label public \
      --route-table-id "$rt_id" --prohibit-public-ip-on-vnic false \
      --wait-for-state AVAILABLE | jq -r '.data.id')"
  created+=("subnet:$subnet_id")
fi

# ---------------------------------------------------------------- NSG (isolated ingress)
# Ingress is applied here, NOT on the shared security list. An NSG binds to the
# oracle-admin VNIC only, so Hermes' effective ingress policy is untouched.
nsg_id="$(oci_ network nsg list --compartment-id "$DIAL_OCI_COMPARTMENT" --vcn-id "$vcn_id" --display-name "$NSG_NAME" --all \
  | jq -r '[.data[]? | select(."lifecycle-state"=="AVAILABLE")] | (.[0].id // "")')"
if [[ -z "$nsg_id" ]]; then
  log "Creating NSG $NSG_NAME (isolated; binds to oracle-admin VNIC only)."
  nsg_id="$(oci_ network nsg create --compartment-id "$DIAL_OCI_COMPARTMENT" --vcn-id "$vcn_id" \
      --display-name "$NSG_NAME" --wait-for-state AVAILABLE | jq -r '.data.id')"
  created+=("nsg:$nsg_id")
fi

if [[ "$SSH_CIDR" == "0.0.0.0/0" ]]; then
  log "WARNING: SSH ingress is 0.0.0.0/0. Section 6 prefers a restricted administrative source."
  log "         Set DIAL_SSH_INGRESS_CIDR=<x.x.x.x/32> and re-run to narrow it. Recorded in network.json."
fi

# Idempotent: only add the SSH rule when an equivalent one is absent.
existing_ssh="$(oci_ network nsg rules list --nsg-id "$nsg_id" --all \
  | jq -r --arg c "$SSH_CIDR" '[.data[]? | select(.direction=="INGRESS" and .source==$c and (."tcp-options"."destination-port-range".min? == 22))] | length')"
if [[ "${existing_ssh:-0}" -eq 0 ]]; then
  oci_ network nsg rules add --nsg-id "$nsg_id" --security-rules "[{
      \"direction\":\"INGRESS\",\"protocol\":\"6\",\"source\":\"$SSH_CIDR\",\"sourceType\":\"CIDR_BLOCK\",
      \"description\":\"SSH admin/recovery access to oracle-admin\",
      \"tcpOptions\":{\"destinationPortRange\":{\"min\":22,\"max\":22}}}]" >/dev/null
  log "Added SSH ingress 22/tcp from $SSH_CIDR."
fi

existing_egress="$(oci_ network nsg rules list --nsg-id "$nsg_id" --all \
  | jq -r '[.data[]? | select(.direction=="EGRESS" and .destination=="0.0.0.0/0")] | length')"
if [[ "${existing_egress:-0}" -eq 0 ]]; then
  oci_ network nsg rules add --nsg-id "$nsg_id" --security-rules '[{
      "direction":"EGRESS","protocol":"all","destination":"0.0.0.0/0","destinationType":"CIDR_BLOCK",
      "description":"Outbound for apt, GitHub, npm, Oracle services and the Commander device channel"}]' >/dev/null
  log "Added default egress."
fi

# ---------------------------------------------------------------- Private IP availability
# hosts.json pins oracle-admin to 10.0.0.123; the recovery agent resolves peers by
# that address, so the brief's "automatic" is overridden by repository truth.
ip_taken="$(oci_ network private-ip list --subnet-id "$subnet_id" --ip-address "$TARGET_PRIVATE_IP" \
  | jq -r '[.data[]?] | length' 2>/dev/null || echo 0)"
if [[ "${ip_taken:-0}" -ne 0 ]]; then
  log "WARNING: $TARGET_PRIVATE_IP is already assigned in this subnet."
  log "         Launch will fail. Free it or set DIAL_ORACLE_ADMIN_PRIVATE_IP and update hosts.json to match."
fi

jq -n --arg vcn "$vcn_id" --arg subnet "$subnet_id" --arg igw "$igw_id" --arg nsg "$nsg_id" \
      --arg rt "${rt_id:-}" --arg ip "$TARGET_PRIVATE_IP" --arg sshcidr "$SSH_CIDR" \
      --arg region "$DIAL_OCI_REGION" --arg compartment "$DIAL_OCI_COMPARTMENT" \
      --argjson created "$(printf '%s\n' "${created[@]:-}" | jq -R . | jq -s 'map(select(. != ""))')" \
  '{schema_version:1, region:$region, compartment_id:$compartment,
    vcn_id:$vcn, subnet_id:$subnet, internet_gateway_id:$igw, route_table_id:$rt,
    nsg_id:$nsg, private_ip:$ip, ssh_ingress_cidr:$sshcidr,
    resources_created_by_this_run:$created,
    hermes_shared_objects_modified:false}' > "$OUT"

log "Network preflight complete -> $OUT"
jq . "$OUT" >&2
