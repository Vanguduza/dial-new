#!/usr/bin/env bash
set -euo pipefail
CONTROL_IP="${DIAL_CONTROL_OVERLAY_IP:-${DIAL_CONTROL_PRIVATE_IP:-}}"
WORKER_IP="${DIAL_WORKER_OVERLAY_IP:-${DIAL_WORKER_PRIVATE_IP:-}}"
ADMIN_IP="${DIAL_ADMIN_OVERLAY_IP:-${DIAL_ADMIN_PRIVATE_IP:-}}"
OUT="${1:-/etc/dial/fabric-nodes.json}"

[[ -n "$CONTROL_IP" ]] || { echo "DIAL_CONTROL_OVERLAY_IP (or legacy DIAL_CONTROL_PRIVATE_IP) required" >&2; exit 2; }
[[ -n "$WORKER_IP" ]] || { echo "DIAL_WORKER_OVERLAY_IP (or legacy DIAL_WORKER_PRIVATE_IP) required" >&2; exit 2; }
[[ -n "$ADMIN_IP" ]] || { echo "DIAL_ADMIN_OVERLAY_IP (or legacy DIAL_ADMIN_PRIVATE_IP) required" >&2; exit 2; }

sudo python3 - "$OUT" "$CONTROL_IP" "$WORKER_IP" "$ADMIN_IP" <<'PY'
import json, os, sys, time
out, control_ip, worker_ip, admin_ip = sys.argv[1:5]
payload = {
  "schema": "dial.fabric_nodes/v1",
  "fabric": "PROVIDER_FIRST_EXECUTION_FABRIC",
  "revision": "4.0",
  "network": "OWNER_APPROVED_PRIVATE_OVERLAY",
  "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  "nodes": [
    {
      "node_id": "dial-hermes-control",
      "role": "CONTROL_AUTHORITY",
      "private_ip": control_ip,
      "mcp": {"bind": control_ip, "port": 9133, "path": "private-capability"},
    },
    {
      "node_id": "vekl-worker",
      "role": "BACKGROUND_COORDINATOR",
      "private_ip": worker_ip,
      "mcp": {"client_of": "dial-hermes-control", "port": 9133},
    },
    {
      "node_id": "oracle-admin",
      "role": "RECOVERY_CONTROL_ONLY",
      "private_ip": admin_ip,
      "status": "LAST_SEEN_UNREACHABLE",
    },
  ],
}
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as fh:
    json.dump(payload, fh, indent=2)
    fh.write("\n")
print("PHASE3_NODES_REGISTERED", out)
print(json.dumps(payload, indent=2))
PY
sudo chmod 0644 "$OUT"
