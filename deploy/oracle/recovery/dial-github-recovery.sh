#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-}"
HOST="$(hostname)"
ADMIN_USER="${DIAL_ADMIN_USER:-ubuntu}"
UID_NUM="$(id -u "$ADMIN_USER" 2>/dev/null || true)"
RUNTIME="/run/user/$UID_NUM"

case "$HOST" in
  dial-hermes-control|vekl-worker|oracle-admin) ;;
  *) echo "REFUSE: unsupported DIAL recovery host $HOST" >&2; exit 3 ;;
esac

userctl() {
  [[ -n "$UID_NUM" ]] || { echo "ubuntu user missing" >&2; return 1; }
  loginctl enable-linger "$ADMIN_USER" >/dev/null 2>&1 || true
  systemctl start "user@${UID_NUM}.service" >/dev/null 2>&1 || true
  runuser -u "$ADMIN_USER" -- env     HOME="/home/$ADMIN_USER"     XDG_RUNTIME_DIR="$RUNTIME"     DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME/bus"     systemctl --user "$@"
}

userjournal() {
  runuser -u "$ADMIN_USER" -- env     HOME="/home/$ADMIN_USER"     XDG_RUNTIME_DIR="$RUNTIME"     DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME/bus"     journalctl --user "$@"
}

active_or_absent() {
  local unit="$1"
  if userctl cat "$unit" >/dev/null 2>&1; then
    printf '%s=' "$unit"
    userctl is-active "$unit" 2>/dev/null || true
  else
    echo "$unit=ABSENT"
  fi
}

restart_if_present() {
  local unit="$1"
  if userctl cat "$unit" >/dev/null 2>&1; then
    userctl reset-failed "$unit" >/dev/null 2>&1 || true
    userctl restart "$unit"
    userctl is-active --quiet "$unit"
    echo "$unit=ACTIVE"
  else
    echo "$unit=ABSENT"
  fi
}

probe() {
  echo "RECOVERY_HOST=$HOST"
  echo "RECOVERY_ACTION=probe"
  date -u '+OBSERVED_AT=%Y-%m-%dT%H:%M:%SZ'
  uptime
  free -m
  df -h /
  systemctl is-active ssh.service 2>/dev/null || systemctl is-active sshd.service 2>/dev/null || true
  systemctl is-active oracle-cloud-agent.service 2>/dev/null ||     systemctl is-active snap.oracle-cloud-agent.oracle-cloud-agent.service 2>/dev/null || true

  case "$HOST" in
    dial-hermes-control)
      for u in dial-hermes-runtime.service dial-hermes-orchestrator.service dial-chat-control.service                dial-owner-steering.service dial-remote-mcp-relay.service dial-private-mcp-bind.service                dial-owner-commander-remote.service; do
        active_or_absent "$u"
      done
      ;;
    vekl-worker)
      for u in dial-background-coordinator.service dial-worker-agent.timer dial-structural-snapshot.timer; do
        active_or_absent "$u"
      done
      ;;
    oracle-admin)
      for u in dial-commander-remote.service dial-recovery-agent.service dial-host-agent.timer; do
        active_or_absent "$u"
      done
      ;;
  esac
}

collect_diagnostics() {
  probe
  echo "=== recent kernel pressure ==="
  dmesg --ctime 2>/dev/null | tail -n 40 || true
  echo "=== failed system units ==="
  systemctl --failed --no-pager || true
  echo "=== failed user units ==="
  userctl --failed --no-pager || true
  case "$HOST" in
    dial-hermes-control)
      for u in dial-owner-commander-remote.service dial-hermes-runtime.service dial-chat-control.service dial-remote-mcp-relay.service; do
        userjournal -u "$u" -n 30 --no-pager 2>/dev/null || true
      done
      ;;
    oracle-admin)
      userjournal -u dial-commander-remote.service -n 40 --no-pager 2>/dev/null || true
      ;;
  esac
}

case "$ACTION" in
  probe)
    probe
    ;;
  collect_diagnostics)
    collect_diagnostics
    ;;
  restart_owner_commander)
    [[ "$HOST" == "dial-hermes-control" ]] || { echo "REFUSE: restart_owner_commander belongs on dial-hermes-control" >&2; exit 4; }
    restart_if_present dial-owner-commander-remote.service
    ;;
  restart_hermes_control)
    [[ "$HOST" == "dial-hermes-control" ]] || { echo "REFUSE: restart_hermes_control belongs on dial-hermes-control" >&2; exit 4; }
    for u in dial-chat-control.service dial-owner-steering.service dial-hermes-orchestrator.service dial-hermes-runtime.service; do
      restart_if_present "$u"
    done
    ;;
  restart_cloudflare_ingress)
    [[ "$HOST" == "dial-hermes-control" ]] || { echo "REFUSE: restart_cloudflare_ingress belongs on dial-hermes-control" >&2; exit 4; }
    found=0
    for u in dial-remote-mcp-tunnel.service cloudflared.service; do
      if userctl cat "$u" >/dev/null 2>&1; then
        found=1
        restart_if_present "$u"
      fi
    done
    [[ "$found" -eq 1 ]] || { echo "NO_APPROVED_CLOUDFLARE_UNIT_FOUND" >&2; exit 5; }
    restart_if_present dial-remote-mcp-relay.service
    ;;
  mark_chatgpt_sessions_stale)
    [[ "$HOST" == "dial-hermes-control" ]] || { echo "REFUSE: ChatGPT session registry belongs on dial-hermes-control" >&2; exit 4; }
    REPO="${DIAL_REPO_DIR:-/opt/dial/dial-new}"
    [[ -f "$REPO/agent-system/orchestration/chatgpt-session-registry.mjs" ]] || REPO="/home/ubuntu/dial-new"
    [[ -f "$REPO/agent-system/orchestration/chatgpt-session-registry.mjs" ]] || { echo "session registry not found" >&2; exit 6; }
    runuser -u "$ADMIN_USER" -- env DIAL_CONTROL_HOME=/var/lib/dial-control DIAL_REPO_DIR="$REPO"       node "$REPO/agent-system/orchestration/chatgpt-session-registry.mjs" mark-stale
    ;;
  restart_vekl_coordinator)
    [[ "$HOST" == "vekl-worker" ]] || { echo "REFUSE: restart_vekl_coordinator belongs on vekl-worker" >&2; exit 4; }
    restart_if_present dial-background-coordinator.service
    userctl restart dial-worker-agent.timer 2>/dev/null || true
    userctl restart dial-structural-snapshot.timer 2>/dev/null || true
    ;;
  enable_oracle_admin_commander)
    [[ "$HOST" == "oracle-admin" ]] || { echo "REFUSE: emergency admin Commander belongs on oracle-admin" >&2; exit 4; }
    userctl enable dial-commander-remote.service >/dev/null
    restart_if_present dial-commander-remote.service
    ;;
  *)
    echo "REFUSE: unsupported recovery action. Allowed: probe collect_diagnostics restart_owner_commander restart_hermes_control restart_cloudflare_ingress mark_chatgpt_sessions_stale restart_vekl_coordinator enable_oracle_admin_commander" >&2
    exit 2
    ;;
esac
