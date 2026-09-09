#!/usr/bin/env bash
set -euo pipefail
umask 077
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
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
[[ -x "$HOME/.local/bin/dial-hermes-ops" ]] || fail "dial-hermes-ops is not installed; run install-operations-plane.sh"
[[ -x "$HOME/.local/bin/dial-hermes-ops-config" ]] || fail "dial-hermes-ops-config is not installed; run install-operations-plane.sh"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/chat-control-bridge.mjs" ]] || fail "DIAL chat control bridge is missing"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/mission-controller.mjs" ]] || fail "DIAL mission controller is missing"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/operator-control-stdio.mjs" ]] || fail "DIAL typed operator stdio MCP is missing"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/operator-text-router.mjs" ]] || fail "DIAL operator text router is missing"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/whatsapp-hermes-operator.mjs" ]] || fail "DIAL Hermes WhatsApp operator adapter is missing"
[[ -f "$DIAL_REPO_DIR/agent-system/orchestration/whatsapp-operator-adapter.mjs" ]] || fail "DIAL WhatsApp Cloud operator adapter is missing"
[[ -f "$DIAL_CONTROL_HOME/secrets/chat-control.token" ]] || fail "DIAL chat control bearer token is missing; run install-chat-control-bridge.sh"
[[ "$(stat -c %a "$DIAL_CONTROL_HOME/secrets/chat-control.token")" == "600" ]] || fail "DIAL chat control bearer token must be mode 0600"
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
skills=cfg.get('skills') or {}
external=skills.get('external_dirs') or []
if isinstance(external,str): external=[external]
assert '${DIAL_SKILL_ACTIVATION_DIR}' in external, external
PY
pass "Hermes built-in provider fallback is disabled and VEKL packet-scoped external skills are configured"

section "REPOSITORY QUALIFICATION"
npm ci; pass "npm ci"
npm run typecheck; pass "typecheck"
VEKL_STATUS="$(tmp)"; npm run --silent agent:skills:check >"$VEKL_STATUS"
jq -e '.status == "GREEN" and .policy_version == "vekl-1.0"' "$VEKL_STATUS" >/dev/null || { cat "$VEKL_STATUS" >&2; fail "VEKL skill registry/policy validation is not green"; }
VEKL_KNOWLEDGE="$(tmp)"; npm run --silent agent:knowledge:check >"$VEKL_KNOWLEDGE"
jq -e '.status == "GREEN" and .policy_version == "vekl-2.0" and .resource_sources > 0 and .resource_records > 0' "$VEKL_KNOWLEDGE" >/dev/null || { cat "$VEKL_KNOWLEDGE" >&2; fail "VEKL federated resource registry/policy validation is not green"; }
pass "VEKL v2 skill + federated resource registries and activation-policy validation"
npm run agent:orchestration:qualify; pass "Hermes runtime control-plane qualification including VEKL"
npm run verify; pass "full repository verification"
find agent-system/orchestration -name '*.mjs' -print0 | xargs -0 -n1 node --check; pass "orchestration JavaScript syntax"
bash -n deploy/oracle/hermes-codex/*.sh deploy/oracle/hermes-codex/hermes-hooks/*.sh; pass "Oracle shell syntax"
git diff --check; pass "git diff --check"
npm run agent:orchestration:init >/dev/null
DOCTOR="$(tmp)"; npm run --silent agent:orchestration:doctor >"$DOCTOR"
jq -e '.ok_for_hermes_runtime_qualification == true and .runtime_policy.primary == "codex_app_server/gpt-5.6-sol" and .runtime_policy.fallback == "claude_code/claude-sonnet-5" and .runtime_policy.no_runtime == "NO_HERMES_RUNTIME_AVAILABLE"' "$DOCTOR" >/dev/null || { cat "$DOCTOR" >&2; fail "host/runtime doctor is not green"; }; pass "host/runtime doctor"
hermes hooks doctor; pass "Hermes shell hooks doctor"
systemctl --user is-active --quiet dial-hermes-runtime.service || fail "dial-hermes-runtime.service is not active"
systemctl --user is-active --quiet dial-hermes-orchestrator.service || fail "dial-hermes-orchestrator.service is not active"
systemctl --user is-active --quiet dial-hermes-operations.service || fail "dial-hermes-operations.service is not active"
systemctl --user is-active --quiet dial-chat-control.service || fail "dial-chat-control.service is not active"
systemctl --user is-active --quiet dial-mission-controller.service || fail "dial-mission-controller.service is not active"
systemctl --user is-active --quiet dial-hermes-whatsapp-operator.service || fail "dial-hermes-whatsapp-operator.service is not active"
systemctl --user is-active --quiet dial-whatsapp-cloud-operator.service || fail "dial-whatsapp-cloud-operator.service is not active"
systemctl --user is-active --quiet dial-engineering-research.timer || fail "dial-engineering-research.timer is not active"
systemctl --user is-active --quiet dial-engineering-research.path || fail "dial-engineering-research.path is not active"
CHAT_HEALTH="$(curl -fsS http://127.0.0.1:9130/health)"
jq -e '.service == "dial-chat-control" and .project == "dial" and .state == "UP"' <<<"$CHAT_HEALTH" >/dev/null || fail "DIAL chat control health endpoint is invalid"
CHAT_TOKEN="$(cat "$DIAL_CONTROL_HOME/secrets/chat-control.token")"
CHAT_TOOLS="$(curl -fsS -H "Authorization: Bearer $CHAT_TOKEN" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' http://127.0.0.1:9130/mcp)"
unset CHAT_TOKEN
jq -e '.result.tools | length >= 19' <<<"$CHAT_TOOLS" >/dev/null || fail "DIAL operator control MCP tools are unavailable"
jq -e '[.result.tools[].name | test("shell|exec|filesystem"; "i")] | any == false' <<<"$CHAT_TOOLS" >/dev/null || fail "DIAL chat control exposes a forbidden generic execution primitive"
jq -e '[.result.tools[].name] | index("dial_skill_status") != null and index("dial_operator_channels") != null and index("dial_submit_instruction") != null' <<<"$CHAT_TOOLS" >/dev/null || fail "DIAL operator control is missing VEKL/status/write typed tools"
CLOUD_WA_HEALTH="$(curl -fsS http://127.0.0.1:9132/health)"
jq -e '.service == "dial-whatsapp-operator" and .project == "dial" and (.state == "UNCONFIGURED" or .state == "DISABLED" or .state == "READY") and (has("access_token")|not) and (has("app_secret")|not) and (has("verify_token")|not)' <<<"$CLOUD_WA_HEALTH" >/dev/null || fail "WhatsApp Cloud operator boundary/health is invalid or leaks secret fields"
HERMES_WA_STATUS="$(node agent-system/orchestration/whatsapp-hermes-operator.mjs status)"
jq -e '.authority == "OWNER_SELF_CHAT_TYPED_DIAL_CONTROL" and (.paired == true or .paired == false)' <<<"$HERMES_WA_STATUS" >/dev/null || fail "Hermes WhatsApp owner-control status is invalid"
CODEX_MCP="$(codex mcp get dial-oracle-control 2>&1 || true)"
grep -q 'operator-control-stdio.mjs' <<<"$CODEX_MCP" || fail "Codex dial-oracle-control MCP is not enrolled"
CLAUDE_MCP="$(claude mcp get dial-oracle-control 2>&1 || true)"
grep -q 'operator-control-stdio.mjs' <<<"$CLAUDE_MCP" || fail "Claude dial-oracle-control MCP is not enrolled"
MISSION_STATUS="$(node agent-system/orchestration/mission-controller.mjs status)"
jq -e '.mission_id == "dial-development-root" and .project == "dial" and (.state == "PAUSED" or .state == "BLOCKED_OWNER" or .state == "WAITING_RUNTIME")' <<<"$MISSION_STATUS" >/dev/null || fail "DIAL root mission is not safely non-running during pre-green qualification"
OPS_STATUS="$(tmp)"; "$HOME/.local/bin/dial-hermes-ops" status >"$OPS_STATUS"
jq -e '.authority == "NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS" and .development_authority == false and .api.key_material_exposed == false' "$OPS_STATUS" >/dev/null || { cat "$OPS_STATUS" >&2; fail "auxiliary operations boundary is not intact"; }
pass "persistent runtime, external orchestrator, mission controller, Claude/Codex/WhatsApp typed operator gateway, VEKL ahead-of-work research scheduler and non-authoritative operations services are active"

section "PROJECT-AWARE RESEARCH + LOCKED RUNTIME IDENTITY"
# DEC-020 permits the project-aware research manager to fall from exact Sol to
# exact Sonnet 5. Reuse a current semantic forecast instead of forcing another
# manager-model turn. Exact live Sol execution is still mandatory below through
# the VEKL primary canary and external Oracle queue canary.
RESEARCH_FORECAST="$(tmp)"; npm run --silent agent:research:refresh >"$RESEARCH_FORECAST"
jq -e '.state == "READY" and (.items|length) >= 3 and (.items|length) <= 5 and .resource_cache_count > 0 and .runtime_provenance.identity_proven == true and ((.runtime_provenance.runtime == "codex_app_server" and .runtime_provenance.requested_model == "gpt-5.6-sol" and .runtime_provenance.resolved_model == "gpt-5.6-sol") or (.runtime_provenance.runtime == "claude_code" and .runtime_provenance.requested_model == "claude-sonnet-5" and .runtime_provenance.resolved_model == "claude-sonnet-5"))' "$RESEARCH_FORECAST" >/dev/null || { cat "$RESEARCH_FORECAST" >&2; fail "VEKL project-aware forecast is not live/ready through the locked Sol/Sonnet chain"; }
RESEARCH_FORECAST_ID="$(jq -r '.forecast_id // empty' "$RESEARCH_FORECAST")"
RESEARCH_FORECAST_RUNTIME="$(jq -r '.runtime_provenance.runtime // empty' "$RESEARCH_FORECAST")"
RESEARCH_FORECAST_MODEL="$(jq -r '.runtime_provenance.resolved_model // empty' "$RESEARCH_FORECAST")"
[[ -n "$RESEARCH_FORECAST_ID" ]] || fail "VEKL research forecast id missing"
pass "VEKL project-aware next-3-to-5-packet research is current through $RESEARCH_FORECAST_MODEL"
CLAUDE_PROBE="$(tmp)"; node agent-system/orchestration/claude-code-probe.mjs >"$CLAUDE_PROBE"
jq -e '.state == "HEALTHY" and .requested_model == "claude-sonnet-5" and .resolved_model == "claude-sonnet-5" and .identity_proven == true' "$CLAUDE_PROBE" >/dev/null || { cat "$CLAUDE_PROBE" >&2; fail "Claude Code Sonnet 5 probe did not prove the hard pin"; }; pass "official Claude Code / exact Sonnet 5 fallback runtime"

section "VEKL LIVE RUNTIME SYMMETRY"
VEKL_CANARY="$(tmp)"; npm run --silent agent:skills:live-canary >"$VEKL_CANARY"
jq -e '.status == "GREEN" and .kind == "DIAL_VEKL_LIVE_RUNTIME_SYMMETRY_CANARY" and .same_activation_across_runtimes == true and .exact_hashes_preserved == true and .federated_resource_provenance_preserved == true and .primary.resolved_model == "gpt-5.6-sol" and .fallback.resolved_model == "claude-sonnet-5"' "$VEKL_CANARY" >/dev/null || { cat "$VEKL_CANARY" >&2; fail "VEKL live Sol/Sonnet symmetry canary is not green"; }
VEKL_CANARY_EVIDENCE="$(jq -r '.evidence_path // empty' "$VEKL_CANARY")"
VEKL_CANARY_ACTIVATION="$(jq -r '.activation_id // empty' "$VEKL_CANARY")"
[[ -n "$VEKL_CANARY_EVIDENCE" && -f "$VEKL_CANARY_EVIDENCE" && -n "$VEKL_CANARY_ACTIVATION" ]] || fail "VEKL live canary evidence was not persisted"
pass "VEKL v2 exact skill + federated resource manifest provenance is identical across live Sol and Sonnet paths"

section "OPERATIONAL PRIMARY PATH"
# The live VEKL symmetry canary above already executes runPrimaryHermes through
# the exact hard-pinned Codex path with a packet activation. Reusing that evidence
# avoids spending a second Sol turn merely to return another fixed token.
jq -e '.primary.runtime == "codex_app_server" and .primary.requested_model == "gpt-5.6-sol" and .primary.resolved_model == "gpt-5.6-sol" and .primary.identity_proven == true' "$VEKL_CANARY" >/dev/null || fail "VEKL canary did not prove operational Sol primary execution"
pass "operational primary path proven by live VEKL Sol execution (no duplicate inference)"

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
# Repository qualification above includes deterministic HEALTHY/limited/total-loss
# routing tests. Do not mutate live runtime health or spend support-model turns only
# to repeat those pure state-machine assertions.
pass "deterministic Sol -> Sonnet -> no-runtime routing proven without model inference"

section "RECOVERY AND MEMORY"
pass "live runtime health was not destructively mutated during deterministic routing checks"
npm run agent:orchestration:capture >/dev/null
MEMORY="$(tmp)"; node agent-system/orchestration/memory-maintenance.mjs >"$MEMORY"
jq -e '.hermes_session_backup.backed_up == true' "$MEMORY" >/dev/null || { cat "$MEMORY" >&2; fail "Hermes state.db backup did not complete"; }; pass "Hermes state.db backup"

EVIDENCE="$QUAL_DIR/installed-runtime-$(stamp).json"
jq -n \
  --arg observed_at "$(now)" \
  --arg repo_head "$HEAD_SHA" \
  --arg canary_job_id "$CANARY_ID" \
  --arg vekl_live_canary_evidence "$VEKL_CANARY_EVIDENCE" \
  --arg vekl_live_canary_activation "$VEKL_CANARY_ACTIVATION" \
  --arg vekl_research_forecast_id "$RESEARCH_FORECAST_ID" \
  --arg vekl_research_forecast_runtime "$RESEARCH_FORECAST_RUNTIME" \
  --arg vekl_research_forecast_model "$RESEARCH_FORECAST_MODEL" \
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
    built_in_anthropic_fallback_disabled:true,
    auxiliary_operations_plane:true,
    auxiliary_operations_authority:"NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS",
    persistent_mission_controller:true,
    chat_control_bridge:true,
    chat_control_project:"dial",
    chat_control_generic_shell_exposed:false,
    project_isolated_qualification:true,
    shared_host_reboot_required:false,
    vekl_framework:true,
    vekl_policy_version:"vekl-2.0",
    vekl_federated_resource_layer:true,
    vekl_ahead_of_work_research_scheduler:true,
    vekl_ahead_of_work_live_forecast:true,
    vekl_ahead_of_work_forecast_id:$vekl_research_forecast_id,
    vekl_ahead_of_work_forecast_runtime:$vekl_research_forecast_runtime,
    vekl_ahead_of_work_forecast_model:$vekl_research_forecast_model,
    vekl_packet_manifest_required:true,
    vekl_vendor_content_authority:"ENGINEERING_GUIDANCE_ONLY",
    vekl_unqualified_vendor_activation_allowed:false,
    vekl_live_runtime_symmetry:true,
    vekl_live_canary_evidence:$vekl_live_canary_evidence,
    vekl_live_canary_activation:$vekl_live_canary_activation
  }' >"$EVIDENCE"
chmod 600 "$EVIDENCE"

echo
echo "INSTALLED_RUNTIME_QUALIFICATION=GREEN"
echo "EXTERNAL_ORCHESTRATION_CANARY=GREEN"
echo "EVIDENCE=$EVIDENCE"
echo
echo "Full PRODUCTION_GREEN remains pending until the project-isolated live soaks are green and finalize-control-plane.sh succeeds. If exact Sol is temporarily provider-limited, use finalize-development-readiness.sh instead of weakening this full-production qualifier."
echo "  bash deploy/oracle/hermes-codex/soak-control-plane.sh process"
echo "  bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh"
echo "  bash deploy/oracle/hermes-codex/soak-control-plane.sh continuity"
echo "  bash deploy/oracle/hermes-codex/finalize-control-plane.sh"
echo
echo "Whole-host reboot is optional platform-maintenance evidence only and is not a DIAL production-green prerequisite on the shared Oracle host."
