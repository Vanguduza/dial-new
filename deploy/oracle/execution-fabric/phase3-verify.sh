#!/usr/bin/env bash
set -euo pipefail
WORKER_IP="${DIAL_WORKER_PRIVATE_IP:-}"
OUT="${1:-/var/lib/dial-control/state/fabric-rev2-phase3.json}"
notes=()
status=GREEN
fail(){ status=RED; notes+=("$1"); }

[[ -n "$WORKER_IP" ]] || fail "DIAL_WORKER_PRIVATE_IP unset"
[[ -f /etc/dial/host-role ]] && grep -q 'ROLE=CONTROL_AUTHORITY' /etc/dial/host-role || fail "control host-role missing"
[[ -f /etc/dial/fabric-nodes.json ]] || fail "fabric-nodes.json missing"
grep -q 'vekl-worker' /etc/dial/fabric-nodes.json || fail "vekl-worker not in fabric-nodes.json"
systemctl --user is-active --quiet dial-private-mcp-bind.service || fail "private MCP bind inactive"
curl -fsS --max-time 5 http://10.0.0.184:9133/health >/tmp/phase3-mcp-health.json || fail "private MCP health failed"
if [[ -n "$WORKER_IP" ]]; then
  ping -c 1 -W 3 "$WORKER_IP" >/tmp/phase3-ping.txt || fail "worker $WORKER_IP ping failed"
  ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new "ubuntu@${WORKER_IP}" 'set -e; hostname | grep -qx vekl-worker; grep -q ROLE=BACKGROUND_COORDINATOR /etc/dial/host-role; systemctl is-active --quiet dial-survival.slice; systemctl is-active --quiet dial-node.slice; systemctl --user is-active --quiet dial-background-coordinator.service; test -f /var/lib/dial-worker/state/background-coordinator.json; python3 -c "import json; p=json.load(open(\"/var/lib/dial-worker/state/background-coordinator.json\")); assert p.get(\"heavy_local_rejected\"); assert p.get(\"local_heavy_compute\") is False"' >/tmp/phase3-worker.txt 2>&1 || fail "worker private SSH/role/coordinator check failed: $(tr '\n' ' ' </tmp/phase3-worker.txt | head -c 300)"
fi

NOTE_JSON="$(printf '%s\n' "${notes[@]+"${notes[@]}"}" | python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))')"
python3 - "$status" "$OUT" "$NOTE_JSON" "${WORKER_IP:-}" <<'PY'
import json, os, sys
status, out, notes, worker_ip = sys.argv[1], sys.argv[2], json.loads(sys.argv[3] or "[]"), sys.argv[4]
def read(path):
    try:
        return open(path).read()
    except Exception:
        return None
payload = {
  "status": status,
  "phase": 3,
  "fabric": "PROVIDER_FIRST_EXECUTION_FABRIC",
  "revision": "2.0",
  "hostname": os.uname().nodename,
  "worker_private_ip": worker_ip or None,
  "role_file": read("/etc/dial/host-role"),
  "fabric_nodes": read("/etc/dial/fabric-nodes.json"),
  "private_mcp_health": read("/tmp/phase3-mcp-health.json"),
  "notes": notes,
}
open(out, "w").write(json.dumps(payload, indent=2) + "\n")
print(json.dumps(payload, indent=2))
raise SystemExit(0 if status == "GREEN" else 1)
PY
