#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
QUAL_DIR="$DIAL_CONTROL_HOME/evidence-cache/qualification"
SOAK_DIR="$DIAL_CONTROL_HOME/evidence-cache/soak"
GATE="$DIAL_CONTROL_HOME/state/external-orchestration-gate.json"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

fail(){ echo "FINALIZATION RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
latest(){ ls -1t "$@" 2>/dev/null | head -n1 || true; }

cd "$DIAL_REPO_DIR"
HEAD_SHA="$(git rev-parse HEAD)"
FINGERPRINT_JSON="$(node agent-system/orchestration/development-unblock.mjs --fingerprint)"
FINGERPRINT_VALUE="$(jq -r '.value // empty' <<<"$FINGERPRINT_JSON")"
FINGERPRINT_ALGORITHM="$(jq -r '.algorithm // empty' <<<"$FINGERPRINT_JSON")"
FINGERPRINT_OBJECTS="$(jq -c '.objects // []' <<<"$FINGERPRINT_JSON")"
[[ -n "$FINGERPRINT_VALUE" && -n "$FINGERPRINT_ALGORITHM" ]] || fail "Hermes control-plane fingerprint could not be computed"

QUAL="$(latest "$QUAL_DIR"/installed-runtime-*.json)"
PROCESS="$(latest "$SOAK_DIR"/process-*.json)"
EXTERNAL="$(latest "$SOAK_DIR"/external-failover-*.json)"
CONTINUITY="$(latest "$SOAK_DIR"/continuity-*.json)"
[[ -n "$QUAL" && -f "$QUAL" ]] || fail "installed-runtime qualification evidence is missing"
[[ -n "$PROCESS" && -f "$PROCESS" ]] || fail "process-soak evidence is missing"
[[ -n "$EXTERNAL" && -f "$EXTERNAL" ]] || fail "external queued failover evidence is missing"
[[ -n "$CONTINUITY" && -f "$CONTINUITY" ]] || fail "project-isolated continuity-soak evidence is missing"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .sol_identity_proven == true
  and .sonnet_identity_proven == true
  and .external_orchestration_canary == true
  and .auxiliary_operations_plane == true
  and .auxiliary_operations_authority == "NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS"
  and .persistent_mission_controller == true
  and .chat_control_bridge == true
  and .chat_control_project == "dial"
  and .chat_control_generic_shell_exposed == false
  and .vekl_framework == true
  and .vekl_policy_version == "vekl-2.0"
  and .vekl_federated_resource_layer == true
  and .vekl_ahead_of_work_research_scheduler == true
  and .vekl_packet_manifest_required == true
  and .vekl_vendor_content_authority == "ENGINEERING_GUIDANCE_ONLY"
  and .vekl_unqualified_vendor_activation_allowed == false
  and .runtime_policy == "gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE"
' "$QUAL" >/dev/null || fail "installed-runtime qualification evidence is not green for current HEAD"
pass "installed Sol, Sonnet and external orchestration canary are proven"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .project_isolated == true
  and .shared_hermes_gateway_disrupted == false
  and .actual_dial_owned_codex_app_server_sigkill == true
  and .sonnet_fallback_identity_proven == true
  and .sol_recovery_proven == true
' "$PROCESS" >/dev/null || fail "project-isolated process-soak evidence is not green for current HEAD"
pass "DIAL-owned Codex process death, Sonnet fallback and Sol recovery are proven without disrupting the shared Hermes gateway"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .execution_origin == "EXTERNAL_ORACLE_ORCHESTRATOR"
  and .project_isolated == true
  and .unrelated_project_processes_targeted == false
  and .actual_codex_app_server_sigkill == true
  and .same_job_sonnet_fallback == true
  and .sonnet_requested_model == "claude-sonnet-5"
  and .sonnet_resolved_model == "claude-sonnet-5"
  and .sol_recovery_proven == true
' "$EXTERNAL" >/dev/null || fail "external queued failover evidence is not green for current HEAD"
pass "external queued job survived real Codex death via exact Sonnet 5 and returned to Sol"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .project == "dial"
  and .project_isolated == true
  and .shared_host_reboot_required == false
  and .shared_hermes_gateway_disrupted == false
  and .unrelated_project_services_touched == false
  and .dial_services_recovered == true
  and .chat_control_recovered == true
  and .mission_state_survived == true
' "$CONTINUITY" >/dev/null || fail "project-isolated continuity-soak evidence is not green for current HEAD"
pass "DIAL mission/control continuity is proven through DIAL-only service restarts; no shared-host reboot is required"

systemctl --user is-active --quiet dial-hermes-runtime.service || fail "dial-hermes-runtime.service is not active"
systemctl --user is-active --quiet dial-hermes-orchestrator.service || fail "dial-hermes-orchestrator.service is not active"
systemctl --user is-active --quiet dial-hermes-operations.service || fail "dial-hermes-operations.service is not active"
systemctl --user is-active --quiet dial-chat-control.service || fail "dial-chat-control.service is not active"
systemctl --user is-active --quiet dial-mission-controller.service || fail "dial-mission-controller.service is not active"
systemctl --user is-active --quiet dial-engineering-research.timer || fail "dial-engineering-research.timer is not active"
systemctl --user is-active --quiet dial-engineering-research.path || fail "dial-engineering-research.path is not active"
[[ "$(stat -c %a "$DIAL_CONTROL_HOME/secrets/chat-control.token")" == "600" ]] || fail "chat-control token must be mode 0600"
CHAT_HEALTH="$(curl -fsS http://127.0.0.1:9130/health)"
jq -e '.service == "dial-chat-control" and .project == "dial" and .state == "UP"' <<<"$CHAT_HEALTH" >/dev/null || fail "chat-control health is invalid"
OPS_STATUS="$($HOME/.local/bin/dial-hermes-ops status)"
jq -e '.authority == "NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS" and .development_authority == false and .api.key_material_exposed == false' <<<"$OPS_STATUS" >/dev/null || fail "auxiliary operations plane boundary is invalid"
if jq -e ".api.key_configured == true" <<<"$OPS_STATUS" >/dev/null; then
  [[ "$(stat -c %a "$DIAL_CONTROL_HOME/secrets/operations-api.key")" == "600" ]] || fail "operations API key file must be mode 0600"
fi
VEKL_RUNTIME="$(npm run --silent agent:skills:runtime-check)"
jq -e '.status == "GREEN" and .policy_version == "vekl-1.0" and .vendor_snapshots_immutable == true' <<<"$VEKL_RUNTIME" >/dev/null || { echo "$VEKL_RUNTIME" >&2; fail "VEKL runtime snapshot audit is not green"; }
VEKL_KNOWLEDGE="$(npm run --silent agent:knowledge:check)"
jq -e '.status == "GREEN" and .policy_version == "vekl-2.0" and .resource_sources > 0 and .resource_records > 0' <<<"$VEKL_KNOWLEDGE" >/dev/null || { echo "$VEKL_KNOWLEDGE" >&2; fail "VEKL v2 federated resource audit is not green"; }
pass "VEKL approved vendor snapshots are exact-hash/read-only and federated resource governance is green"

pass "persistent supervisor, external orchestrator, mission controller, DIAL-only chat control and non-authoritative operations services are active"

node - "$DIAL_CONTROL_HOME/state/external-orchestrator-heartbeat.json" <<'NODE' || exit 1
const fs = require('fs');
const p = process.argv[2];
const h = JSON.parse(fs.readFileSync(p, 'utf8'));
const age = Date.now() - Date.parse(h.observed_at || '');
if (h.execution_origin !== 'EXTERNAL_ORACLE_ORCHESTRATOR' || !Number.isFinite(age) || age < 0 || age > 120000) {
  console.error('external orchestrator heartbeat is stale or invalid');
  process.exit(1);
}
NODE
pass "external orchestrator heartbeat is fresh"

if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" || -n "${ANTHROPIC_API_KEY:-}" ]]; then
  fail "API-key environment material is present on the subscription-only control plane"
fi
for unit in dial-hermes-runtime.service dial-hermes-orchestrator.service dial-hermes-operations.service dial-mission-controller.service dial-chat-control.service dial-engineering-research.service; do
  env_line="$(systemctl --user show "$unit" -p Environment --value 2>/dev/null || true)"
  if grep -Eq '(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)=' <<<"$env_line"; then
    fail "$unit contains forbidden API-key environment material"
  fi
done
python3 - "$HOME/.hermes/config.yaml" <<'PY' || exit 1
import sys,yaml
cfg=yaml.safe_load(open(sys.argv[1],encoding='utf-8')) or {}
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
pass "subscription-only auth, fallback and packet-scoped VEKL external-skill configuration audit is green"

mkdir -p "$(dirname "$GATE")"
TMP="${GATE}.tmp.$$"
jq -n \
  --arg observed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg repo_head "$HEAD_SHA" \
  --arg fp_algorithm "$FINGERPRINT_ALGORITHM" \
  --arg fp_value "$FINGERPRINT_VALUE" \
  --argjson fp_objects "$FINGERPRINT_OBJECTS" \
  --arg installed_runtime_evidence "$QUAL" \
  --arg process_soak_evidence "$PROCESS" \
  --arg external_failover_evidence "$EXTERNAL" \
  --arg continuity_soak_evidence "$CONTINUITY" \
  '{
    schema_version:2,
    status:"PRODUCTION_GREEN",
    execution_origin:"EXTERNAL_ORACLE_ORCHESTRATOR",
    runtime_policy:"gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE",
    development_entrypoint:"dial-hermes-submit",
    direct_project_session_development_allowed:false,
    qualified_repo_head:$repo_head,
    control_plane_fingerprint:{algorithm:$fp_algorithm,value:$fp_value,objects:$fp_objects},
    installed_runtime_evidence:$installed_runtime_evidence,
    process_soak_evidence:$process_soak_evidence,
    external_failover_evidence:$external_failover_evidence,
    continuity_soak_evidence:$continuity_soak_evidence,
    project_isolated_qualification:true,
    shared_host_reboot_required:false,
    security_audit_green:true,
    auxiliary_operations_plane:true,
    auxiliary_operations_authority:"NON_AUTHORITATIVE_CONTROL_PLANE_OPERATIONS",
    auxiliary_api_can_authorize_development:false,
    persistent_mission_controller:true,
    chat_control_bridge:true,
    chat_control_project:"dial",
    chat_control_generic_shell_exposed:false,
    vekl_framework:true,
    vekl_policy_version:"vekl-1.0",
    vekl_packet_manifest_required:true,
    vekl_vendor_snapshots_immutable:true,
    vekl_unqualified_vendor_activation_allowed:false,
    observed_at:$observed_at
  }' >"$TMP"
chmod 600 "$TMP"
mv "$TMP" "$GATE"

UNBLOCK="$(mktemp)"
node agent-system/orchestration/development-unblock.mjs >"$UNBLOCK" || {
  cat "$UNBLOCK" >&2 || true
  rm -f "$UNBLOCK" "$GATE"
  fail "development-unblock gate did not accept the finalized evidence"
}
jq -e '.unblocked == true and .development_state == "DEVELOPMENT_RESUMABLE_THROUGH_EXTERNAL_HERMES"' "$UNBLOCK" >/dev/null || {
  cat "$UNBLOCK" >&2
  rm -f "$UNBLOCK" "$GATE"
  fail "development-unblock result was not green"
}
rm -f "$UNBLOCK"
pass "development is now resumable only through external Hermes orchestration"

echo
echo "EXTERNAL_HERMES_ORCHESTRATION=PRODUCTION_GREEN"
echo "DEVELOPMENT_ENTRYPOINT=dial-hermes-submit"
echo "QUALIFIED_REPO_HEAD=$HEAD_SHA"
echo "CONTROL_PLANE_FINGERPRINT=$FINGERPRINT_VALUE"
