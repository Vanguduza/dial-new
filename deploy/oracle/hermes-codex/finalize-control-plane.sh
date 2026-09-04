#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
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

QUAL="$(latest "$QUAL_DIR"/installed-runtime-*.json)"
PROCESS="$(latest "$SOAK_DIR"/process-*.json)"
REBOOT="$(latest "$SOAK_DIR"/reboot-*.json)"
[[ -n "$QUAL" && -f "$QUAL" ]] || fail "installed-runtime qualification evidence is missing"
[[ -n "$PROCESS" && -f "$PROCESS" ]] || fail "process-soak evidence is missing"
[[ -n "$REBOOT" && -f "$REBOOT" ]] || fail "reboot-soak evidence is missing"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .sol_identity_proven == true
  and .sonnet_identity_proven == true
  and .external_orchestration_canary == true
  and .runtime_policy == "gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE"
' "$QUAL" >/dev/null || fail "installed-runtime qualification evidence is not green for current HEAD"
pass "installed Sol, Sonnet and external orchestration canary are proven"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .actual_codex_app_server_sigkill == true
  and .sonnet_fallback_identity_proven == true
  and .sol_recovery_proven == true
' "$PROCESS" >/dev/null || fail "process-soak evidence is not green for current HEAD"
pass "actual Codex process death, Sonnet fallback and Sol recovery are proven"

jq -e --arg head "$HEAD_SHA" '
  .status == "GREEN"
  and .repo_head == $head
  and .actual_reboot_proven == true
  and .hot_warm_cold_survived == true
  and .services_recovered == true
  and .sol_preference_recovered == true
' "$REBOOT" >/dev/null || fail "reboot-soak evidence is not green for current HEAD"
pass "actual reboot and persistent control-plane continuity are proven"

systemctl --user is-active --quiet dial-hermes-runtime.service || fail "dial-hermes-runtime.service is not active"
systemctl --user is-active --quiet dial-hermes-orchestrator.service || fail "dial-hermes-orchestrator.service is not active"
pass "persistent supervisor and external orchestrator services are active"

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
for unit in dial-hermes-runtime.service dial-hermes-orchestrator.service; do
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
PY
pass "subscription-only auth and fallback configuration security audit is green"

mkdir -p "$(dirname "$GATE")"
TMP="${GATE}.tmp.$$"
jq -n \
  --arg observed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg repo_head "$HEAD_SHA" \
  --arg installed_runtime_evidence "$QUAL" \
  --arg process_soak_evidence "$PROCESS" \
  --arg reboot_soak_evidence "$REBOOT" \
  '{
    schema_version:1,
    status:"PRODUCTION_GREEN",
    execution_origin:"EXTERNAL_ORACLE_ORCHESTRATOR",
    runtime_policy:"gpt-5.6-sol -> claude-sonnet-5 -> NO_HERMES_RUNTIME_AVAILABLE",
    development_entrypoint:"dial-hermes-submit",
    direct_project_session_development_allowed:false,
    repo_head:$repo_head,
    installed_runtime_evidence:$installed_runtime_evidence,
    process_soak_evidence:$process_soak_evidence,
    reboot_soak_evidence:$reboot_soak_evidence,
    security_audit_green:true,
    observed_at:$observed_at
  }' >"$TMP"
chmod 600 "$TMP"
mv "$TMP" "$GATE"

node agent-system/orchestration/development-unblock.mjs >/tmp/dial-hermes-unblock.json || {
  cat /tmp/dial-hermes-unblock.json >&2 || true
  rm -f "$GATE"
  fail "development-unblock gate did not accept the finalized evidence"
}
rm -f /tmp/dial-hermes-unblock.json
pass "development is now resumable only through external Hermes orchestration"

echo
echo "EXTERNAL_HERMES_ORCHESTRATION=PRODUCTION_GREEN"
echo "DEVELOPMENT_ENTRYPOINT=dial-hermes-submit"
echo "REPO_HEAD=$HEAD_SHA"
