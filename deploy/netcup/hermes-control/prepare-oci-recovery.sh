#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

MODE="${1:-prepare}"
OCI_DIR="$HOME/.oci"
KEY="$OCI_DIR/netcup-hermes-recovery.pem"
PUB="$OCI_DIR/netcup-hermes-recovery_public.pem"
CONFIG="$OCI_DIR/config"
ESTATE="${DIAL_OCI_ESTATE_FILE:-/etc/dial/oracle-estate.env}"
READY_MARKER="${DIAL_OCI_READY_MARKER:-/var/lib/dial-control/github-oidc/github-oci-ready}"
REGION="${OCI_RECOVERY_REGION:-af-johannesburg-1}"

[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }

config_value() {
  local name="$1"
  [[ -f "$CONFIG" ]] || return 0
  awk -F= -v key="$name" '$1 == key {sub(/^[^=]*=/,""); print; exit}' "$CONFIG"
}

ensure_key() {
  mkdir -p "$OCI_DIR"
  chmod 0700 "$OCI_DIR"
  if [[ ! -s "$KEY" ]]; then
    openssl genrsa -out "$KEY" 2048 >/dev/null 2>&1
    chmod 0600 "$KEY"
    openssl rsa -pubout -in "$KEY" -out "$PUB" >/dev/null 2>&1
    chmod 0644 "$PUB"
  elif [[ ! -s "$PUB" ]]; then
    openssl rsa -pubout -in "$KEY" -out "$PUB" >/dev/null 2>&1
    chmod 0644 "$PUB"
  fi
}

fingerprint() {
  openssl rsa -pubout -outform DER -in "$KEY" 2>/dev/null | openssl md5 -c | awk '{print $2}'
}

write_config() {
  local user="${OCI_RECOVERY_USER_OCID:-$(config_value user)}"
  local tenancy="${OCI_RECOVERY_TENANCY_OCID:-$(config_value tenancy)}"
  [[ -n "$user" && "$user" != REPLACE_* ]] || user=REPLACE_WITH_DEDICATED_OCI_USER_OCID
  [[ -n "$tenancy" && "$tenancy" != REPLACE_* ]] || tenancy=REPLACE_WITH_TENANCY_OCID
  cat >"$CONFIG" <<EOF
[DEFAULT]
user=$user
fingerprint=$(fingerprint)
tenancy=$tenancy
region=$REGION
key_file=$KEY
EOF
  chmod 0600 "$CONFIG"
}

config_ready() {
  local user tenancy fp
  user="$(config_value user)"
  tenancy="$(config_value tenancy)"
  fp="$(config_value fingerprint)"
  [[ "$user" == ocid1.user.* ]] &&
    [[ "$tenancy" == ocid1.tenancy.* ]] &&
    [[ -n "$fp" ]] &&
    [[ -s "$KEY" ]]
}

inventory_ready() {
  # The inventory is root-only (0600) and this script runs as the admin user.
  sudo test -s "$ESTATE" || return 1
  sudo grep -Eq '^DIAL_OCI_COMPARTMENT=ocid1\.(compartment|tenancy)\.' "$ESTATE" &&
    sudo grep -q '^ORACLE_ADMIN_OCID=ocid1\.instance\.' "$ESTATE" &&
    sudo grep -q '^VEKL_WORKER_OCID=ocid1\.instance\.' "$ESTATE" &&
    sudo grep -q '^VAN_TRADING_CORE_OCID=ocid1\.instance\.' "$ESTATE"
}

prepare() {
  ensure_key
  write_config
  sudo install -d -m 0755 /etc/dial
  if [[ ! -f "$ESTATE" ]]; then
    sudo tee "$ESTATE" >/dev/null <<'EOF'
# Non-secret OCI instance inventory used by Netcup recovery/GitHub admin.
# The A1 is one physical transition peer: old DIAL control during migration,
# then VAN/VATI host after cutover. There is intentionally no fourth old-control OCID.
DIAL_OCI_COMPARTMENT=
VAN_TRADING_CORE_OCID=
VEKL_WORKER_OCID=
ORACLE_ADMIN_OCID=
EOF
    sudo chmod 0600 "$ESTATE"
  fi
  echo "OCI_RECOVERY_IDENTITY=PREPARED"
  echo "public_key_begin"
  cat "$PUB"
  echo "public_key_end"
  echo "fingerprint=$(fingerprint)"
  if config_ready; then
    echo "OCI_RECOVERY_CONFIG=READY"
  else
    echo "OCI_RECOVERY_CONFIG=OWNER_ACTION_REQUIRED"
  fi
}

# discover_instance <logical> <shape> <pin-ocid-or-empty> <display-name>...
# A pinned OCID is the owner's choice when more than one instance carries the expected names.
discover_instance() {
  local logical="$1" expected_shape="$2" pin="$3"
  shift 3
  local tmp
  tmp="$(mktemp)"
  for compartment in "${COMPARTMENTS[@]}"; do
    for display_name in "$@"; do
      oci compute instance list \
        --compartment-id "$compartment" \
        --display-name "$display_name" \
        --all \
        --output json 2>/dev/null |
        jq -r '.data[] | select(."lifecycle-state" != "TERMINATED") | [.id, ."compartment-id", ."display-name", .shape, ."lifecycle-state", ."time-created"] | @tsv' >>"$tmp" || true
    done
  done
  sort -u "$tmp" -o "$tmp"
  if [[ -n "$pin" ]]; then
    awk -F'\t' -v pin="$pin" '$1 == pin' "$tmp" >"$tmp.pin"
    mv "$tmp.pin" "$tmp"
    [[ -s "$tmp" ]] || {
      echo "REFUSE: pinned $logical OCID $pin is not a non-terminated $expected_shape instance with the expected names" >&2
      rm -f "$tmp"
      return 25
    }
  fi
  local count
  count="$(awk 'NF {n++} END {print n+0}' "$tmp")"
  [[ "$count" -eq 1 ]] || {
    echo "REFUSE: expected exactly one $logical OCI instance across accessible compartments; found $count" >&2
    # Non-secret identifiers, so the owner can choose which one is authoritative.
    awk -F'\t' -v l="$logical" 'NF {printf "CANDIDATE %s ocid=%s name=%s shape=%s state=%s created=%s\n", l, $1, $3, $4, $5, $6}' "$tmp" >&2
    rm -f "$tmp"
    return 20
  }
  local id compartment display shape
  IFS=$'\t' read -r id compartment display shape _ <"$tmp"
  rm -f "$tmp"
  # An instance in the root compartment reports the tenancy OCID as its compartment.
  [[ "$id" == ocid1.instance.* && ( "$compartment" == ocid1.compartment.* || "$compartment" == ocid1.tenancy.* ) ]] || {
    echo "REFUSE: invalid OCI identity returned for $logical" >&2
    return 21
  }
  [[ "$shape" == "$expected_shape" ]] || {
    echo "REFUSE: $logical resolved to unexpected shape $shape; expected $expected_shape" >&2
    return 22
  }
  printf '%s\t%s\t%s\t%s\n' "$id" "$compartment" "$display" "$shape"
}

discover() {
  ensure_key
  # Session mode: oci-edge-login.sh runs discovery once with the owner's short-lived browser
  # session (auth selected through OCI_CLI_* in the environment) so the recovery policy can be
  # scoped to the estate compartment before the durable key exists. It writes the inventory
  # only; the recovery-ready marker is reserved for the durable dedicated-user key below.
  local session_mode=false tenancy
  if [[ "${OCI_RECOVERY_DISCOVERY_AUTH:-}" == session ]]; then
    session_mode=true
    [[ "${OCI_CLI_AUTH:-}" == security_token && -n "${OCI_CLI_CONFIG_FILE:-}" ]] || {
      echo "REFUSE: session discovery requires OCI_CLI_AUTH=security_token and OCI_CLI_CONFIG_FILE" >&2
      exit 10
    }
    tenancy="${OCI_RECOVERY_TENANCY_OCID:-}"
    [[ "$tenancy" == ocid1.tenancy.* ]] || { echo "REFUSE: OCI_RECOVERY_TENANCY_OCID required" >&2; exit 10; }
  else
    config_ready || {
      echo "REFUSE: OCI recovery config needs dedicated user and tenancy OCIDs before discovery" >&2
      exit 10
    }
    tenancy="$(config_value tenancy)"
  fi
  command -v oci >/dev/null 2>&1 || { echo "REFUSE: OCI CLI missing" >&2; exit 11; }
  command -v jq >/dev/null 2>&1 || { echo "REFUSE: jq missing" >&2; exit 11; }

  oci iam region list >/dev/null

  mapfile -t COMPARTMENTS < <(
    {
      printf '%s\n' "$tenancy"
      oci iam compartment list \
        --compartment-id "$tenancy" \
        --compartment-id-in-subtree true \
        --access-level ACCESSIBLE \
        --all \
        --output json |
        jq -r '.data[].id'
    } | awk 'NF && !seen[$0]++'
  )
  [[ "${#COMPARTMENTS[@]}" -ge 1 ]] || { echo "REFUSE: no OCI compartments visible" >&2; exit 12; }

  local admin vekl a1
  admin="$(discover_instance oracle-admin VM.Standard.E2.1.Micro "" "${OCI_DISPLAY_ORACLE_ADMIN:-oracle-admin}")"
  vekl="$(discover_instance vekl-worker VM.Standard.E2.1.Micro "" "${OCI_DISPLAY_VEKL_WORKER:-vekl-worker}")"
  a1="$(discover_instance a1-transition VM.Standard.A1.Flex "${OCI_A1_TRANSITION_OCID:-}" \
    "${OCI_DISPLAY_A1_PRIMARY:-dial-hermes-control}" \
    "${OCI_DISPLAY_A1_FINAL:-van-trading-core}")"

  local admin_id admin_comp vekl_id vekl_comp a1_id a1_comp
  IFS=$'\t' read -r admin_id admin_comp _ _ <<<"$admin"
  IFS=$'\t' read -r vekl_id vekl_comp _ _ <<<"$vekl"
  IFS=$'\t' read -r a1_id a1_comp _ _ <<<"$a1"

  [[ "$admin_id" != "$vekl_id" && "$admin_id" != "$a1_id" && "$vekl_id" != "$a1_id" ]] || {
    echo "REFUSE: Oracle physical instance identities are not unique" >&2
    exit 23
  }
  [[ "$admin_comp" == "$vekl_comp" && "$admin_comp" == "$a1_comp" ]] || {
    echo "REFUSE: Oracle recovery targets span multiple compartments; bounded recovery expects one compartment" >&2
    exit 24
  }

  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
# Auto-discovered non-secret OCI inventory.
# A1 remains one physical transition peer; DIAL does not create a fourth old-control target.
DIAL_OCI_COMPARTMENT=$admin_comp
VAN_TRADING_CORE_OCID=$a1_id
VEKL_WORKER_OCID=$vekl_id
ORACLE_ADMIN_OCID=$admin_id
EOF
  sudo install -m 0600 "$tmp" "$ESTATE"
  rm -f "$tmp"

  if [[ "$session_mode" == true ]]; then
    echo "OCI_RECOVERY_DISCOVERY=INVENTORY_ONLY"
    echo "estate_file=$ESTATE"
    return 0
  fi

  sudo install -d -m 0700 "$(dirname "$READY_MARKER")"
  printf '%s\n' "$(date -u +%FT%TZ)" | sudo tee "$READY_MARKER" >/dev/null
  sudo chmod 0600 "$READY_MARKER"

  echo "OCI_RECOVERY_DISCOVERY=GREEN"
  echo "oracle_targets=3"
  echo "a1_physical_targets=1"
  echo "estate_file=$ESTATE"
}

status() {
  ensure_key
  echo "OCI_RECOVERY_KEY_PRESENT=true"
  if config_ready; then echo "OCI_RECOVERY_CONFIG=READY"; else echo "OCI_RECOVERY_CONFIG=OWNER_ACTION_REQUIRED"; fi
  if inventory_ready; then echo "OCI_RECOVERY_INVENTORY=READY"; else echo "OCI_RECOVERY_INVENTORY=NOT_READY"; fi
}

case "$MODE" in
  prepare)
    prepare
    ;;
  configure)
    ensure_key
    [[ "${OCI_RECOVERY_USER_OCID:-}" == ocid1.user.* ]] || { echo "REFUSE: OCI_RECOVERY_USER_OCID required" >&2; exit 13; }
    [[ "${OCI_RECOVERY_TENANCY_OCID:-}" == ocid1.tenancy.* ]] || { echo "REFUSE: OCI_RECOVERY_TENANCY_OCID required" >&2; exit 13; }
    write_config
    echo "OCI_RECOVERY_CONFIG=READY"
    ;;
  discover)
    discover
    ;;
  configure-and-discover)
    ensure_key
    [[ "${OCI_RECOVERY_USER_OCID:-}" == ocid1.user.* ]] || { echo "REFUSE: OCI_RECOVERY_USER_OCID required" >&2; exit 13; }
    [[ "${OCI_RECOVERY_TENANCY_OCID:-}" == ocid1.tenancy.* ]] || { echo "REFUSE: OCI_RECOVERY_TENANCY_OCID required" >&2; exit 13; }
    write_config
    discover
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 {prepare|configure|discover|configure-and-discover|status}" >&2
    exit 2
    ;;
esac
