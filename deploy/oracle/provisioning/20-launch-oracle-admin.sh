#!/usr/bin/env bash
# Launch the oracle-admin E2 recovery/admin instance.
#
# Preconditions: 10-network-preflight.sh has run and written network.json. This
# script creates exactly one thing — the instance and its VNIC — and references
# every network object by the OCID resolved earlier. It never creates or edits a
# VCN, subnet, gateway, route table or security list, which is what makes it safe
# to run against a network shared with dial-hermes-control.
#
#   export DIAL_OCI_COMPARTMENT=ocid1.compartment.oc1..xxxx
#   ./10-network-preflight.sh
#   ./20-launch-oracle-admin.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_cli

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK="${DIAL_NETWORK_OUT:-$HERE/network.json}"
[[ -f $NETWORK ]] || die "missing $NETWORK — run 10-network-preflight.sh first."

NAME=oracle-admin
assert_target_is_oracle_admin "$NAME"

SHAPE=VM.Standard.E2.1.Micro
OS_NAME="Canonical Ubuntu"
OS_VERSION="24.04"

subnet_id="$(jq -r '.subnet_id' "$NETWORK")"
nsg_id="$(jq -r '.nsg_id' "$NETWORK")"
private_ip="$(jq -r '.private_ip' "$NETWORK")"
[[ $subnet_id == ocid1.subnet.* ]] || die "network.json has no usable subnet_id"

# Refuse to proceed if an oracle-admin already exists — never clobber a live host.
existing="$(instance_ocid_by_name "$NAME")"
[[ -z "$existing" ]] || die "An instance named $NAME already exists ($existing). Terminate it deliberately first, or work with the existing host."

# ---------------------------------------------------------------- image
# Resolve by OS + version + shape so the pinned OCID cannot drift or belong to the
# wrong architecture. Minimal images are excluded: the brief prefers Ubuntu Server.
image_id="$(oci_ compute image list \
  --compartment-id "$DIAL_OCI_COMPARTMENT" \
  --operating-system "$OS_NAME" --operating-system-version "$OS_VERSION" \
  --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC --all \
  | jq -r '[.data[]? | select((."display-name"|test("Minimal";"i")|not) and (."display-name"|test("aarch64";"i")|not))] | (.[0].id // "")')"
[[ -n "$image_id" ]] || die "Could not resolve a Canonical Ubuntu $OS_VERSION image for $SHAPE in $DIAL_OCI_REGION."
log "Image: $image_id ($(oci_ compute image get --image-id "$image_id" | jq -r '.data."display-name"'))"

# ---------------------------------------------------------------- AD
# E2.1.Micro capacity varies by availability domain; take the first AD that has it.
ad=""
for candidate in $(oci_ iam availability-domain list --compartment-id "$DIAL_OCI_COMPARTMENT" | jq -r '.data[].name'); do
  if oci_ compute shape list --compartment-id "$DIAL_OCI_COMPARTMENT" --availability-domain "$candidate" \
     | jq -e --arg s "$SHAPE" '[.data[]?.shape] | index($s)' >/dev/null 2>&1; then
    ad="$candidate"; break
  fi
done
[[ -n "$ad" ]] || die "$SHAPE is not offered in any availability domain of this compartment/region."
log "Availability domain: $ad"

# ---------------------------------------------------------------- user-data
USER_DATA="$(mktemp)"; USER_DATA_GZ="$(mktemp)"
trap 'rm -f "$USER_DATA" "$USER_DATA_GZ"' EXIT
"$HERE/render-cloud-init.sh" > "$USER_DATA"
raw_bytes=$(wc -c < "$USER_DATA")

# Sanity-check the document before it becomes unreadable base64 in an API call.
python3 -c 'import sys,yaml; yaml.safe_load(open(sys.argv[1]))' "$USER_DATA" 2>/dev/null \
  || log "WARNING: could not YAML-validate the rendered cloud-init locally (python3+pyyaml absent)."

# gzip it: cloud-init detects and decompresses gzipped user-data, and OCI's instance
# metadata is capped at 32 KB. The raw document base64-encodes to roughly 4/3 its
# size, which runs uncomfortably close to that ceiling.
gzip -9 -c "$USER_DATA" > "$USER_DATA_GZ"
gz_bytes=$(wc -c < "$USER_DATA_GZ")
b64_bytes=$(( (gz_bytes + 2) / 3 * 4 ))
log "cloud-init: ${raw_bytes} B raw -> ${gz_bytes} B gzip -> ~${b64_bytes} B base64"
[[ $b64_bytes -lt 30000 ]] || die "encoded user-data is ${b64_bytes} B, too close to the 32 KB metadata limit."

# ---------------------------------------------------------------- agent config
# Section 8: Run Command, Monitoring and Bastion on; every heavy or unnecessary
# workload agent off. This is a 1 GB host whose job is recovery, not observability.
AGENT_CONFIG="$(jq -nc '{
  isMonitoringDisabled: false,
  isManagementDisabled: true,
  areAllPluginsDisabled: false,
  pluginsConfig: [
    {name:"Compute Instance Run Command",        desiredState:"ENABLED"},
    {name:"Compute Instance Monitoring",         desiredState:"ENABLED"},
    {name:"Bastion",                             desiredState:"ENABLED"},
    {name:"OS Management Hub Agent",             desiredState:"DISABLED"},
    {name:"Management Agent",                    desiredState:"DISABLED"},
    {name:"Custom Logs Monitoring",              desiredState:"DISABLED"},
    {name:"Vulnerability Scanning",              desiredState:"DISABLED"},
    {name:"Block Volume Management",             desiredState:"DISABLED"},
    {name:"Oracle Java Management Service",      desiredState:"DISABLED"},
    {name:"WebLogic Management Service",         desiredState:"DISABLED"},
    {name:"Cloud Guard Workload Protection",     desiredState:"DISABLED"},
    {name:"Fleet Application Management Service",desiredState:"DISABLED"},
    {name:"Compute HPC RDMA Auto-Configuration", desiredState:"DISABLED"},
    {name:"Compute HPC RDMA Authentication",     desiredState:"DISABLED"},
    {name:"Compute RDMA GPU Monitoring",         desiredState:"DISABLED"}
  ]}')"

# Section 5/6: the VNIC carries the isolated NSG. No security-list edit anywhere.
VNIC_DETAILS="$(jq -nc --arg s "$subnet_id" --arg n "$nsg_id" --arg ip "$private_ip" '{
  displayName:"oracle-admin-vnic",
  hostnameLabel:"oracle-admin",
  subnetId:$s,
  assignPublicIp:true,
  assignPrivateDnsRecord:true,
  privateIp:$ip,
  nsgIds:[$n]}')"

# Section 9: IMDSv1 off — instance metadata requires the v2 authorization header.
INSTANCE_OPTIONS='{"areLegacyImdsEndpointsDisabled": true}'

log "Launching $NAME ($SHAPE, private IP $private_ip) …"
launch_out="$(oci_ compute instance launch \
  --compartment-id "$DIAL_OCI_COMPARTMENT" \
  --availability-domain "$ad" \
  --display-name "$NAME" \
  --shape "$SHAPE" \
  --image-id "$image_id" \
  --create-vnic-details "$VNIC_DETAILS" \
  --agent-config "$AGENT_CONFIG" \
  --instance-options "$INSTANCE_OPTIONS" \
  --is-pv-encryption-in-transit-enabled true \
  --metadata "$(jq -nc --rawfile k "$HERE/authorized_key.pub" --arg u "$(base64 -w0 < "$USER_DATA_GZ")" \
      '{ssh_authorized_keys:$k, user_data:$u}')" \
  --wait-for-state RUNNING --max-wait-seconds 900 2>&1)" || {
    # Section 20: surface the real API error and request id instead of retrying blind.
    echo "$launch_out" >&2
    echo >&2
    echo "LAUNCH FAILED. Do not re-run blindly — read the error above." >&2
    grep -oE 'opc-request-id[^ ,"]*' <<<"$launch_out" >&2 || true
    die "instance launch rejected by OCI"
  }

instance_id="$(jq -r '.data.id // empty' <<<"$launch_out")"
[[ -n "$instance_id" ]] || die "launch returned no instance OCID; raw output: $launch_out"
log "Instance RUNNING: $instance_id"

public_ip="$(oci_ compute instance list-vnics --instance-id "$instance_id" | jq -r '.data[0]."public-ip" // ""')"
priv_ip="$(oci_ compute instance list-vnics --instance-id "$instance_id" | jq -r '.data[0]."private-ip" // ""')"

jq -n --arg id "$instance_id" --arg pub "$public_ip" --arg priv "$priv_ip" \
      --arg img "$image_id" --arg ad "$ad" --arg shape "$SHAPE" \
  '{instance_id:$id, public_ip:$pub, private_ip:$priv, image_id:$img, availability_domain:$ad, shape:$shape}' \
  > "$HERE/instance.json"

log "Public IP:  $public_ip"
log "Private IP: $priv_ip"
log "Wrote $HERE/instance.json"
log ""
log "Next: wait for cloud-init, then"
log "  ssh -i <private-key> ubuntu@$public_ip 'sudo dial-host-certify'"
log "  ./30-certify.mjs"
