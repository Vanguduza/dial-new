#!/usr/bin/env bash
set -euo pipefail

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

fail(){ echo "QUALIFICATION RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
warn(){ echo "! $*" >&2; }

cd "$DIAL_REPO_DIR"

[[ -f package-lock.json ]] || fail "package-lock.json missing"
[[ -x "$HOME/.hermes/agent-hooks/dial-pre-turn-context.sh" ]] || fail "pre-turn hook not installed"
[[ -x "$HOME/.hermes/agent-hooks/dial-post-turn-checkpoint.sh" ]] || fail "post-turn hook not installed"

if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" ]]; then
  fail "OPENAI_API_KEY/CODEX_API_KEY is present; qualification requires ChatGPT subscription OAuth"
fi

codex_status="$(codex login status 2>&1 || true)"
[[ "$codex_status" == *"Logged in using ChatGPT"* ]] || fail "Codex is not using ChatGPT OAuth: $codex_status"
pass "Codex CLI uses ChatGPT subscription OAuth"

if ! claude auth status >/tmp/dial-claude-auth.json 2>/dev/null; then
  fail "Claude Code is not authenticated; cross-provider qualification requires Claude subscription login"
fi
pass "Claude Code authentication is present"

npm ci
pass "npm ci"

npm run agent:orchestration:qualify
pass "deterministic orchestration unit qualification"

npm run agent:orchestration:doctor >/tmp/dial-orchestration-doctor.json
jq -e '.ok_for_full_cross_provider_qualification == true' /tmp/dial-orchestration-doctor.json >/dev/null \
  || { cat /tmp/dial-orchestration-doctor.json >&2; fail "orchestration doctor is not fully green"; }
pass "host/runtime doctor"

hermes hooks doctor
pass "Hermes shell hooks doctor"

# Direct Codex App Server check: explicit Sol model, read-only ephemeral thread,
# records structured quota/auth errors and rejects model/reroute ambiguity.
node agent-system/orchestration/codex-app-server-probe.mjs >/tmp/dial-codex-probe.json
jq -e '.state == "HEALTHY" and .requested_model == "gpt-5.6-sol" and .resolved_model == "gpt-5.6-sol" and .rerouted == null' \
  /tmp/dial-codex-probe.json >/dev/null || { cat /tmp/dial-codex-probe.json >&2; fail "Codex App Server Sol probe did not prove the hard pin"; }
pass "Codex App Server hard-pinned GPT-5.6 Sol"

# Hermes-level one-shot: validates that the configured Hermes runtime can reach the
# Codex subscription route and reports its provider/model in the supported usage file.
USAGE="$(mktemp)"
trap 'rm -f "$USAGE"' EXIT
HERMES_REPLY="$(hermes -z 'Reply with exactly DIAL_HERMES_CODEX_OK. Do not use tools.' --provider openai-codex --model gpt-5.6-sol --usage-file "$USAGE")"
[[ "$HERMES_REPLY" == *"DIAL_HERMES_CODEX_OK"* ]] || fail "Hermes Codex one-shot did not return expected sentinel"
jq -e '.completed == true and .failed != true and .provider == "openai-codex" and .model == "gpt-5.6-sol"' "$USAGE" >/dev/null \
  || { cat "$USAGE" >&2; fail "Hermes usage report does not prove openai-codex / gpt-5.6-sol"; }
pass "Hermes → Codex App Server → GPT-5.6 Sol path"

# Sonnet failover check uses official Claude Code and proves actual model from modelUsage.
node agent-system/orchestration/claude-code-probe.mjs >/tmp/dial-claude-probe.json
jq -e '.state == "HEALTHY" and .requested_model == "claude-sonnet-5" and .resolved_model == "claude-sonnet-5"' \
  /tmp/dial-claude-probe.json >/dev/null || { cat /tmp/dial-claude-probe.json >&2; fail "Claude Code Sonnet 5 probe did not prove the hard pin"; }
pass "official Claude Code / Sonnet 5 failover runtime"

# Normal election must pick Codex.
npm run agent:orchestration:elect >/tmp/dial-election-primary.json
jq -e '.elected == true and .lease.runtime == "codex_app_server" and .lease.requested_model == "gpt-5.6-sol" and .lease.resolved_model == "gpt-5.6-sol"' \
  /tmp/dial-election-primary.json >/dev/null || { cat /tmp/dial-election-primary.json >&2; fail "primary manager election did not select Sol"; }
pass "primary manager lease election"

# Deterministic failover simulation: do not consume or bypass quota. Mark the direct
# Codex runtime unavailable and prove that the already-qualified Sonnet runtime is elected.
node agent-system/orchestration/supervisor.mjs health \
  --runtime codex_app_server --state ACCOUNT_LIMITED \
  --requested-model gpt-5.6-sol --resolved-model gpt-5.6-sol >/dev/null
npm run agent:orchestration:elect >/tmp/dial-election-failover.json
jq -e '.elected == true and .lease.runtime == "claude_code" and .lease.requested_model == "claude-sonnet-5" and .lease.resolved_model == "claude-sonnet-5"' \
  /tmp/dial-election-failover.json >/dev/null || { cat /tmp/dial-election-failover.json >&2; fail "failover election did not select Sonnet 5"; }
pass "Codex unavailable → Sonnet manager lease"

# Restore actual Codex health from a fresh direct probe and re-elect only at this explicit boundary.
node agent-system/orchestration/codex-app-server-probe.mjs >/tmp/dial-codex-recovery.json
npm run agent:orchestration:elect >/tmp/dial-election-recovery.json
jq -e '.elected == true and .lease.runtime == "codex_app_server"' /tmp/dial-election-recovery.json >/dev/null \
  || { cat /tmp/dial-election-recovery.json >&2; fail "Codex recovery did not regain eligibility at explicit boundary"; }
pass "Codex recovery eligibility"

systemctl --user is-active --quiet dial-orchestrator.service || fail "dial-orchestrator.service is not active"
pass "persistent DIAL supervisor service"

if systemctl --user is-active --quiet hermes-dial-dashboard.service; then
  curl -fsS http://127.0.0.1:9119/api/status >/dev/null || fail "Hermes local dashboard service is active but /api/status failed"
  pass "Hermes localhost dashboard/session-search backend"
else
  warn "Hermes dashboard is not active; session FTS retrieval is degraded but primary orchestration remains functional"
fi

# Capture a final clean runtime checkpoint and show status. This does not claim
# that a real quota-exhaustion event has occurred; that remains an operational soak test.
npm run agent:orchestration:capture >/dev/null
npm run agent:orchestration:status >/tmp/dial-orchestration-final-status.json

echo
cat <<EOF
DIAL Hermes/Codex qualification: GREEN for installed-runtime qualification.

Proven here:
- local deterministic state/memory primitives
- ChatGPT OAuth route
- direct Codex App Server / GPT-5.6 Sol hard pin
- Hermes one-shot through openai-codex / Sol
- official Claude Code / Sonnet 5 hard pin
- deterministic primary/failover/recovery manager election
- persistent supervisor service

Still requires real-world soak evidence before production activation:
- genuine Codex quota exhaustion while a task is active
- abrupt Codex/Hermes process death mid-atomic-unit
- reboot recovery
- live Sonnet takeover executing a disposable engineering packet
- safe return to Codex at an atomic boundary

The control plane remains QUALIFICATION mode until those operational tests are recorded.
EOF
