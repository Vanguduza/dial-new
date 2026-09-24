#!/usr/bin/env bash
set -euo pipefail
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
OUT="${1:-$CONTROL/state/fabric-rev4-qualifier.json}"
HOSTS_JSON="$REPO/deploy/oracle/resource-fabric/hosts.json"
cd "$REPO"
notes=()
status=GREEN
fail(){ status=RED; notes+=("$1"); }

[[ "$(hostname)" == "${DIAL_HERMES_HOST_ID:-dial-hermes-control}" || "$(hostname)" == dial-control ]] || fail "wrong control host"
[[ -f /etc/dial/host-role ]] && grep -q 'ROLE=CONTROL_AUTHORITY' /etc/dial/host-role || fail "host-role missing or not CONTROL_AUTHORITY"
for slice in dial-hermes.slice dial-survival.slice dial-dev.slice dial-commander.slice; do
  systemctl is-active --quiet "$slice" || fail "$slice inactive"
done
uid="$(id -u)"
[[ "$(systemctl show "user@${uid}.service" -p Slice --value 2>/dev/null)" == "dial-hermes.slice" ]] || fail "user@${uid} not in dial-hermes.slice"
[[ "$(systemctl show ssh.service -p Slice --value 2>/dev/null)" == "dial-survival.slice" ]] || fail "ssh not in dial-survival.slice"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/${uid}}"
for svc in dial-remote-mcp-relay.service dial-private-mcp-bind.service dial-venue-guard.service; do
  systemctl --user is-active --quiet "$svc" || fail "$svc inactive"
done
[[ -f /etc/dial/provider-registry.json ]] || fail "provider registry missing"
[[ -f "$CONTROL/secrets/venue-ed25519.pub" && -f "$CONTROL/secrets/venue-ed25519.pem" ]] || fail "venue signing keys missing"
[[ -f "$CONTROL/execution/fabric-audit.jsonl" ]] || fail "fabric audit ledger missing"
[[ -s "$CONTROL/secrets/remote-mcp-capability" ]] || fail "private MCP capability missing"
command -v docker >/dev/null || fail "docker missing"
docker image inspect dial/toolbox:2026.09 >/dev/null 2>&1 || fail "toolbox image missing"
expected_cpu="$(jq -r '.hosts[] | select(.host_id=="dial-hermes-control") | .cpu_total // empty' "$HOSTS_JSON" 2>/dev/null)"
[[ "$expected_cpu" =~ ^[0-9]+$ ]] || fail "control CPU topology missing from hosts.json"
[[ "$(nproc)" -eq "$expected_cpu" ]] || fail "control host CPU shape drifted: live=$(nproc) topology=$expected_cpu"

node --check agent-system/orchestration/provider-first-hermes-executor.mjs >/dev/null || fail "provider-first Hermes executor syntax invalid"
grep -q "executeProviderFirstHermesInstruction" agent-system/orchestration/external-orchestrator.mjs || fail "external orchestrator bypasses provider-first admission"
grep -q "executeProviderFirstHermesInstruction" agent-system/orchestration/owner-live-control.mjs || fail "owner-live path bypasses provider-first admission"

if [[ "${DIAL_REQUIRE_FABRIC_UNIT_TESTS:-0}" == "1" ]]; then
  if [[ -x "$REPO/node_modules/.bin/vitest" ]]; then
    "$REPO/node_modules/.bin/vitest" run tests/orchestration-execution-fabric.test.mjs tests/orchestration-provider-first-runtime.test.mjs || fail "fabric unit tests failed"
  else
    fail "unit-test qualification requested but test runner is not installed"
  fi
fi

NOTE_JSON="$(printf '%s\n' "${notes[@]+"${notes[@]}"}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')"
python3 - "$status" "$OUT" "$NOTE_JSON" <<'PY'
import json,os,sys
status,out,notes=sys.argv[1],sys.argv[2],json.loads(sys.argv[3] or "[]")
payload={
  "status":status,
  "fabric":"PROVIDER_FIRST_EXECUTION_FABRIC",
  "revision":"4.0",
  "hostname":os.uname().nodename,
  "topology":"HYBRID_CLOUD_THREE_NODE_ACTIVE",
  "mandatory_hermes_admission":True,
  "unit_tests_required":os.environ.get("DIAL_REQUIRE_FABRIC_UNIT_TESTS","0")=="1",
  "notes":notes,
}
open(out,"w").write(json.dumps(payload,indent=2)+"\n")
print(json.dumps(payload,indent=2))
raise SystemExit(0 if status=="GREEN" else 1)
PY
