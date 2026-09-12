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
# Record an instance we own into instance.json. Shared by the launch path and the
# adoption path below so both produce identical evidence.
write_instance_json() {
  local id="$1" img="${2:-}" adom="${3:-}"
  local vnics; vnics="$(oci_ compute instance list-vnics --instance-id "$id")"
  local pub priv
  pub="$(jq -r '.data[0]."public-ip"  // ""' <<<"$vnics")"
  priv="$(jq -r '.data[0]."private-ip" // ""' <<<"$vnics")"
  jq -n --arg id "$id" --arg pub "$pub" --arg priv "$priv" \
        --arg img "$img" --arg ad "$adom" --arg shape "$SHAPE" \
    '{instance_id:$id, public_ip:$pub, private_ip:$priv, image_id:$img,
      availability_domain:$ad, shape:$shape}' > "$HERE/instance.json"
  log "Public IP:  $pub"
  log "Private IP: $priv"
  log "Wrote $HERE/instance.json"
}

# If an oracle-admin already exists, adopt it instead of launching a second one.
# A run that created the instance and then died before writing instance.json is a
# real outcome on a flaky connection, and the safe response is to record what exists
# rather than to refuse (which strands the run) or to relaunch (which duplicates a
# host and burns the pinned private IP).
existing="$(instance_ocid_by_name "$NAME")"
if [[ -n "$existing" ]]; then
  state="$(oci_ compute instance get --instance-id "$existing" | jq -r '.data."lifecycle-state" // "UNKNOWN"')"
  log "An instance named $NAME already exists: $existing ($state)."
  log "Adopting it rather than launching another — an earlier run created it."
  write_instance_json "$existing" \
    "$(oci_ compute instance get --instance-id "$existing" | jq -r '.data."image-id" // ""')" \
    "$(oci_ compute instance get --instance-id "$existing" | jq -r '.data."availability-domain" // ""')"
  log ""
  log "Nothing was launched. Re-run ~/p/run.sh for the next step."
  exit 0
fi

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

# Section 9: IMDSv1 off — instance metadata requires the v2 authorization header.
INSTANCE_OPTIONS='{"areLegacyImdsEndpointsDisabled": true}'
METADATA="$(jq -nc --rawfile k "$HERE/authorized_key.pub" --arg u "$(base64 -w0 < "$USER_DATA_GZ")" \
    '{ssh_authorized_keys:$k, user_data:$u}')"

# There is no --create-vnic-details option: the CLI flattens
# LaunchInstanceDetails.createVnicDetails into individual flags, and their names have
# moved between CLI versions. So every flag is checked against this CLI's own help
# before the call. Discovering unsupported options one rejected launch at a time is
# slow and, worse, invites dropping whichever flag was blamed — and these flags carry
# the SSH ingress, the metadata hardening and the address the recovery agent uses.
#
# Section 5/6: the VNIC carries the isolated NSG. No security-list edit anywhere.
LAUNCH_HELP="$(oci compute instance launch --help 2>/dev/null || true)"
supported() { [[ -z "$LAUNCH_HELP" ]] || grep -qF -- "$1" <<<"$LAUNCH_HELP"; }

declare -a ARGS=() MISSING=()
add() { # add required|optional <flag> <value>
  if supported "$2"; then ARGS+=("$2" "$3")
  elif [[ "$1" == required ]]; then MISSING+=("$2")
  else log "NOTE: this OCI CLI has no $2; continuing without it (cosmetic only)."; fi
}

add required --compartment-id      "$DIAL_OCI_COMPARTMENT"
add required --availability-domain "$ad"
add required --display-name        "$NAME"
add required --shape               "$SHAPE"
add required --image-id            "$image_id"
add required --subnet-id           "$subnet_id"
add required --metadata            "$METADATA"
add required --assign-public-ip    true
add required --private-ip          "$private_ip"
add required --hostname-label      oracle-admin
add required --nsg-ids             "$(jq -nc --arg n "$nsg_id" '[$n]')"
add required --agent-config        "$AGENT_CONFIG"
add required --instance-options    "$INSTANCE_OPTIONS"
add required --is-pv-encryption-in-transit-enabled true
add optional --vnic-display-name   oracle-admin-vnic
add optional --assign-private-dns-record true

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo >&2
  die "This OCI CLI does not support: ${MISSING[*]}
       These are not droppable: they carry SSH ingress (--nsg-ids), IMDSv2 hardening
       (--instance-options), Run Command (--agent-config) and the private address the
       recovery agent resolves peers by (--private-ip).
       Run 'oci compute instance launch --help' and send the option list."
fi

log "Launching $NAME ($SHAPE, private IP $private_ip) …"

# Capture stdout ONLY. `--wait-for-state` writes its progress commentary to stderr,
# and folding that into stdout with `2>&1` corrupts the JSON that the instance OCID
# is parsed from — which fails *after* Oracle has already built the machine.
ERR="$(mktemp)"; trap 'rm -f "$USER_DATA" "$USER_DATA_GZ" "$ERR"' EXIT

if ! launch_out="$(oci_ compute instance launch "${ARGS[@]}" \
      --wait-for-state RUNNING --max-wait-seconds 900 2>"$ERR")"; then
  # Section 20: surface the real API error and request id instead of retrying blind.
  cat "$ERR" >&2
  echo >&2
  echo "LAUNCH FAILED. Do not re-run blindly — read the error above." >&2
  grep -oE 'opc-request-id[^ ,"]*' "$ERR" >&2 || true
  die "instance launch rejected by OCI"
fi

instance_id="$(jq -r '.data.id // empty' <<<"$launch_out" 2>/dev/null || true)"
if [[ -z "$instance_id" ]]; then
  # The call succeeded, so an instance may well exist even though its OCID could not
  # be read. Say so plainly: re-running is safe, because the adoption path above will
  # find it rather than build a second one.
  echo "--- launch stdout ---" >&2; head -40 <<<"$launch_out" >&2
  echo "--- launch stderr ---" >&2; head -20 "$ERR" >&2
  die "Launch reported success but no instance OCID could be parsed.
       The instance may exist. Re-run ~/p/run.sh — it will adopt an existing
       $NAME rather than launch a second one."
fi
log "Instance RUNNING: $instance_id"

write_instance_json "$instance_id" "$image_id" "$ad"
log ""
log "Next: wait for cloud-init, then"
log "  ssh -i <private-key> ubuntu@$public_ip 'sudo dial-host-certify'"
log "  ./30-certify.mjs"
