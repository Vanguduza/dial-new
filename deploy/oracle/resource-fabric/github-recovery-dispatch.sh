#!/usr/bin/env bash
# Fixed GitHub Actions entrypoint for the recovery plane. No command payload is accepted.
set -euo pipefail
umask 077

ACTION="${DIAL_RECOVERY_ACTION:-}"
TARGET="${DIAL_RECOVERY_TARGET:-}"
RUN_ID="${DIAL_RECOVERY_RUN_ID:-unknown}"
ACTOR="${DIAL_RECOVERY_ACTOR:-unknown}"
REASON="${DIAL_RECOVERY_REASON:-}"
SELF="$(hostname)"

case "$ACTION" in probe|status|restart-recovery-agent|restart-host-agent) ;; *) exit 64 ;; esac
case "$TARGET" in oracle-admin|vekl-worker|dial-hermes-control) ;; *) exit 64 ;; esac
[[ "$TARGET" != "$SELF" ]] || { echo 'self-recovery refused: reciprocal peer required' >&2; exit 65; }
[[ ${#REASON} -le 512 ]] || { echo 'reason too long' >&2; exit 64; }

# Bind to the canonical role graph before any peer operation.
case "$SELF:$TARGET" in
  oracle-admin:vekl-worker|oracle-admin:dial-hermes-control|dial-hermes-control:oracle-admin) ;;
  *) echo "recovery edge refused: $SELF -> $TARGET" >&2; exit 65 ;;
esac

FABRIC_ENV=/etc/dial-recovery/fabric.env
[[ -r "$FABRIC_ENV" ]] && set -a && . "$FABRIC_ENV" && set +a
REPO="${DIAL_REPO_DIR:-$HOME/dial-new}"
AGENT="$REPO/deploy/oracle/resource-fabric/recovery-agent.mjs"
[[ -r "$AGENT" ]] || { echo 'canonical recovery agent unavailable' >&2; exit 66; }

export DIAL_GH_RECOVERY_AGENT="$AGENT"
export DIAL_GH_RECOVERY_SELF="$SELF"
export DIAL_GH_RECOVERY_TARGET="$TARGET"
export DIAL_GH_RECOVERY_ACTION="$ACTION"
RESULT="$(node --input-type=module <<'NODE'
const m = await import(`file://${process.env.DIAL_GH_RECOVERY_AGENT}`);
const self = process.env.DIAL_GH_RECOVERY_SELF;
const target = process.env.DIAL_GH_RECOVERY_TARGET;
const action = process.env.DIAL_GH_RECOVERY_ACTION;
let result;
if (action === 'probe' || action === 'status') result = m.probeTarget(target);
else {
  const service = action === 'restart-recovery-agent' ? 'dial-recovery-agent.service' : 'dial-host-agent.timer';
  result = m.restartApprovedService(target, service, { hostId: self });
}
process.stdout.write(JSON.stringify({self,target,action,result}));
NODE
)"

RECEIPTS=/var/lib/dial-fabric/github-recovery-receipts
mkdir -p "$RECEIPTS"
export DIAL_GH_RECOVERY_RESULT="$RESULT" DIAL_GH_RECOVERY_RUN_ID="$RUN_ID" DIAL_GH_RECOVERY_ACTOR="$ACTOR" DIAL_GH_RECOVERY_REASON="$REASON" DIAL_GH_RECOVERY_RECEIPTS="$RECEIPTS"
node --input-type=module <<'NODE'
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const result=JSON.parse(process.env.DIAL_GH_RECOVERY_RESULT);
const receipt={schema_version:1,run_id:process.env.DIAL_GH_RECOVERY_RUN_ID,actor:process.env.DIAL_GH_RECOVERY_ACTOR,reason:process.env.DIAL_GH_RECOVERY_REASON,observed_at:new Date().toISOString(),...result};
const canonical=JSON.stringify(receipt); receipt.sha256=crypto.createHash('sha256').update(canonical).digest('hex');
const safe=String(receipt.run_id).replace(/[^0-9A-Za-z_.-]/g,'_');
fs.writeFileSync(path.join(process.env.DIAL_GH_RECOVERY_RECEIPTS,`${safe}.json`),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
process.stdout.write(JSON.stringify(receipt));
NODE
