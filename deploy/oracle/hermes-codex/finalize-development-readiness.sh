#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
EVIDENCE_DIR="$DIAL_CONTROL_HOME/evidence-cache/readiness"
GATE="$DIAL_CONTROL_HOME/state/external-orchestration-gate.json"
mkdir -p "$EVIDENCE_DIR"; chmod 700 "$EVIDENCE_DIR" 2>/dev/null || true
cd "$DIAL_REPO_DIR"

fail(){ echo "DEVELOPMENT READINESS RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
tmp(){ mktemp; }
now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
stamp(){ date -u +%Y%m%dT%H%M%SZ; }

[[ -z "$(git status --porcelain)" ]] || fail "repository must be clean before readiness evidence is issued"
HEAD_SHA="$(git rev-parse HEAD)"
FINGERPRINT_JSON="$(node agent-system/orchestration/development-unblock.mjs --fingerprint)"
FINGERPRINT_VALUE="$(jq -r '.value // empty' <<<"$FINGERPRINT_JSON")"
[[ -n "$FINGERPRINT_VALUE" ]] || fail "control-plane fingerprint unavailable"
MISSION="$(node agent-system/orchestration/mission-controller.mjs status)"
case "$(jq -r '.state // empty' <<<"$MISSION")" in PAUSED|BLOCKED_OWNER|WAITING_RUNTIME) ;; *) fail "root mission must be non-running during readiness finalization" ;; esac

npm run verify >/dev/null
pass "full repository verification is green at $HEAD_SHA"

bash deploy/oracle/hermes-codex/install-engineering-research.sh >/dev/null
for unit in dial-hermes-runtime.service dial-hermes-orchestrator.service dial-hermes-operations.service dial-chat-control.service dial-mission-controller.service; do
  systemctl --user restart "$unit"
  systemctl --user is-active --quiet "$unit" || fail "$unit did not restart"
done
systemctl --user is-active --quiet dial-engineering-research.timer || fail "engineering research timer inactive"
systemctl --user is-active --quiet dial-engineering-research.path || fail "engineering research path inactive"
pass "DIAL-only control services are running current committed code"

[[ -x "$HOME/.local/bin/dial-doctor" && -x "$HOME/.local/bin/dial" ]] || fail "dial doctor is not installed; run install-control-plane.sh"
DOCTOR="$(tmp)"; "$HOME/.local/bin/dial" doctor >"$DOCTOR"
jq -e '.ok_for_hermes_runtime_qualification == true and .diagnostic_scope == "DIAL_PLUS_SUBORDINATE_HERMES" and .native_hermes_doctor.kind == "DIAL_SUBORDINATE_HERMES_DOCTOR" and .native_hermes_doctor.authority == "DIAGNOSTIC_EVIDENCE_ONLY" and .native_hermes_doctor.usable_for_dial_qualification == true and .native_hermes_doctor.mutating_mode_requested == false and .native_hermes_doctor.live_probe_requested == false' "$DOCTOR" >/dev/null || { cat "$DOCTOR" >&2; fail "federated DIAL/Hermes doctor is not usable"; }
HERMES_NATIVE_DOCTOR_STATUS="$(jq -r '.native_hermes_doctor.status' "$DOCTOR")"
HERMES_NATIVE_DOCTOR_HASH="$(jq -r '.native_hermes_doctor.report_sha256' "$DOCTOR")"
pass "DIAL doctor with subordinate native Hermes doctor ($HERMES_NATIVE_DOCTOR_STATUS)"

CODEX="$(tmp)"; node agent-system/orchestration/codex-app-server-probe.mjs >"$CODEX" || true
jq -e '.requested_model=="gpt-5.6-sol" and .resolved_model=="gpt-5.6-sol" and .identity_proven==true and (.state=="ACCOUNT_LIMITED" or .state=="RATE_LIMITED" or .state=="MODEL_LIMITED")' "$CODEX" >/dev/null || { cat "$CODEX" >&2; fail "fallback readiness requires exact Sol identity with a temporary provider limitation; if Sol is healthy run full production qualification instead"; }
pass "exact Sol identity is proven and current primary limitation is eligible for failover"

CLAUDE="$(tmp)"; node agent-system/orchestration/claude-code-probe.mjs >"$CLAUDE"
jq -e '.state=="HEALTHY" and .requested_model=="claude-sonnet-5" and .resolved_model=="claude-sonnet-5" and .identity_proven==true and .response_ok==true' "$CLAUDE" >/dev/null || { cat "$CLAUDE" >&2; fail "exact Sonnet fallback is not healthy"; }
pass "exact Claude Sonnet 5 fallback is live"

# Reuse a current semantic forecast when the preceding qualification attempt already
# produced one. If the forecast is stale/meaningfully invalidated, refreshAheadOfWorkResearch
# will run the appropriate exact model; an active Sol cooldown routes that refresh directly
# to Sonnet without spending another primary inference.
RESEARCH="$(tmp)"; npm run --silent agent:research:refresh >"$RESEARCH"
jq -e '.state=="READY" and (.items|length)>=3 and (.items|length)<=5 and .resource_cache_count>0 and .runtime_provenance.runtime=="claude_code" and .runtime_provenance.requested_model=="claude-sonnet-5" and .runtime_provenance.resolved_model=="claude-sonnet-5" and .runtime_provenance.identity_proven==true' "$RESEARCH" >/dev/null || { cat "$RESEARCH" >&2; fail "project-aware ahead-of-work Sonnet research forecast is not live/ready"; }
pass "project-aware VEKL ahead-of-work forecast is live through exact Sonnet"

VEKL="$(tmp)"; node agent-system/bin/skills-live-canary.mjs --fallback-only >"$VEKL"
jq -e '.status=="GREEN" and .kind=="DIAL_VEKL_LIVE_FALLBACK_CANARY" and .primary.requested_model=="gpt-5.6-sol" and .primary.identity_proven==true and (.primary.state=="ACCOUNT_LIMITED" or .primary.state=="RATE_LIMITED" or .primary.state=="MODEL_LIMITED") and .fallback.resolved_model=="claude-sonnet-5" and .fallback_activation_proven==true and .exact_hashes_preserved==true and .federated_resource_provenance_preserved==true' "$VEKL" >/dev/null || { cat "$VEKL" >&2; fail "VEKL exact fallback activation canary is not green"; }
pass "VEKL exact skill/resource provenance survives the live Sonnet fallback path"

CANARY_SUBMIT="$(tmp)"
"$HOME/.local/bin/dial-hermes-submit" --requested-by qualification --qualification-canary 'Reply with exactly DIAL_EXTERNAL_ORCHESTRATOR_OK. Do not modify files and do not use tools.' >"$CANARY_SUBMIT"
CANARY_ID="$(jq -r '.job_id // empty' "$CANARY_SUBMIT")"; [[ -n "$CANARY_ID" ]] || fail "external canary did not queue"
CANARY="$(tmp)"; state=""; deadline=$((SECONDS+600))
while (( SECONDS < deadline )); do
  "$HOME/.local/bin/dial-hermes-job" "$CANARY_ID" >"$CANARY"
  state="$(jq -r '.state // empty' "$CANARY")"
  [[ "$state" == "COMPLETED" || "$state" == "FAILED" ]] && break
  sleep 2
done
[[ "$state" == "COMPLETED" ]] || { cat "$CANARY" >&2; fail "external fallback canary did not complete"; }
jq -e '.execution_origin=="EXTERNAL_ORACLE_ORCHESTRATOR" and .result.event=="HERMES_OPERATIONAL_TURN_COMPLETED" and .result.runtime=="claude_code" and .result.requested_model=="claude-sonnet-5" and .result.resolved_model=="claude-sonnet-5" and .result.fallback_used==true' "$CANARY" >/dev/null || { cat "$CANARY" >&2; fail "external queue did not execute through exact Sonnet fallback"; }
pass "external Oracle queue executes a real fallback canary through exact Sonnet"

bash deploy/oracle/hermes-codex/soak-control-plane.sh continuity >/dev/null
CONTINUITY="$(ls -1t "$DIAL_CONTROL_HOME"/evidence-cache/soak/continuity-*.json 2>/dev/null | head -n1)"
[[ -n "$CONTINUITY" && -f "$CONTINUITY" ]] || fail "continuity evidence missing"
jq -e --arg head "$HEAD_SHA" '.status=="GREEN" and .repo_head==$head and .project_isolated==true and .dial_services_recovered==true and .chat_control_recovered==true and .engineering_research_scheduler_recovered==true and .mission_state_survived==true and .shared_hermes_gateway_disrupted==false and .unrelated_project_services_touched==false' "$CONTINUITY" >/dev/null || { cat "$CONTINUITY" >&2; fail "DIAL-only continuity soak is not green for current HEAD"; }
pass "DIAL-only mission/control/research continuity is green"

# Continuity restarts the orchestrator; require its fresh heartbeat before issuing the gate.
deadline=$((SECONDS+30)); while (( SECONDS < deadline )); do
  age="$(node -e 'const fs=require("fs");try{const h=JSON.parse(fs.readFileSync(process.argv[1]));console.log(Date.now()-Date.parse(h.observed_at||""))}catch{console.log(999999999)}' "$DIAL_CONTROL_HOME/state/external-orchestrator-heartbeat.json")"
  [[ "$age" =~ ^[0-9]+$ && "$age" -lt 120000 ]] && break
  sleep 1
done
[[ "$age" -lt 120000 ]] || fail "external orchestrator heartbeat is stale after continuity restart"

EVIDENCE="$EVIDENCE_DIR/development-ready-fallback-$(stamp).json"
PRIMARY_STATE="$(jq -r '.state' "$CODEX")"
FORECAST_ID="$(jq -r '.forecast_id' "$RESEARCH")"
VEKL_ACTIVATION="$(jq -r '.activation_id' "$VEKL")"
VEKL_EVIDENCE="$(jq -r '.evidence_path' "$VEKL")"
CONTINUITY_REL="$CONTINUITY"

jq -n \
  --arg observed_at "$(now)" --arg repo_head "$HEAD_SHA" \
  --argjson control_plane_fingerprint "$FINGERPRINT_JSON" \
  --arg primary_state "$PRIMARY_STATE" --arg canary_job_id "$CANARY_ID" \
  --arg hermes_native_doctor_status "$HERMES_NATIVE_DOCTOR_STATUS" \
  --arg hermes_native_doctor_hash "$HERMES_NATIVE_DOCTOR_HASH" \
  --arg forecast_id "$FORECAST_ID" --arg vekl_activation "$VEKL_ACTIVATION" \
  --arg vekl_evidence "$VEKL_EVIDENCE" --arg continuity_evidence "$CONTINUITY_REL" \
  '{schema_version:3,status:"DEVELOPMENT_READY_FALLBACK",development_only:true,production_certified:false,execution_origin:"EXTERNAL_ORACLE_ORCHESTRATOR",runtime_policy:"gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE",development_entrypoint:"dial-hermes-submit",direct_project_session_development_allowed:false,qualified_repo_head:$repo_head,control_plane_fingerprint:$control_plane_fingerprint,dial_doctor:{federated:true,hermes_native_subordinate:true,authority:"DIAGNOSTIC_EVIDENCE_ONLY",status:$hermes_native_doctor_status,report_sha256:$hermes_native_doctor_hash},primary:{runtime:"codex_app_server",requested_model:"gpt-5.6-sol",resolved_model:"gpt-5.6-sol",identity_proven:true,state:$primary_state},fallback:{runtime:"claude_code",requested_model:"claude-sonnet-5",resolved_model:"claude-sonnet-5",identity_proven:true,state:"HEALTHY"},external_fallback_canary:{completed:true,execution_origin:"EXTERNAL_ORACLE_ORCHESTRATOR",job_id:$canary_job_id,resolved_model:"claude-sonnet-5"},vekl:{policy_version:"vekl-2.0",live_fallback_canary:true,activation_id:$vekl_activation,evidence:$vekl_evidence,exact_hashes_preserved:true,federated_resource_provenance_preserved:true,ahead_of_work_forecast_ready:true,forecast_id:$forecast_id,forecast_runtime:"claude_code",forecast_resolved_model:"claude-sonnet-5"},continuity:{green:true,evidence:$continuity_evidence},repository_verification:{green:true},upgrade_required:{target:"PRODUCTION_GREEN",when:"exact GPT-5.6 Sol becomes healthy again",steps:["bash deploy/oracle/hermes-codex/qualify-control-plane.sh","bash deploy/oracle/hermes-codex/soak-control-plane.sh process","bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh","bash deploy/oracle/hermes-codex/soak-control-plane.sh continuity","bash deploy/oracle/hermes-codex/finalize-control-plane.sh"]},observed_at:$observed_at}' >"$EVIDENCE"
chmod 600 "$EVIDENCE"
cp "$EVIDENCE" "$GATE"; chmod 600 "$GATE"

node agent-system/orchestration/development-unblock.mjs >/dev/null || { cat "$GATE" >&2; fail "issued fallback readiness gate does not unblock development"; }
pass "development readiness gate is valid and external-Hermes development is resumable"

echo
echo "DIAL_DEVELOPMENT_READINESS=DEVELOPMENT_READY_FALLBACK"
echo "DEVELOPMENT_ENTRYPOINT=dial-hermes-submit"
echo "PRODUCTION_GREEN=false"
echo "PRIMARY_LIMITATION=$PRIMARY_STATE"
echo "ACTIVE_FALLBACK=claude-sonnet-5"
echo "EVIDENCE=$EVIDENCE"
echo "Full PRODUCTION_GREEN remains mandatory after Sol recovery; no production certification was fabricated."
