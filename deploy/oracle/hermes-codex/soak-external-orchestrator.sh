#!/usr/bin/env bash
set -euo pipefail
umask 077
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
EVIDENCE_DIR="$DIAL_CONTROL_HOME/evidence-cache/soak"
export DIAL_REPO_DIR DIAL_CONTROL_HOME

fail(){ echo "EXTERNAL SOAK RED: $*" >&2; exit 1; }
pass(){ echo "✓ $*"; }
stamp(){ date -u +%Y%m%dT%H%M%SZ; }
now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }

cd "$DIAL_REPO_DIR"
mkdir -p "$EVIDENCE_DIR"; chmod 700 "$EVIDENCE_DIR" 2>/dev/null || true
for cmd in node jq git systemctl pgrep codex claude hermes; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done
[[ -x "$HOME/.local/bin/dial-hermes-submit" ]] || fail "dial-hermes-submit is not installed"
[[ -x "$HOME/.local/bin/dial-hermes-job" ]] || fail "dial-hermes-job is not installed"
systemctl --user is-active --quiet dial-hermes-orchestrator.service || fail "dial-hermes-orchestrator.service is not active"
systemctl --user is-active --quiet dial-hermes-runtime.service || fail "dial-hermes-runtime.service is not active"

node agent-system/orchestration/claude-code-probe.mjs >/dev/null
node agent-system/orchestration/codex-app-server-probe.mjs >/dev/null
selected="$(npm run --silent agent:orchestration:select-runtime)"
jq -e '.selected == true and .selection.runtime == "codex_app_server" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol"' <<<"$selected" >/dev/null || { echo "$selected" >&2; fail "fresh probes did not establish Sol before external failover soak"; }
pass "fresh exact Sol and Sonnet identities are available before external failover soak"

submit="$($HOME/.local/bin/dial-hermes-submit --requested-by qualification --qualification-canary 'Reply with exactly DIAL_EXTERNAL_ORCHESTRATOR_OK. Do not modify files and do not use tools.')"
job_id="$(jq -r '.job_id // empty' <<<"$submit")"
[[ -n "$job_id" ]] || { echo "$submit" >&2; fail "qualification canary did not return a job id"; }

orchestrator_pid="$(systemctl --user show dial-hermes-orchestrator.service -p MainPID --value)"
[[ "$orchestrator_pid" =~ ^[1-9][0-9]*$ ]] || fail "DIAL external orchestrator has no live MainPID"
find_descendant_codex(){
  python3 - "$orchestrator_pid" <<'PYDESC'
import re, subprocess, sys
root=int(sys.argv[1])
rows=[]
for line in subprocess.check_output(['ps','-eo','pid=,ppid=,args='], text=True).splitlines():
    parts=line.strip().split(None,2)
    if len(parts)<3: continue
    try: pid,ppid=int(parts[0]),int(parts[1])
    except ValueError: continue
    rows.append((pid,ppid,parts[2]))
children={}
for pid,ppid,args in rows: children.setdefault(ppid,[]).append(pid)
desc=set(); stack=[root]
while stack:
    parent=stack.pop()
    for child in children.get(parent,[]):
        if child not in desc:
            desc.add(child); stack.append(child)
for pid,ppid,args in rows:
    if pid in desc and re.search(r'codex.*app-server', args, re.I):
        print(pid); break
PYDESC
}
killed_pid=""
deadline=$((SECONDS + 60))
while (( SECONDS < deadline )); do
  killed_pid="$(find_descendant_codex || true)"
  [[ "$killed_pid" =~ ^[1-9][0-9]*$ ]] && break
  sleep 0.1
done
[[ "$killed_pid" =~ ^[1-9][0-9]*$ ]] || fail "could not observe a Codex App Server descendant owned by the DIAL external orchestrator"
kill -KILL "$killed_pid"
pass "DIAL-orchestrator-owned Codex App Server process was SIGKILLed; unrelated project Codex processes were not targeted"

result=""
state=""
deadline=$((SECONDS + 600))
while (( SECONDS < deadline )); do
  result="$($HOME/.local/bin/dial-hermes-job "$job_id")"
  state="$(jq -r '.state // empty' <<<"$result")"
  [[ "$state" == "COMPLETED" || "$state" == "FAILED" ]] && break
  sleep 2
done
[[ "$state" == "COMPLETED" ]] || { echo "$result" >&2; fail "external queued turn did not recover and complete after Codex process death"; }
jq -e '
  .execution_origin == "EXTERNAL_ORACLE_ORCHESTRATOR"
  and .result.event == "HERMES_OPERATIONAL_TURN_COMPLETED"
  and .result.policy == "LOCKED_SOL_THEN_SONNET"
  and .result.runtime == "claude_code"
  and .result.requested_model == "claude-sonnet-5"
  and .result.resolved_model == "claude-sonnet-5"
  and .result.fallback_used == true
' <<<"$result" >/dev/null || { echo "$result" >&2; fail "external queued turn did not prove exact Sonnet 5 failover"; }
pass "same external queued job continued on exact Claude Sonnet 5"

node agent-system/orchestration/codex-app-server-probe.mjs >/dev/null
recovery="$(npm run --silent agent:orchestration:select-runtime)"
jq -e '.selected == true and .selection.runtime == "codex_app_server" and .selection.requested_model == "gpt-5.6-sol" and .selection.resolved_model == "gpt-5.6-sol"' <<<"$recovery" >/dev/null || { echo "$recovery" >&2; fail "Sol did not regain preference after external failover soak"; }
pass "Sol regained preference after Codex recovery"

evidence="$EVIDENCE_DIR/external-failover-$(stamp).json"
jq -n \
  --arg observed_at "$(now)" \
  --arg repo_head "$(git rev-parse HEAD)" \
  --arg job_id "$job_id" \
  --arg killed_pid "$killed_pid" \
  '{
    schema_version:1,
    kind:"DIAL_HERMES_EXTERNAL_ORCHESTRATION_FAILOVER_SOAK",
    status:"GREEN",
    observed_at:$observed_at,
    repo_head:$repo_head,
    execution_origin:"EXTERNAL_ORACLE_ORCHESTRATOR",
    job_id:$job_id,
    project_isolated:true,
    unrelated_project_processes_targeted:false,
    actual_codex_app_server_sigkill:true,
    killed_codex_pid:$killed_pid,
    same_job_sonnet_fallback:true,
    sonnet_requested_model:"claude-sonnet-5",
    sonnet_resolved_model:"claude-sonnet-5",
    sol_recovery_proven:true
  }' >"$evidence"
chmod 600 "$evidence"

echo
echo "EXTERNAL_ORCHESTRATION_FAILOVER_SOAK=GREEN"
echo "EVIDENCE=$evidence"
