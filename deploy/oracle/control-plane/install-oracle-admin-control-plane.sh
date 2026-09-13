#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "$(hostname)" == "oracle-admin" ]] || { echo 'REFUSE: installer is only for oracle-admin' >&2; exit 3; }

SRC="${DIAL_CONTROL_PLANE_SRC:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
DEST="${DIAL_CONTROL_PLANE_HOME:-$HOME/.local/lib/dial-control-plane}"
BIN="$HOME/.local/bin"
STATE="$HOME/.local/state/dial-control-plane"
DC_CONFIG="$HOME/.claude-server-commander/config.json"
mkdir -p "$DEST" "$BIN" "$STATE"
chmod 700 "$DEST" "$BIN" "$STATE"

for f in CONTROL_PLANE_REGISTRY.json hybrid-router.mjs guarded-command.mjs owner-channel-adapter.mjs mcp-server.mjs ssh-semantic-executor.mjs audit-ledger.mjs certify-control-plane.mjs dial-guarded-bash; do
  install -m 700 "$SRC/$f" "$DEST/$f"
done

cat >"$BIN/dial-control-mcp" <<EOF
#!/usr/bin/env bash
exec /usr/bin/node "$DEST/mcp-server.mjs"
EOF
cat >"$BIN/dial-control-certify" <<EOF
#!/usr/bin/env bash
exec /usr/bin/node "$DEST/certify-control-plane.mjs"
EOF
chmod 700 "$BIN/dial-control-mcp" "$BIN/dial-control-certify"

python3 - "$DC_CONFIG" "$DEST/dial-guarded-bash" "$DEST" "$STATE" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); shell=sys.argv[2]; dest=sys.argv[3]; state=sys.argv[4]
cfg=json.loads(p.read_text())
blocked=set(cfg.get('blockedCommands',[]))
blocked.update(['npm','npx','pnpm','yarn','bun','deno','vitest','jest','tsc','gradle','gradlew','docker','podman','make','cmake','gcc','g++','clang','clang++','cargo','rustc','go','javac','kotlinc','mvn','mvnw'])
cfg['blockedCommands']=sorted(blocked)
cfg['defaultShell']=shell
# Admin Commander may touch only its own control/recovery state. The DIAL checkout is intentionally excluded.
cfg['allowedDirectories']=sorted(set([
  dest, state,
  str(Path.home()/'.claude-server-commander'),
  str(Path.home()/'.desktop-commander-device'),
  str(Path.home()/'.config/systemd/user'),
  '/opt/dial-recovery/commander'
]))
tmp=p.with_suffix('.tmp'); tmp.write_text(json.dumps(cfg,indent=2)+'\n'); tmp.replace(p)
PY

export DIAL_CONTROL_AUDIT_LOG="$STATE/policy-ledger.jsonl"
node "$DEST/certify-control-plane.mjs"
node "$DEST/audit-ledger.mjs" "$DIAL_CONTROL_AUDIT_LOG"
echo "CONTROL_PLANE_INSTALLED host=$(hostname) mcp=$BIN/dial-control-mcp"
