# Re-establish the provisioning environment after a shell reconnect.
#
#   source env.sh
#
# OCI Cloud Shell disconnects on idle and comes back in $HOME with an empty
# environment, which silently strips DIAL_OCI_COMPARTMENT and friends. Re-pasting
# four exports by hand on a phone is how a provisioning run goes wrong, so this
# restores them in one command and prints what it set.
#
# Safe to source repeatedly. Values already set in the environment win, so it
# never overrides a deliberate choice.

: "${DIAL_OCI_REGION:=af-johannesburg-1}"
: "${DIAL_SSH_INGRESS_CIDR:=0.0.0.0/0}"

# Cloud Shell exports the tenancy OCID; the root compartment is the default target.
if [[ -z "${DIAL_OCI_COMPARTMENT:-}" && -n "${OCI_TENANCY:-}" ]]; then
  DIAL_OCI_COMPARTMENT="$OCI_TENANCY"
fi

# Find the recovery key without depending on the caller's cwd.
if [[ -z "${DIAL_SSH_PRIVATE_KEY_FILE:-}" ]]; then
  for candidate in "$HOME/oracle-admin.key" "$HOME"/ssh-key-*.key; do
    [[ -f "$candidate" ]] && { DIAL_SSH_PRIVATE_KEY_FILE="$candidate"; break; }
  done
fi

export DIAL_OCI_REGION DIAL_OCI_COMPARTMENT DIAL_SSH_INGRESS_CIDR DIAL_SSH_PRIVATE_KEY_FILE

# SSH refuses a key other users can read, and a fresh upload is usually 0644.
if [[ -f "${DIAL_SSH_PRIVATE_KEY_FILE:-}" ]]; then
  [[ "$(stat -c '%a' "$DIAL_SSH_PRIVATE_KEY_FILE")" == "600" ]] || chmod 600 "$DIAL_SSH_PRIVATE_KEY_FILE"
fi

cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null || true

printf '\nDIAL provisioning environment\n'
printf '  region      %s\n' "${DIAL_OCI_REGION}"
printf '  compartment %s\n' "${DIAL_OCI_COMPARTMENT:-NOT SET -- export DIAL_OCI_COMPARTMENT=<ocid>}"
printf '  ssh key     %s\n' "${DIAL_SSH_PRIVATE_KEY_FILE:-NOT FOUND}"
printf '  ssh ingress %s\n' "${DIAL_SSH_INGRESS_CIDR}"
printf '  cwd         %s\n' "$PWD"

printf '\nrun artefacts present:\n'
for f in hermes-before.json network.json instance.json hermes-after.json host-certification.json; do
  [[ -f "$f" ]] && printf '  yes  %s\n' "$f" || printf '  no   %s\n' "$f"
done

printf '\nnext: '
if   [[ ! -f hermes-before.json ]]; then printf './00-hermes-fingerprint.sh snapshot hermes-before.json\n\n'
elif [[ ! -f network.json      ]]; then printf './10-network-preflight.sh\n\n'
elif [[ ! -f instance.json     ]]; then printf './20-launch-oracle-admin.sh\n\n'
else printf 'instance launched -- public IP: %s\n\n' "$(jq -r '.public_ip // "unknown"' instance.json 2>/dev/null)"
fi
