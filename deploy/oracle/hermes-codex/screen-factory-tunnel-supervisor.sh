#!/usr/bin/env bash
set -euo pipefail

CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-/home/ubuntu/bin/cloudflared}"
PUBLIC_ENTRY_DIR="${PUBLIC_ENTRY_DIR:-/var/lib/dial-control/screen-factory/public-entry}"
ORIGIN_URL="${DIAL_SCREEN_FACTORY_PUBLIC_ORIGIN:-http://127.0.0.1:9122}"
ENDPOINT_FILE="$PUBLIC_ENTRY_DIR/endpoint.json"

publish_endpoint() {
  local base_url="$1"
  ( cd "$PUBLIC_ENTRY_DIR" && git pull --rebase origin main >/dev/null 2>&1 ) || true
  local rc=0
  python3 - "$ENDPOINT_FILE" "$base_url" <<'PY' || rc=$?
import json,sys,datetime,pathlib
p=pathlib.Path(sys.argv[1]); base=sys.argv[2]
current={}
if p.exists():
    try: current=json.loads(p.read_text())
    except Exception: current={}
if current.get('base_url') == base:
    raise SystemExit(2)
data={'base_url':base,'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'authority':'DIAL_HEALTH_SCREEN_FACTORY_TUNNEL_SUPERVISOR'}
p.write_text(json.dumps(data,indent=2)+'\n')
PY
  if [ "$rc" -eq 2 ]; then return 0; fi
  if [ "$rc" -ne 0 ]; then return "$rc"; fi
  (
    cd "$PUBLIC_ENTRY_DIR"
    git add endpoint.json
    if ! git diff --cached --quiet; then
      git commit -m "Update live Screen Factory tunnel endpoint" >/dev/null
      git push origin main >/dev/null
    fi
  )
  echo "Published Screen Factory endpoint: $base_url"
}

[ -x "$CLOUDFLARED_BIN" ] || { echo "cloudflared not found: $CLOUDFLARED_BIN" >&2; exit 1; }
[ -d "$PUBLIC_ENTRY_DIR/.git" ] || { echo "public entry repo missing: $PUBLIC_ENTRY_DIR" >&2; exit 1; }

set +e
"$CLOUDFLARED_BIN" tunnel --no-autoupdate --url "$ORIGIN_URL" 2>&1 | while IFS= read -r line; do
  printf '%s\n' "$line"
  if [[ "$line" =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
    publish_endpoint "${BASH_REMATCH[1]}"
  fi
done
rc=${PIPESTATUS[0]}
set -e
exit "$rc"
