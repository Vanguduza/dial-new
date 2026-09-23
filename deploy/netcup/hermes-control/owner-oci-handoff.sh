#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

MODE="${1:-}"
REF="${2:-}"
ROOT=/usr/local/lib/dial-control
RUNTIME="$ROOT/runtime"

die(){ echo "OWNER_OCI_HANDOFF_REFUSED: $*" >&2; exit 2; }
[[ "$(hostname)" == dial-control ]] || die "wrong host"

valid_ref(){ [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

fetch_exact() {
  local ref="$1" rel="$2" out="$3"
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
    --retry 5 --retry-all-errors --connect-timeout 10 --max-time 60 \
    "https://raw.githubusercontent.com/Vanguduza/dial-new/$ref/$rel" -o "$out"
}

install_runtime() {
  local ref="$1"
  valid_ref "$ref" || die "exact 40-character Git ref required"
  local tmp
  tmp="$(mktemp -d /tmp/dial-oci-handoff.XXXXXX)"
  trap 'rm -rf "$tmp"' RETURN
  install -d -m 0755 "$ROOT" "$RUNTIME"

  local direct=(
    deploy/netcup/hermes-control/github-oidc-control.mjs
    deploy/netcup/hermes-control/configure-wireguard-fabric.sh
    deploy/netcup/hermes-control/rotate-bootstrap-identities.sh
    deploy/netcup/hermes-control/retire-oracle-a1-control-role.sh
    deploy/netcup/hermes-control/prepare-oci-recovery.sh
    deploy/netcup/hermes-control/oci-enroll-oracle-estate.sh
    deploy/netcup/hermes-control/install-housekeeping-final-estate.sh
    deploy/netcup/hermes-control/owner-oci-handoff.sh
  )
  local runtime=(
    deploy/oracle/resource-fabric/zero-touch-enroll-peer.sh
    agent-system/orchestration/state-store.mjs
    agent-system/orchestration/resource-lifecycle-registry.mjs
    agent-system/orchestration/housekeeping-gc.mjs
    agent-system/registries/HOUSEKEEPING_POLICY.json
    deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh
    deploy/oracle/hermes-codex/systemd/dial-housekeeping.service
    deploy/oracle/hermes-codex/systemd/dial-housekeeping.path
    deploy/oracle/hermes-codex/systemd/dial-housekeeping.timer
  )

  for rel in "${direct[@]}" "${runtime[@]}"; do
    install -d -m 0755 "$tmp/$(dirname "$rel")"
    fetch_exact "$ref" "$rel" "$tmp/$rel"
  done

  /home/ubuntu/.local/bin/node --check "$tmp/deploy/netcup/hermes-control/github-oidc-control.mjs"
  for rel in "${direct[@]}"; do
    [[ "$rel" == *.sh ]] && bash -n "$tmp/$rel"
  done
  bash -n "$tmp/deploy/oracle/resource-fabric/zero-touch-enroll-peer.sh"
  bash -n "$tmp/deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh"

  install -m 0755 "$tmp/deploy/netcup/hermes-control/github-oidc-control.mjs" "$ROOT/github-oidc-control.mjs"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/configure-wireguard-fabric.sh" "$ROOT/configure-wireguard-fabric.sh"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/rotate-bootstrap-identities.sh" "$ROOT/rotate-bootstrap-identities.sh"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/retire-oracle-a1-control-role.sh" "$ROOT/retire-oracle-a1-control-role.sh"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/prepare-oci-recovery.sh" "$ROOT/prepare-oci-recovery.sh"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/oci-enroll-oracle-estate.sh" "$ROOT/oci-enroll-oracle-estate.sh"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/install-housekeeping-final-estate.sh" "$ROOT/install-housekeeping-final-estate.sh"
  install -m 0755 "$tmp/deploy/netcup/hermes-control/owner-oci-handoff.sh" "$ROOT/owner-oci-handoff.sh"

  rm -rf "$RUNTIME"
  install -d -m 0755 "$RUNTIME"
  for rel in "${runtime[@]}"; do
    install -d -m 0755 "$RUNTIME/$(dirname "$rel")"
    install -m 0644 "$tmp/$rel" "$RUNTIME/$rel"
  done
  chmod 0755 \
    "$RUNTIME/deploy/oracle/resource-fabric/zero-touch-enroll-peer.sh" \
    "$RUNTIME/deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh"

  printf '%s\n' "$ref" >"$ROOT/runtime-ref"
  chmod 0644 "$ROOT/runtime-ref"
  echo "DIAL_CONTROL_RUNTIME_INSTALLED=GREEN"
  echo "runtime_ref=$ref"
}

case "$MODE" in
  prepare)
    valid_ref "$REF" || die "prepare requires exact Git ref as argument 2"
    install_runtime "$REF"
    runuser -u ubuntu -- env \
      HOME=/home/ubuntu \
      PATH=/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin \
      bash "$ROOT/prepare-oci-recovery.sh" prepare
    systemd-run --unit="dial-github-oidc-refresh-$(date +%s%N)" --on-active=3s \
      /bin/systemctl restart dial-github-oidc-control.service >/dev/null
    echo "DIAL_CONTROL_CONTROLLER_REFRESH=SCHEDULED"
    ;;
  configure-and-discover)
    USER_OCID="${2:-}"
    TENANCY_OCID="${3:-}"
    REGION="${4:-af-johannesburg-1}"
    [[ "$USER_OCID" == ocid1.user.* ]] || die "valid OCI recovery user OCID required"
    [[ "$TENANCY_OCID" == ocid1.tenancy.* ]] || die "valid OCI tenancy OCID required"
    [[ "$REGION" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]] || die "valid OCI region required"
    [[ -x "$ROOT/prepare-oci-recovery.sh" ]] || die "prepare operation has not installed the runtime"
    runuser -u ubuntu -- env \
      HOME=/home/ubuntu \
      PATH=/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin \
      OCI_RECOVERY_USER_OCID="$USER_OCID" \
      OCI_RECOVERY_TENANCY_OCID="$TENANCY_OCID" \
      OCI_RECOVERY_REGION="$REGION" \
      bash "$ROOT/prepare-oci-recovery.sh" configure-and-discover
    runuser -u ubuntu -- env HOME=/home/ubuntu PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin \
      bash "$ROOT/prepare-oci-recovery.sh" status
    echo "OWNER_OCI_HANDOFF=GREEN"
    ;;
  status)
    [[ -x "$ROOT/prepare-oci-recovery.sh" ]] || die "runtime not installed"
    runuser -u ubuntu -- env HOME=/home/ubuntu PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin \
      bash "$ROOT/prepare-oci-recovery.sh" status
    [[ -f "$ROOT/runtime-ref" ]] && echo "runtime_ref=$(cat "$ROOT/runtime-ref")"
    ;;
  *)
    echo "Usage: $0 {prepare <exact-ref>|configure-and-discover <user-ocid> <tenancy-ocid> [region]|status}" >&2
    exit 2
    ;;
esac
