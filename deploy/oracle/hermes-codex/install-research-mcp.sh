#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/research-mcp-runtime"
DEST="${DIAL_RESEARCH_MCP_RUNTIME_DIR:-$HOME/.local/lib/dial-research-mcp-runtime}"
BIN_DIR="${DIAL_USER_BIN_DIR:-$HOME/.local/bin}"
for command in node npm install; do command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 2; }; done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" -ge 20 ]] || { echo "Node >=20 is required" >&2; exit 3; }
[[ -f "$SRC/package.json" && -f "$SRC/package-lock.json" ]] || { echo "research MCP lockfiles missing" >&2; exit 4; }
[[ -r "$SRC/exa-remote-stdio-bridge.mjs" ]] || { echo "Exa remote stdio bridge missing" >&2; exit 5; }
mkdir -p "$DEST" "$BIN_DIR"
install -m 0644 "$SRC/package.json" "$DEST/package.json"
install -m 0644 "$SRC/package-lock.json" "$DEST/package-lock.json"
install -m 0755 "$SRC/exa-remote-stdio-bridge.mjs" "$DEST/exa-remote-stdio-bridge.mjs"
(
  cd "$DEST"
  npm ci --ignore-scripts --no-audit --no-fund
)
node - "$DEST" <<'NODE'
const dest=process.argv[2];
const fs=require('fs');
const path=require('path');
const expected={'@upstash/context7-mcp':'4.1.1'};
for(const [pkg,version] of Object.entries(expected)){
  const actual=JSON.parse(fs.readFileSync(path.join(dest,'node_modules',pkg,'package.json'),'utf8')).version;
  if(actual!==version) throw new Error(`${pkg} expected ${version}, got ${actual}`);
}
NODE
install -m 0755 "$SRC/run-context7.sh" "$BIN_DIR/dial-context7-mcp"
install -m 0755 "$SRC/run-exa.sh" "$BIN_DIR/dial-exa-mcp"
"$BIN_DIR/dial-context7-mcp" --version | grep -Fx '4.1.1' >/dev/null
"$BIN_DIR/dial-exa-mcp" --version | grep -Fx 'dial-exa-remote-bridge/1' >/dev/null
printf 'Installed DIAL research MCP runtime: Context7 4.1.1 + Exa official remote bridge v1\n'
