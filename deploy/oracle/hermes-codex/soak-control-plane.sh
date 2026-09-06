#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
EVIDENCE_DIR="$DIAL_CONTROL_HOME/evidence-cache/soak"
MODE="${1:-process}"

fail(){ echo "SOAK RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
warn(){ echo "! $*" >&2; }
now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
stamp(){ date -u +%Y%m%dT%H%M%SZ; }
sha256(){ sha256sum "$1" | awk '{print $1}'; }
boot_id(){ cat /proc/sys/kernel/random/boot_id; }

require_host(){
  [[ -f "$DIAL_REPO_DIR/package.json" ]] || fail "DIAL repository missing at $DIAL_REPO_DIR"
  for cmd in node jq git systemctl sha256sum codex claude hermes; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done
  mkdir -p "$EVIDENCE_DIR"
  chmod 700 "$EVIDENCE_DIR" 2>/dev/null || true
  cd "$DIAL_REPO_DIR"
}

wait_active(){
  local unit="$1" deadline=$((SECONDS + 40))
  until systemctl --user is-active --quiet "$unit"; do
    (( SECONDS >= deadline )) && fail "$unit did not become active"
    sleep 1
  done
}

unit_pid(){ systemctl --user show "$1" -p MainPID --value; }

gateway_unit(){
  if [[ -n "${HERMES_GATEWAY_UNIT:-}" ]]; then printf '%s\n' "$HERMES_GATEWAY_UNIT"; return; fi
  systemctl --user list-unit-files --type=service --no-legend 2>/dev/null \
    | awk 'tolower($1) ~ /hermes.*gateway|gateway.*hermes/ {print $1; exit}'
}

probe_both_and_require_sol(){
  node agent-system/orchestration/claude-code-probe.mjs >/dev/null
  node agent-system/orchestration/codex-app-server-probe.mjs >/dev/null
  local selected
  selected="$(npm run --silent agent:orchestration:select-runtime)"
  jq -e '.selected == true and .selection.runtime == "codex_app_server" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol"' \
    <<<"$selected" >/dev/null || { echo "$selected" >&2; fail "fresh probes did not select Sol"; }
}

kill_and_require_restart(){
  local unit="$1" before after
  wait_active "$unit"
  before="$(unit_pid "$unit")"
  [[ "$before" =~ ^[1-9][0-9]*$ ]] || fail "$unit has no live MainPID"
  systemctl --user kill --kill-who=main --signal=SIGKILL "$unit"
  local deadline=$((SECONDS + 40))
  while true; do
    if systemctl --user is-active --quiet "$unit"; then
      after="$(unit_pid "$unit")"
      if [[ "$after" =~ ^[1-9][0-9]*$ && "$after" != "$before" ]]; then break; fi
    fi
    (( SECONDS >= deadline )) && fail "$unit did not restart with a new MainPID"
    sleep 1
  done
  printf '%s:%s:%s\n' "$unit" "$before" "$after"
}

process_soak(){
  require_host
  local gateway supervisor_restart gateway_restart codex_probe_pid killed_codex_pid probe_rc=0 evidence selected fallback recovery
  gateway="$(gateway_unit)"
  [[ -n "$gateway" ]] || fail "Hermes gateway systemd unit not found; set HERMES_GATEWAY_UNIT if necessary"
  wait_active dial-hermes-runtime.service
  wait_active "$gateway"

  probe_both_and_require_sol
  pass "fresh runtime identity proves Sol preferred before process-death soak"

  local probe_out="$EVIDENCE_DIR/codex-kill-probe-$(stamp).json"
  node agent-system/orchestration/codex-app-server-probe.mjs >"$probe_out" 2>"$probe_out.err" &
  codex_probe_pid=$!
  killed_codex_pid=""
  local deadline=$((SECONDS + 20))
  while (( SECONDS < deadline )); do
    killed_codex_pid="$(pgrep -P "$codex_probe_pid" -f 'codex.*app-server' | head -n1 || true)"
    [[ -n "$killed_codex_pid" ]] && break
    killed_codex_pid="$(pgrep -f 'codex.*app-server.*stdio' | head -n1 || true)"
    [[ -n "$killed_codex_pid" && "$killed_codex_pid" != "$$" ]] && break
    sleep 0.2
  done
  [[ "$killed_codex_pid" =~ ^[1-9][0-9]*$ ]] || { kill "$codex_probe_pid" 2>/dev/null || true; fail "could not identify live Codex App Server process for kill soak"; }
  kill -KILL "$killed_codex_pid"
  wait "$codex_probe_pid" || probe_rc=$?
  [[ "$probe_rc" -ne 0 ]] || fail "Codex probe unexpectedly succeeded after app-server SIGKILL"
  pass "actual Codex App Server SIGKILL produced a failed primary-runtime probe"

  node agent-system/orchestration/supervisor.mjs health \
    --runtime codex_app_server --state PROCESS_FAILED \
    --requested-model gpt-5.6-sol --resolved-model gpt-5.6-sol >/dev/null
  node agent-system/orchestration/claude-code-probe.mjs >/dev/null
  selected="$(npm run --silent agent:orchestration:select-runtime)"
  jq -e '.selected == true and .selection.runtime == "claude_code" and .selection.requested_model == "claude-sonnet-5" and .selection.resolved_model == "claude-sonnet-5"' \
    <<<"$selected" >/dev/null || { echo "$selected" >&2; fail "Codex process death did not select Sonnet fallback"; }
  fallback="$(node agent-system/orchestration/claude-fallback-runner.mjs 'Reply with exactly DIAL_PROCESS_SOAK_SONNET_OK. Do not modify files.')"
  jq -e '.event.identity_proven == true and .event.resolved_model == "claude-sonnet-5" and .event.authority == "HERMES_RUNTIME_ONLY"' \
    <<<"$fallback" >/dev/null || { echo "$fallback" >&2; fail "Sonnet fallback did not execute with proven identity"; }
  pass "Codex process death → official Claude Code / Sonnet 5 fallback is executable"

  node agent-system/orchestration/codex-app-server-probe.mjs >/dev/null
  recovery="$(npm run --silent agent:orchestration:select-runtime)"
  jq -e '.selected == true and .selection.runtime == "codex_app_server" and .selection.resolved_model == "gpt-5.6-sol"' \
    <<<"$recovery" >/dev/null || { echo "$recovery" >&2; fail "Sol did not regain preference after Codex recovery"; }
  pass "Codex recovery → Sol preferred again"

  supervisor_restart="$(kill_and_require_restart dial-hermes-runtime.service)"
  pass "runtime supervisor recovered from SIGKILL"
  gateway_restart="$(kill_and_require_restart "$gateway")"
  pass "Hermes gateway recovered from SIGKILL"

  evidence="$EVIDENCE_DIR/process-$(stamp).json"
  jq -n \
    --arg observed_at "$(now)" \
    --arg boot_id "$(boot_id)" \
    --arg repo_head "$(git rev-parse HEAD)" \
    --arg killed_codex_pid "$killed_codex_pid" \
    --arg supervisor_restart "$supervisor_restart" \
    --arg gateway_restart "$gateway_restart" \
    --arg gateway_unit "$gateway" \
    '{schema_version:1, kind:"DIAL_HERMES_PROCESS_SOAK", status:"GREEN", observed_at:$observed_at, boot_id:$boot_id, repo_head:$repo_head, actual_codex_app_server_sigkill:true, killed_codex_pid:$killed_codex_pid, sonnet_fallback_identity_proven:true, sol_recovery_proven:true, supervisor_restart:$supervisor_restart, hermes_gateway_restart:$gateway_restart, hermes_gateway_unit:$gateway_unit, real_quota_soak:"PENDING"}' \
    >"$evidence"
  chmod 600 "$evidence"
  echo "PROCESS_SOAK=GREEN"
  echo "EVIDENCE=$evidence"
  echo "REAL_QUOTA_SOAK=PENDING"
}

reboot_pre(){
  require_host
  local gateway cp_pointer cp_path cp_snapshot cp_hash memory backup backup_hash marker marker_id feature hot warm cold
  gateway="$(gateway_unit)"
  [[ -n "$gateway" ]] || fail "Hermes gateway systemd unit not found"
  wait_active dial-hermes-runtime.service
  wait_active "$gateway"
  probe_both_and_require_sol

  npm run --silent agent:orchestration:capture >/dev/null
  cp_pointer="$DIAL_CONTROL_HOME/state/active-checkpoint.json"
  [[ -f "$cp_pointer" ]] || fail "active checkpoint pointer missing"
  cp_path="$(jq -r '.path // empty' "$cp_pointer")"
  [[ -n "$cp_path" && -f "$DIAL_CONTROL_HOME/$cp_path" ]] || fail "active checkpoint missing"
  feature="$(jq -r '.feature_id // empty' "$DIAL_CONTROL_HOME/$cp_path")"
  marker_id="$(cat /proc/sys/kernel/random/uuid)"
  cp_snapshot="$EVIDENCE_DIR/reboot-checkpoint-$marker_id.json"
  cp "$DIAL_CONTROL_HOME/$cp_path" "$cp_snapshot"
  chmod 600 "$cp_snapshot"
  cp_hash="$(sha256 "$cp_snapshot")"

  memory="$(node agent-system/orchestration/memory-maintenance.mjs)"
  backup="$(jq -r '.hermes_session_backup.target // empty' <<<"$memory")"
  [[ -n "$backup" && -f "$backup" ]] || { echo "$memory" >&2; fail "transaction-consistent Hermes state.db backup missing"; }
  backup_hash="$(sha256 "$backup")"

  hot="$DIAL_CONTROL_HOME/memory/hot/reboot-$marker_id.sentinel"
  warm="$DIAL_CONTROL_HOME/memory/warm/reboot-$marker_id.sentinel"
  cold="$DIAL_CONTROL_HOME/memory/cold/reboot-$marker_id.sentinel"
  printf '%s\n' "$marker_id" >"$hot"; printf '%s\n' "$marker_id" >"$warm"; printf '%s\n' "$marker_id" >"$cold"
  chmod 600 "$hot" "$warm" "$cold"

  marker="$EVIDENCE_DIR/reboot-pending.json"
  jq -n \
    --arg marker_id "$marker_id" \
    --arg prepared_at "$(now)" \
    --arg boot_id "$(boot_id)" \
    --arg repo_head "$(git rev-parse HEAD)" \
    --arg feature_id "$feature" \
    --arg checkpoint_snapshot "$cp_snapshot" \
    --arg checkpoint_sha256 "$cp_hash" \
    --arg hermes_backup "$backup" \
    --arg hermes_backup_sha256 "$backup_hash" \
    --arg hot "$hot" --arg warm "$warm" --arg cold "$cold" \
    '{schema_version:1, kind:"DIAL_HERMES_REBOOT_SOAK_PENDING", marker_id:$marker_id, prepared_at:$prepared_at, pre_boot_id:$boot_id, repo_head:$repo_head, feature_id:($feature_id|select(length>0)), checkpoint_snapshot:$checkpoint_snapshot, checkpoint_sha256:$checkpoint_sha256, hermes_state_backup:$hermes_backup, hermes_state_backup_sha256:$hermes_backup_sha256, sentinels:{hot:$hot,warm:$warm,cold:$cold}, real_quota_soak:"PENDING"}' \
    >"$marker"
  chmod 600 "$marker"

  echo "REBOOT_PRE=GREEN"
  echo "MARKER=$marker"
  echo "Now perform an actual host reboot: sudo reboot"
  echo "After reconnecting run: bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-post"
}

reboot_post(){
  require_host
  local marker pre_boot post_boot gateway cp_snapshot cp_hash backup backup_hash hot warm cold feature repo_head active_pointer active_path active_feature evidence
  marker="$EVIDENCE_DIR/reboot-pending.json"
  [[ -f "$marker" ]] || fail "reboot-pending.json missing; run reboot-pre before rebooting"
  pre_boot="$(jq -r '.pre_boot_id' "$marker")"
  post_boot="$(boot_id)"
  [[ -n "$pre_boot" && "$pre_boot" != "$post_boot" ]] || fail "boot ID did not change; an actual reboot has not been proven"
  pass "actual Oracle reboot proven by boot ID change"

  gateway="$(gateway_unit)"
  [[ -n "$gateway" ]] || fail "Hermes gateway systemd unit not found after reboot"
  wait_active dial-hermes-runtime.service
  wait_active "$gateway"
  pass "persistent runtime services active after reboot"

  repo_head="$(jq -r '.repo_head' "$marker")"
  [[ "$(git rev-parse HEAD)" == "$repo_head" ]] || fail "repository HEAD changed across reboot soak"

  cp_snapshot="$(jq -r '.checkpoint_snapshot' "$marker")"
  cp_hash="$(jq -r '.checkpoint_sha256' "$marker")"
  [[ -f "$cp_snapshot" && "$(sha256 "$cp_snapshot")" == "$cp_hash" ]] || fail "immutable checkpoint evidence did not survive reboot"

  backup="$(jq -r '.hermes_state_backup' "$marker")"
  backup_hash="$(jq -r '.hermes_state_backup_sha256' "$marker")"
  [[ -f "$backup" && "$(sha256 "$backup")" == "$backup_hash" ]] || fail "Hermes state.db backup did not survive reboot"

  hot="$(jq -r '.sentinels.hot' "$marker")"; warm="$(jq -r '.sentinels.warm' "$marker")"; cold="$(jq -r '.sentinels.cold' "$marker")"
  for sentinel in "$hot" "$warm" "$cold"; do [[ -f "$sentinel" ]] || fail "memory sentinel missing after reboot: $sentinel"; done
  pass "HOT/WARM/COLD persistence survived reboot"

  feature="$(jq -r '.feature_id // empty' "$marker")"
  active_pointer="$DIAL_CONTROL_HOME/state/active-checkpoint.json"
  [[ -f "$active_pointer" ]] || fail "active checkpoint pointer missing after reboot"
  active_path="$(jq -r '.path // empty' "$active_pointer")"
  [[ -n "$active_path" && -f "$DIAL_CONTROL_HOME/$active_path" ]] || fail "active checkpoint missing after reboot"
  active_feature="$(jq -r '.feature_id // empty' "$DIAL_CONTROL_HOME/$active_path")"
  if [[ -n "$feature" && "$active_feature" != "$feature" ]]; then fail "active Feature changed across reboot: expected $feature, got $active_feature"; fi
  pass "checkpoint continuity survived reboot"

  probe_both_and_require_sol
  pass "fresh post-reboot probes restore Sol as preferred Hermes runtime"

  evidence="$EVIDENCE_DIR/reboot-$(stamp).json"
  jq -n \
    --arg observed_at "$(now)" \
    --arg pre_boot_id "$pre_boot" \
    --arg post_boot_id "$post_boot" \
    --arg repo_head "$repo_head" \
    --arg feature_id "$feature" \
    --arg checkpoint_snapshot "$cp_snapshot" \
    --arg hermes_backup "$backup" \
    '{schema_version:1, kind:"DIAL_HERMES_REBOOT_SOAK", status:"GREEN", observed_at:$observed_at, actual_reboot_proven:true, pre_boot_id:$pre_boot_id, post_boot_id:$post_boot_id, repo_head:$repo_head, feature_id:($feature_id|select(length>0)), checkpoint_snapshot:$checkpoint_snapshot, hermes_state_backup:$hermes_backup, hot_warm_cold_survived:true, services_recovered:true, sol_preference_recovered:true, real_quota_soak:"PENDING"}' \
    >"$evidence"
  chmod 600 "$evidence"
  rm -f "$hot" "$warm" "$cold" "$marker"

  echo "REBOOT_SOAK=GREEN"
  echo "EVIDENCE=$evidence"
  echo "REAL_QUOTA_SOAK=PENDING"
}

case "$MODE" in
  process) process_soak ;;
  reboot-pre) reboot_pre ;;
  reboot-post) reboot_post ;;
  *) fail "usage: $0 {process|reboot-pre|reboot-post}" ;;
esac
