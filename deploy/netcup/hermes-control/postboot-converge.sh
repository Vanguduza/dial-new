#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

MODE="${1:---status}"
REPO="${DIAL_REPO_DIR:-$HOME/dial-new}"
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
[[ "$(hostname)" == dial-control ]] || { echo "REFUSE: wrong host $(hostname)" >&2; exit 2; }
[[ -f "$REPO/ops/development-bootstrap/bootstrap.mjs" ]] || { echo "repo missing at $REPO" >&2; exit 2; }
node "$REPO/ops/development-bootstrap/rev5.1/verify-bootstrap-policy.mjs" "$MODE" >/var/lib/dial-control/bootstrap/rev5.1-postboot-policy.json

status(){
  echo "host=$(hostname)"
  echo "repo=$(git -C "$REPO" rev-parse HEAD)"
  echo "commander=$(systemctl --user is-active dial-owner-commander-remote.service 2>/dev/null || true)"
  echo "codex=$(codex login status 2>&1 || true)"
  echo "claude=$(claude auth status 2>&1 | head -3 || true)"
  echo "oci=$(oci --version 2>/dev/null || true)"
  echo "oci_config=$([[ -s $HOME/.oci/config ]] && echo PRESENT || echo MISSING)"
  echo "github_admin_runner=$(sudo systemctl list-units --type=service --all 2>/dev/null | grep -m1 'actions.runner.*dial-control-admin' || true)"
  echo "github_admin_wrapper=$([[ -x /usr/local/sbin/dial-github-admin ]] && echo PRESENT || echo MISSING)"
  echo "wg=$(sudo wg show 2>/dev/null | head -20 || true)"
}

case "$MODE" in
  --status)
    status
    ;;
  --auth)
    echo "Run the canonical owner auth workflow first:"
    exec "$REPO/ops/development-bootstrap/bootstrap.sh" --auth --role dial-hermes-control
    ;;
  --activate)
    [[ -s "$CONTROL/github-oidc/READY" ]] || { echo "GitHub OIDC control is not ready" >&2; exit 3; }
    if [[ ! -s "$HOME/.oci/config" && ! -s "$CONTROL/github-oidc/github-oci-ready" ]]; then
      echo "Neither local OCI recovery identity nor GitHub OCI recovery plane is ready." >&2
      exit 3
    fi
    codex login status 2>&1 | grep -q 'Logged in using ChatGPT' || { echo "Migrated Codex/ChatGPT session is not valid yet." >&2; exit 3; }
    claude auth status >/dev/null 2>&1 || { echo "Migrated Claude session is not valid yet." >&2; exit 3; }
    if [[ ! -s "$HOME/.desktop-commander-device/device.json" ]]; then
      echo "COMMANDER_OWNER_DEVICE=DEGRADED_GITHUB_OIDC_FALLBACK"
    fi

    export DIAL_CONTROL_OVERLAY_IP="${DIAL_CONTROL_OVERLAY_IP:-}"
    export DIAL_PRIVATE_MCP_BIND="${DIAL_PRIVATE_MCP_BIND:-$DIAL_CONTROL_OVERLAY_IP}"
    export DIAL_PRIVATE_MCP_HEALTH="${DIAL_PRIVATE_MCP_HEALTH:-${DIAL_CONTROL_OVERLAY_IP:+http://$DIAL_CONTROL_OVERLAY_IP:9133/health}}"
    [[ -n "$DIAL_CONTROL_OVERLAY_IP" ]] || { echo "DIAL_CONTROL_OVERLAY_IP required after WireGuard is configured" >&2; exit 3; }

    "$REPO/ops/development-bootstrap/bootstrap.sh" --repair --role dial-hermes-control --profile CORE_DEVELOPMENT
    bash "$REPO/deploy/oracle/hermes-codex/install-control-plane.sh"
    bash "$REPO/deploy/oracle/hermes-codex/install-owner-remote-commander.sh"
    bash "$REPO/deploy/oracle/hermes-codex/install-shared-project-memory-fabric.sh"
    if [[ -s "$CONTROL/secrets/xkiro-api.key" ]]; then
      DIAL_REPO_DIR="$REPO" bash "$REPO/deploy/oracle/hermes-codex/install-haif.sh"
    fi
    if [[ -s "$HOME/.desktop-commander-device/device.json" ]]; then
      systemctl --user enable --now dial-owner-commander-remote.service >/dev/null 2>&1 || true
    fi
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 && [[ ! -x /usr/local/sbin/dial-github-admin ]]; then
      bash "$REPO/deploy/netcup/hermes-control/install-github-admin-runner.sh" || true
    fi

    # VAN / Trading Core is a subordinate machine, never a peer authority.
    if [[ -d "$HOME/Van/.git" ]]; then
      VAN_REPO="$HOME/Van" DIAL_REPO="$REPO" bash "$HOME/Van/deploy/van-trading-core/hermes/install-full-commander-transport.sh" || true
      VAN_REPO="$HOME/Van" DIAL_REPO="$REPO" bash "$HOME/Van/deploy/van-trading-core/hermes/register-full-desktop-commander-mcp.sh" || true
      VAN_REPO="$HOME/Van" DIAL_REPO="$REPO" bash "$HOME/Van/deploy/van-trading-core/hermes/qualify-full-desktop-commander-mcp.sh" || true
      bash "$REPO/deploy/oracle/hermes-codex/install-trading-memory-peer.sh" || true
    fi

    bash "$REPO/deploy/oracle/hermes-codex/qualify-hermes-local-mcp-plane.sh"
    "$REPO/ops/development-bootstrap/bootstrap.sh" --verify --role dial-hermes-control --profile CORE_DEVELOPMENT
    echo "NETCUP_CONTROL_ACTIVATION=COMPLETE"
    echo "OLD_ORACLE_CONTROL_RETIREMENT=STILL_BLOCKED_UNTIL_MIGRATION_AND_RECOVERY_PROOFS_PASS"
    echo "REQUIRED_RETIREMENT_PROOFS=GITHUB_OIDC_ADMIN,DIAL_MCP,SSH,OCI_API_RUN_COMMAND,RECIPROCAL_RECOVERY"
    echo "COMMANDER_PROOF=REQUIRED_IF_MIGRATED_DEVICE_SESSION_IS_VALID;OTHERWISE_GITHUB_OIDC_REMAINS_OWNER_ADMIN_FALLBACK"
    echo "REV51_BUILD_READY=false"
    echo "REV51_NEW_EXTERNAL_TOOLS=QUALIFICATION_GATED"
    echo "REV51_GAP_CLOSURE=IDENTIFIED_GAP_MUST_BE_COVERED"
    echo "REV51_CONDITIONAL_REQUIRED=ORCA,PULLFROG"
    echo "REV51_GAP_TRIGGERED=GRAPHITI,RESTLER"
    ;;
  *)
    echo "usage: $0 --status|--auth|--activate" >&2
    exit 2
    ;;
esac
