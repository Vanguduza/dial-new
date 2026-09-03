#!/usr/bin/env bash
set -euo pipefail

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

fail(){ echo "QUALIFICATION RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
warn(){ echo "! $*" >&2; }
section(){ echo; echo "=== $* ==="; }

TMP_FILES=()
cleanup(){
  for file in "${TMP_FILES[@]:-}"; do [[ -n "$file" ]] && rm -f "$file"; done
}
trap cleanup EXIT

tmp(){
  local file
  file="$(mktemp)"
  TMP_FILES+=("$file")
  printf '%s' "$file"
}

cd "$DIAL_REPO_DIR"

ARCH="$(uname -m)"
[[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]] || fail "Oracle qualification host must be ARM64; detected $ARCH"
pass "Oracle host architecture is ARM64 ($ARCH)"

[[ -f package-lock.json ]] || fail "package-lock.json missing"
[[ -x "$HOME/.hermes/agent-hooks/dial-pre-turn-context.sh" ]] || fail "pre-turn hook not installed"
[[ -x "$HOME/.hermes/agent-hooks/dial-post-turn-checkpoint.sh" ]] || fail "post-turn hook not installed"

if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" ]]; then
  fail "OPENAI_API_KEY/CODEX_API_KEY is present; Hermes primary qualification requires ChatGPT subscription OAuth"
fi
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  fail "ANTHROPIC_API_KEY is present; Hermes fallback qualification requires Claude subscription authentication, not API billing"
fi

codex_status="$(codex login status 2>&1 || true)"
[[ "$codex_status" == *"Logged in using ChatGPT"* ]] || fail "Codex is not using ChatGPT OAuth: $codex_status"
pass "Codex CLI uses ChatGPT subscription OAuth"

claude auth status >/dev/null 2>&1 || fail "Claude Code is not authenticated; Hermes fallback qualification requires Claude subscription login"
pass "Claude Code subscription authentication is present"

section "REPOSITORY QUALIFICATION"
npm ci
pass "npm ci"

npm run typecheck
pass "typecheck"

npm run agent:orchestration:qualify
pass "deterministic orchestration qualification"

npm run verify
pass "full repository verification"

npm run agent:orchestration:init >/dev/null
pass "separated control-plane state initialized"

DOCTOR="$(tmp)"
npm run agent:orchestration:doctor >"$DOCTOR"
jq -e '.ok_for_hermes_runtime_qualification == true and .development_manager_policy_qualification == "REPOSITORY_TESTED_SEPARATELY"' "$DOCTOR" >/dev/null \
  || { cat "$DOCTOR" >&2; fail "host/runtime doctor is not green for separated qualification"; }
pass "host/runtime doctor"

hermes hooks doctor
pass "Hermes shell hooks doctor"

section "HERMES_RUNTIME_QUALIFICATION"
CODEX_PROBE="$(tmp)"
node agent-system/orchestration/codex-app-server-probe.mjs >"$CODEX_PROBE"
jq -e '.state == "HEALTHY" and .requested_model == "gpt-5.6-sol" and .resolved_model == "gpt-5.6-sol" and .rerouted == null' \
  "$CODEX_PROBE" >/dev/null || { cat "$CODEX_PROBE" >&2; fail "Codex App Server Sol probe did not prove the hard pin"; }
pass "Codex App Server hard-pinned GPT-5.6 Sol"

# Hermes-level one-shot validates the installed primary route.
USAGE="$(tmp)"
HERMES_REPLY="$(hermes -z 'Reply with exactly DIAL_HERMES_CODEX_OK. Do not use tools.' --provider openai-codex --model gpt-5.6-sol --usage-file "$USAGE")"
[[ "$HERMES_REPLY" == *"DIAL_HERMES_CODEX_OK"* ]] || fail "Hermes Codex one-shot did not return expected sentinel"
jq -e '.completed == true and .failed != true and .provider == "openai-codex" and .model == "gpt-5.6-sol"' "$USAGE" >/dev/null \
  || { cat "$USAGE" >&2; fail "Hermes usage report does not prove openai-codex / gpt-5.6-sol"; }
pass "Hermes primary path → Codex App Server → GPT-5.6 Sol"

CLAUDE_PROBE="$(tmp)"
node agent-system/orchestration/claude-code-probe.mjs >"$CLAUDE_PROBE"
jq -e '.state == "HEALTHY" and .requested_model == "claude-sonnet-5" and .resolved_model == "claude-sonnet-5"' \
  "$CLAUDE_PROBE" >/dev/null || { cat "$CLAUDE_PROBE" >&2; fail "Claude Code Sonnet 5 probe did not prove the hard pin"; }
pass "official Claude Code / Sonnet 5 Hermes fallback runtime"

HERMES_PRIMARY="$(tmp)"
npm run agent:orchestration:elect-hermes >"$HERMES_PRIMARY"
jq -e '.selected == true and .selection.authority == "HERMES_RUNTIME_ONLY" and .selection.role == "HERMES_PRIMARY_RUNTIME" and .selection.runtime == "codex_app_server" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol" and .selection.health_state == "HEALTHY"' \
  "$HERMES_PRIMARY" >/dev/null || { cat "$HERMES_PRIMARY" >&2; fail "Hermes primary runtime selection did not select fresh identity-proven Sol"; }
pass "Hermes primary runtime selection = Sol (runtime authority only)"

# Deterministic capacity simulation proves routing only; it is NOT real quota-soak evidence.
node agent-system/orchestration/supervisor.mjs health \
  --runtime codex_app_server --state ACCOUNT_LIMITED \
  --requested-model gpt-5.6-sol --resolved-model gpt-5.6-sol >/dev/null

HERMES_FALLBACK="$(tmp)"
npm run agent:orchestration:elect-hermes >"$HERMES_FALLBACK"
jq -e '.selected == true and .selection.authority == "HERMES_RUNTIME_ONLY" and .selection.role == "HERMES_FALLBACK_RUNTIME" and .selection.runtime == "claude_code" and .selection.requested_model == "claude-sonnet-5" and .selection.resolved_model == "claude-sonnet-5" and .selection.health_state == "HEALTHY"' \
  "$HERMES_FALLBACK" >/dev/null || { cat "$HERMES_FALLBACK" >&2; fail "Hermes fallback selection did not select identity-proven Sonnet 5"; }
pass "Sol unavailable → Hermes fallback runtime = Sonnet 5 (runtime authority only)"

# Execute one bounded/read-only support turn through the Sonnet fallback integration.
HERMES_SUPPORT="$(tmp)"
DIAL_TASK_KIND=bounded_repository_scan node agent-system/orchestration/claude-fallback-runner.mjs \
  'Inspect repository status only and report whether package.json exists. Do not modify files.' >"$HERMES_SUPPORT"
jq -e '.routed_only == false and .event.authority == "HERMES_RUNTIME_ONLY" and .event.requested_model == "claude-sonnet-5" and .event.resolved_model == "claude-sonnet-5" and .event.identity_proven == true' \
  "$HERMES_SUPPORT" >/dev/null || { cat "$HERMES_SUPPORT" >&2; fail "Sonnet Hermes fallback support turn did not prove runtime-only identity"; }
pass "Sonnet fallback runtime can perform bounded Hermes support without Manager Chair authority"

section "DEVELOPMENT_MANAGER_POLICY_QUALIFICATION"
# The same Sonnet-powered Hermes runtime now receives a complex instruction. The
# fallback runner MUST route only; it may not execute the complex development work.
COMPLEX_ROUTE="$(tmp)"
DIAL_TASK_KIND=orchestration_decision node agent-system/orchestration/claude-fallback-runner.mjs \
  'Continue a complex DIAL orchestration architecture task under the configured development policy.' >"$COMPLEX_ROUTE"
jq -e '.routed_only == true and .hermes_runtime == "claude-sonnet-5" and .routing.classification == "COMPLEX" and (.routing.route == "FORWARD_TO_MANAGER_CHAIR" or .routing.route == "COMPLEX_WORK_PAUSED")' \
  "$COMPLEX_ROUTE" >/dev/null || { cat "$COMPLEX_ROUTE" >&2; fail "Sonnet-powered Hermes did not route complex development through Manager Chair policy"; }
pass "Sonnet-powered Hermes cannot silently become the DIAL development manager"

DEVELOPMENT_ELECTION="$(tmp)"
npm run agent:orchestration:elect-development -- --task-kind orchestration_decision >"$DEVELOPMENT_ELECTION"
if jq -e '.elected == true' "$DEVELOPMENT_ELECTION" >/dev/null; then
  jq -e '.assignment.role == "DEVELOPMENT_MANAGER_CHAIR" and .assignment.authority == "COMPLEX_DEVELOPMENT" and (.assignment.model_id | type == "string") and (.assignment.runtime_id | type == "string")' \
    "$DEVELOPMENT_ELECTION" >/dev/null || { cat "$DEVELOPMENT_ELECTION" >&2; fail "development assignment lacks explicit Manager Chair authority"; }
  DEVELOPMENT_MODEL="$(jq -r '.assignment.model_id' "$DEVELOPMENT_ELECTION")"
  if [[ "$DEVELOPMENT_MODEL" == "claude-sonnet-5" ]]; then
    POLICY_STATUS="$(tmp)"
    npm run agent:orchestration:status >"$POLICY_STATUS"
    jq -e '.development_policy.manager_chair.explicit_model_ids | index("claude-sonnet-5") != null' "$POLICY_STATUS" >/dev/null \
      || { cat "$POLICY_STATUS" >&2; fail "Sonnet received Manager Chair without explicit user policy configuration"; }
  fi
  pass "complex development assigned only to a configured Manager Chair ($DEVELOPMENT_MODEL)"
else
  jq -e '.elected == false and .paused == true and .reason == "NO_QUALIFIED_MANAGER" and .state.state == "COMPLEX_WORK_PAUSED"' \
    "$DEVELOPMENT_ELECTION" >/dev/null || { cat "$DEVELOPMENT_ELECTION" >&2; fail "no-qualified-manager path did not pause complex work"; }
  pass "no qualified Manager Chair → complex development paused (quality floor preserved)"
fi

SEPARATION_STATUS="$(tmp)"
npm run agent:orchestration:status >"$SEPARATION_STATUS"
jq -e '.hermes_runtime.status == "ACTIVE" and .hermes_runtime.authority == "HERMES_RUNTIME_ONLY" and .hermes_runtime.requested_model == "claude-sonnet-5"' \
  "$SEPARATION_STATUS" >/dev/null || { cat "$SEPARATION_STATUS" >&2; fail "development policy evaluation mutated Hermes fallback runtime identity"; }
if jq -e '.development_manager.status == "ACTIVE"' "$SEPARATION_STATUS" >/dev/null 2>&1; then
  jq -e '.development_manager.role == "DEVELOPMENT_MANAGER_CHAIR" and .development_manager.authority == "COMPLEX_DEVELOPMENT"' "$SEPARATION_STATUS" >/dev/null \
    || { cat "$SEPARATION_STATUS" >&2; fail "active development manager state is semantically ambiguous"; }
fi
pass "Hermes runtime identity and Development Manager Chair identity remain independent"

section "HERMES PRIMARY RECOVERY"
CODEX_RECOVERY="$(tmp)"
node agent-system/orchestration/codex-app-server-probe.mjs >"$CODEX_RECOVERY"
jq -e '.state == "HEALTHY" and .requested_model == "gpt-5.6-sol" and .resolved_model == "gpt-5.6-sol"' "$CODEX_RECOVERY" >/dev/null \
  || { cat "$CODEX_RECOVERY" >&2; fail "fresh Codex recovery probe failed"; }

HERMES_RECOVERY="$(tmp)"
npm run agent:orchestration:elect-hermes >"$HERMES_RECOVERY"
jq -e '.selected == true and .selection.authority == "HERMES_RUNTIME_ONLY" and .selection.role == "HERMES_PRIMARY_RUNTIME" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol"' \
  "$HERMES_RECOVERY" >/dev/null || { cat "$HERMES_RECOVERY" >&2; fail "Hermes did not return to Sol runtime at explicit recovery boundary"; }
pass "Hermes runtime safely eligible for return to Sol at explicit boundary"

systemctl --user is-active --quiet dial-orchestrator.service || fail "dial-orchestrator.service is not active"
pass "persistent DIAL supervisor service"

if systemctl --user is-active --quiet hermes-dial-dashboard.service; then
  curl -fsS http://127.0.0.1:9119/api/status >/dev/null || fail "Hermes local dashboard service is active but /api/status failed"
  pass "Hermes localhost dashboard/session-search backend"
else
  warn "Hermes dashboard is not active; session FTS retrieval is degraded but primary orchestration remains functional"
fi

npm run agent:orchestration:capture >/dev/null
FINAL_STATUS="$(tmp)"
npm run agent:orchestration:status >"$FINAL_STATUS"

echo
cat <<'EOF'
DIAL separated orchestration qualification: GREEN for repository policy + installed runtime probes executed by this script.

HERMES_RUNTIME_QUALIFICATION proven here:
- ChatGPT subscription OAuth route
- direct Codex App Server / GPT-5.6 Sol hard pin
- Hermes primary one-shot through openai-codex / Sol
- official Claude Code / Sonnet 5 identity
- deterministic Sol → Sonnet runtime-only failover selection
- bounded Sonnet fallback support invocation
- explicit return eligibility to Sol

DEVELOPMENT_MANAGER_POLICY_QUALIFICATION proven here:
- complex task classification is independent from the active Hermes runtime
- Sonnet-powered Hermes routes complex work instead of inheriting development authority
- only a configured Manager Chair may receive complex-development authority
- if none is available, complex work pauses rather than downgrading quality
- Hermes runtime and Development Manager state remain separate

Still requires live operational evidence before production activation:
- genuine Codex/provider capacity event while work is active (never manufacture quota exhaustion)
- abrupt Codex process death with Hermes continuity via Sonnet
- abrupt Hermes process death/restart
- DIAL supervisor process death/restart
- full Oracle reboot recovery
- live complex request while Sonnet powers Hermes, with a real configured Fable/Opus/Sol Manager Chair if one is available, otherwise a verified pause
- live bounded worker execution on configured worker harnesses such as DeepSeek where present
- safe return to Sol at a real atomic boundary
- final security scan and independent cross-model review

A simulated ACCOUNT_LIMITED state is deterministic routing evidence only, not real provider quota-soak evidence.
The control plane remains QUALIFICATION mode until all mandatory live gates are recorded.
EOF
