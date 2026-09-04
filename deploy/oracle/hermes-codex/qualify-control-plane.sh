#!/usr/bin/env bash
set -euo pipefail
umask 077
DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
QUAL_DIR="$DIAL_CONTROL_HOME/evidence-cache/qualification"
export DIAL_REPO_DIR DIAL_CONTROL_HOME
fail(){ echo "QUALIFICATION RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
warn(){ echo "! $*" >&2; }
section(){ echo; echo "=== $* ==="; }
TMP_FILES=(); cleanup(){ for file in "${TMP_FILES[@]:-}"; do [[ -n "$file" ]] && rm -f "$file"; done; }; trap cleanup EXIT
tmp(){ local file; file="$(mktemp)"; TMP_FILES+=("$file"); printf '%s' "$file"; }
stamp(){ date -u +%Y%m%dT%H%M%SZ; }
now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
cd "$DIAL_REPO_DIR"
mkdir -p "$QUAL_DIR"; chmod 700 "$QUAL_DIR" 2>/dev/null || true
HEAD_SHA="$(git rev-parse HEAD)"
ARCH="$(uname -m)"; [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]] || fail "Oracle qualification host must be ARM64; detected $ARCH"; pass "Oracle host architecture is ARM64 ($ARCH)"
[[ -f package-lock.json ]] || fail "package-lock.json missing"
[[ -x "$HOME/.hermes/agent-hooks/dial-pre-turn-context.sh" ]] || fail "pre-turn hook not installed"
[[ -x "$HOME/.hermes/agent-hooks/dial-post-turn-checkpoint.sh" ]] || fail "post-turn hook not installed"
[[ -x "$HOME/.local/bin/dial-hermes" ]] || fail "dial-hermes operational runtime entrypoint is not installed"
[[ -x "$HOME/.local/bin/dial-hermes-submit" ]] || fail "dial-hermes-submit is not installed; run install-external-orchestrator.sh"
[[ -x "$HOME/.local/bin/dial-hermes-job" ]] || fail "dial-hermes-job is not installed; run install-external-orchestrator.sh"
if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" ]]; then fail "OPENAI_API_KEY/CODEX_API_KEY is present; Hermes primary qualification requires ChatGPT subscription OAuth"; fi
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then fail "ANTHROPIC_API_KEY is present; Hermes fallback qualification requires Claude subscription authentication"; fi
codex_status="$(codex login status 2>&1 || true)"; [[ "$codex_status" == *"Logged in using ChatGPT"* ]] || fail "Codex is not using ChatGPT OAuth: $codex_status"; pass "Codex CLI uses ChatGPT subscription OAuth"
claude auth status >/dev/null 2>&1 || fail "Claude Code is not authenticated through the supported subscription route"; pass "Claude Code subscription authentication is present"

python3 - "$HOME/.hermes/config.yaml" <<'PY' || exit 1
import sys,yaml
p=sys.argv[1]
cfg=yaml.safe_load(open(p,encoding='utf-8')) or {}
model=cfg.get('model') or {}
assert model.get('provider') == 'openai-codex', model
assert model.get('default') == 'gpt-5.6-sol', model
assert model.get('openai_runtime') == 'codex_app_server', model
assert cfg.get('fallback_providers') == [], cfg.get('fallback_providers')
assert 'fallback_model' not in cfg, cfg.get('fallback_model')
PY
pass "Hermes built-in provider fallback is disabled; DIAL owns exact Claude Code/Sonnet 5 failover"

section "REPOSITORY QUALIFICATION"
npm ci; pass "npm ci"
npm run typecheck; pass "typecheck"
npm run agent:orchestration:qualify; pass "Hermes runtime control-plane qualification"
npm run verify; pass "full repository verification"
find agent-system/orchestration -name '*.mjs' -print0 | xargs -0 -n1 node --check; pass "orchestration JavaScript syntax"
bash -n deploy/oracle/hermes-codex/*.sh deploy/oracle/hermes-codex/hermes-hooks/*.sh; pass "Oracle shell syntax"
git diff --check; pass "git diff --check"
npm run agent:orchestration:init >/dev/null
DOCTOR="$(tmp)"; npm run agent:orchestration:doctor >"$DOCTOR"
jq -e '.ok_for_hermes_runtime_qualification == true and .runtime_policy.primary == "codex_app_server/gpt-5.6-sol" and .runtime_policy.fallback == "claude_code/claude-sonnet-5" and .runtime_policy.no_runtime == "NO_HERMES_RUNTIME_AVAILABLE"' "$DOCTOR" >/dev/null || { cat "$DOCTOR" >&2; fail "host/runtime doctor is not green"; }; pass "host/runtime doctor"
hermes hooks doctor; pass "Hermes shell hooks doctor"
systemctl --user is-active --quiet dial-hermes-runtime.service || fail "dial-hermes-runtime.service is not active"
systemctl --user is-active --quiet dial-hermes-orchestrator.service || fail "dial-hermes-orchestrator.service is not active"
pass "persistent runtime supervisor and external orchestrator services are active"

section "INSTALLED RUNTIME IDENTITY"
CODEX_PROBE="$(tmp)"; node agent-system/orchestration/codex-app-server-probe.mjs >"$CODEX_PROBE"
jq -e '.state == "HEALTHY" and .requested_model == "gpt-5.6-sol" and .resolved_model == "gpt-5.6-sol" and .identity_proven == true and .rerouted == null' "$CODEX_PROBE" >/dev/null || { cat "$CODEX_PROBE" >&2; fail "Codex App Server Sol probe did not prove the hard pin"; }; pass "Codex App Server hard-pinned GPT-5.6 Sol"
CLAUDE_PROBE="$(tmp)"; node agent-system/orchestration/claude-code-probe.mjs >"$CLAUDE_PROBE"
jq -e '.state == "HEALTHY" and .requested_model == "claude-sonnet-5" and .resolved_model == "claude-sonnet-5" and .identity_proven == true' "$CLAUDE_PROBE" >/dev/null || { cat "$CLAUDE_PROBE" >&2; fail "Claude Code Sonnet 5 probe did not prove the hard pin"; }; pass "official Claude Code / exact Sonnet 5 fallback runtime"

section "OPERATIONAL PRIMARY PATH"
OPERATIONAL="$(tmp)"
"$HOME/.local/bin/dial-hermes" 'Reply with exactly DIAL_HERMES_RUNTIME_EXECUTOR_OK. Do not use tools.' >"$OPERATIONAL"
jq -e '.event == "HERMES_OPERATIONAL_TURN_COMPLETED" and .policy == "LOCKED_SOL_THEN_SONNET" and .runtime == "codex_app_server" and .requested_model == "gpt-5.6-sol" and .resolved_model == "gpt-5.6-sol" and .fallback_used == false' "$OPERATIONAL" >/dev/null || { cat "$OPERATIONAL" >&2; fail "operational entrypoint did not complete through exact Sol primary runtime"; }; pass "dial-hermes → Hermes → Codex App Server → GPT-5.6 Sol"

section "EXTERNAL ORCHESTRATION CANARY"
CANARY_SUBMIT="$(tmp)"
"$HOME/.local/bin/dial-hermes-submit" --requested-by qualification --qualification-canary 'Reply with exactly DIAL_EXTERNAL_ORCHESTRATOR_OK. Do not modify files and do not use tools.' >"$CANARY_SUBMIT"
CANARY_ID="$(jq -r '.job_id // empty' "$CANARY_SUBMIT")"
[[ -n "$CANARY_ID" ]] || { cat "$CANARY_SUBMIT" >&2; fail "external orchestrator canary did not return a job id"; }
CANARY_RESULT="$(tmp)"
CANARY_STATE=""
deadline=$((SECONDS + 600))
while (( SECONDS < deadline )); do
  "$HOME/.local/bin/dial-hermes-job" "$CANARY_ID" >"$CANARY_RESULT"
  CANARY_STATE="$(jq -r '.state // empty' "$CANARY_RESULT")"
  [[ "$CANARY_STATE" == "COMPLETED" || "$CANARY_STATE" == "FAILED" ]] && break
  sleep 2
done
[[ "$CANARY_STATE" == "COMPLETED" ]] || { cat "$CANARY_RESULT" >&2; fail "external orchestration canary did not complete"; }
jq -e '.execution_origin == "EXTERNAL_ORACLE_ORCHESTRATOR" and .result.event == "HERMES_OPERATIONAL_TURN_COMPLETED" and .result.runtime == "codex_app_server" and .result.requested_model == "gpt-5.6-sol" and .result.resolved_model == "gpt-5.6-sol" and .result.fallback_used == false' "$CANARY_RESULT" >/dev/null || { cat "$CANARY_RESULT" >&2; fail "external canary did not prove exact Sol execution from the Oracle orchestrator"; }
pass "work submitted outside the project process is claimed and executed by the Oracle Hermes orchestrator"

section "DETERMINISTIC LOCKED RUNTIME ROUTING"
PRIMARY="$(tmp)"; npm run agent:orchestration:select-runtime >"$PRIMARY"
jq -e '.selected == true and .selection.policy == "LOCKED_SOL_THEN_SONNET" and .selection.runtime == "codex_app_server" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol"' "$PRIMARY" >/dev/null || { cat "$PRIMARY" >&2; fail "Hermes did not select fresh identity-proven Sol"; }; pass "Sol healthy → Hermes selects exact Sol"
node agent-system/orchestration/supervisor.mjs health --runtime codex_app_server --state ACCOUNT_LIMITED --requested-model gpt-5.6-sol --resolved-model gpt-5.6-sol >/dev/null
FALLBACK="$(tmp)"; npm run agent:orchestration:select-runtime >"$FALLBACK"
jq -e '.selected == true and .selection.policy == "LOCKED_SOL_THEN_SONNET" and .selection.runtime == "claude_code" and .selection.requested_model == "claude-sonnet-5" and .selection.resolved_model == "claude-sonnet-5"' "$FALLBACK" >/dev/null || { cat "$FALLBACK" >&2; fail "Sol unavailable did not select exact Sonnet 5"; }; pass "Sol unavailable → Hermes selects exact Sonnet 5"
SUPPORT="$(tmp)"; node agent-system/orchestration/claude-fallback-runner.mjs 'Reply with exactly DIAL_SONNET_5_FALLBACK_OK. Do not modify files.' >"$SUPPORT"
jq -e '.event.authority == "HERMES_RUNTIME_ONLY" and .event.requested_model == "claude-sonnet-5" and .event.resolved_model == "claude-sonnet-5" and .event.identity_proven == true' "$SUPPORT" >/dev/null || { cat "$SUPPORT" >&2; fail "Sonnet fallback support turn did not prove runtime provenance"; }; pass "official Claude Code fallback executes with exact Sonnet 5 identity"
node agent-system/orchestration/supervisor.mjs health --runtime claude_code --state PROCESS_FAILED --requested-model claude-sonnet-5 --resolved-model claude-sonnet-5 >/dev/null
TOTAL_LOSS="$(tmp)"; npm run agent:orchestration:select-runtime >"$TOTAL_LOSS"
jq -e '.selected == false and .reason == "NO_HERMES_RUNTIME_AVAILABLE"' "$TOTAL_LOSS" >/dev/null || { cat "$TOTAL_LOSS" >&2; fail "total runtime loss did not produce NO_HERMES_RUNTIME_AVAILABLE"; }; pass "total loss fails closed without a third model"

section "RECOVERY AND MEMORY"
node agent-system/orchestration/codex-app-server-probe.mjs >/dev/null
RECOVERY="$(tmp)"; npm run agent:orchestration:select-runtime >"$RECOVERY"
jq -e '.selected == true and .selection.runtime == "codex_app_server" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol"' "$RECOVERY" >/dev/null || { cat "$RECOVERY" >&2; fail "Hermes did not return to Sol after recovery"; }; pass "Codex recovery → exact Sol preferred again"
npm run agent:orchestration:capture >/dev/null
MEMORY="$(tmp)"; node agent-system/orchestration/memory-maintenance.mjs >"$MEMORY"
jq -e '.hermes_session_backup.backed_up == true' "$MEMORY" >/dev/null || { cat "$MEMORY" >&2; fail "Hermes state.db backup did not complete"; }; pass "Hermes state.db backup"

EVIDENCE="$QUAL_DIR/installed-runtime-$(stamp).json"
jq -n \
  --arg observed_at "$(now)" \
  --arg repo_head "$HEAD_SHA" \
  --arg canary_job_id "$CANARY_ID" \
  '{
    schema_version:1,
    kind:"DIAL_HERMES_INSTALLED_RUNTIME_QUALIFICATION",
    status:"GREEN",
    observed_at:$observed_at,
    repo_head:$repo_head,
    runtime_policy:"gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE",
    sol_identity_proven:true,
    sonnet_identity_proven:true,
    external_orchestration_canary:true,
    external_orchestration_canary_job_id:$canary_job_id,
    subscription_auth_proven:true,
    built_in_anthropic_fallback_disabled:true
  }' >"$EVIDENCE"
chmod 600 "$EVIDENCE"

echo
echo "INSTALLED_RUNTIME_QUALIFICATION=GREEN"
echo "EXTERNAL_ORCHESTRATION_CANARY=GREEN"
echo "EVIDENCE=$EVIDENCE"
echo
echo "Development remains BLOCKED until both live soak modes are green and finalize-control-plane.sh succeeds:"
echo "  bash deploy/oracle/hermes-codex/soak-control-plane.sh process"
echo "  bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-pre"
echo "  sudo reboot"
echo "  bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-post"
echo "  bash deploy/oracle/hermes-codex/finalize-control-plane.sh"
