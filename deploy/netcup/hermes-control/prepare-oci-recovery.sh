#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

OCI_DIR="$HOME/.oci"
KEY="$OCI_DIR/netcup-hermes-recovery.pem"
PUB="$OCI_DIR/netcup-hermes-recovery_public.pem"
CONFIG="$OCI_DIR/config"
ESTATE=/etc/dial/oracle-estate.env

[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host" >&2; exit 2; }
mkdir -p "$OCI_DIR"; chmod 0700 "$OCI_DIR"

if [[ ! -s "$KEY" ]]; then
  openssl genrsa -out "$KEY" 2048 >/dev/null 2>&1
  chmod 0600 "$KEY"
  openssl rsa -pubout -in "$KEY" -out "$PUB" >/dev/null 2>&1
  chmod 0644 "$PUB"
fi

fingerprint="$(openssl rsa -pubout -outform DER -in "$KEY" 2>/dev/null | openssl md5 -c | awk '{print $2}')"

if [[ ! -f "$CONFIG" ]]; then
  cat >"$CONFIG" <<EOF
[DEFAULT]
user=REPLACE_WITH_DEDICATED_OCI_USER_OCID
fingerprint=REPLACE_AFTER_PUBLIC_KEY_UPLOAD
tenancy=REPLACE_WITH_TENANCY_OCID
region=af-johannesburg-1
key_file=$KEY
EOF
  chmod 0600 "$CONFIG"
fi

sudo install -d -m 0755 /etc/dial
if [[ ! -f "$ESTATE" ]]; then
  sudo tee "$ESTATE" >/dev/null <<'EOF'
# Non-secret OCI instance inventory used by Netcup recovery/GitHub admin.
DIAL_OCI_COMPARTMENT=
VAN_TRADING_CORE_OCID=
VEKL_WORKER_OCID=
ORACLE_ADMIN_OCID=
EOF
  sudo chmod 0600 "$ESTATE"
fi

echo "OCI_RECOVERY_IDENTITY=PREPARED"
echo "public_key=$PUB"
echo "fingerprint=$fingerprint"
echo
echo "OWNER ACTION REQUIRED:"
echo "1. In OCI create/use a dedicated recovery user and upload the public key above."
echo "2. Give its group recovery permissions in the compartment containing the three Oracle VMs."
echo "3. Fill user/tenancy/fingerprint in $CONFIG."
echo "4. Fill compartment + the three instance OCIDs in $ESTATE."
echo "5. Test: oci compute instance list --compartment-id <compartment-ocid>"
