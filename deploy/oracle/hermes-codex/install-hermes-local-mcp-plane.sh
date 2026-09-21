#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
HERMES_CONFIG="${HERMES_CONFIG:-${HERMES_HOME}/config.yaml}"
HERMES_DIR="${HERMES_AGENT_DIR:-${HERMES_HOME}/hermes-agent}"
EXPECTED_HOST="${DIAL_HERMES_HOST_ID:-dial-hermes-control}"
COMMANDER_PKG='@wonderwhy-er/desktop-commander@0.2.50'
COMMANDER_PREFIX="${DIAL_LOCAL_COMMANDER_PREFIX:-$HOME/.local/share/dial/desktop-commander}"
COMMANDER_WRAPPER="${DIAL_LOCAL_COMMANDER_WRAPPER:-$HOME/.local/bin/dial-local-commander-mcp}"
COMMANDER_SPEC="$REPO_DIR/deploy/oracle/provisioning/commander-runtime"

DRY_RUN=0
ALLOW_MISSING_CLIENTS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --allow-missing-clients) ALLOW_MISSING_CLIENTS=1 ;;
    *) echo "usage: $0 [--dry-run] [--allow-missing-clients]" >&2; exit 2 ;;
  esac
done

fail(){ echo "ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preflight. Every prerequisite -- including those belonging to the operator
# gateway installer invoked at the end -- is checked before the Hermes config is
# touched. A late hard failure would otherwise leave the host half-applied: the
# local Commander registered but the typed client MCPs absent, which is exactly
# the state the qualifier reports as RED.
# ---------------------------------------------------------------------------
[[ "$(hostname)" == "$EXPECTED_HOST" ]] || fail "must run on ${EXPECTED_HOST}; got $(hostname)"
command -v npm >/dev/null 2>&1 || fail "npm is required for the pinned local Desktop Commander MCP runtime"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"
python3 -c 'import yaml' 2>/dev/null || fail "python3 PyYAML is required (apt-get install -y python3-yaml)"
[[ -f "$HERMES_CONFIG" ]] || fail "Hermes config missing: $HERMES_CONFIG"

for script in install-operator-gateway.sh install-chat-control-bridge.sh; do
  [[ -f "$REPO_DIR/deploy/oracle/hermes-codex/$script" ]] || fail "DIAL installer missing: $script"
done
for mod in operator-control-stdio whatsapp-hermes-operator owner-live-control \
           owner-steering-broker whatsapp-owner-input whatsapp-operator-adapter; do
  [[ -f "$REPO_DIR/agent-system/orchestration/${mod}.mjs" ]] || fail "gateway prerequisite missing: ${mod}.mjs"
done
[[ -f "$HERMES_DIR/scripts/whatsapp-bridge/bridge.js" ]] || \
  fail "Hermes WhatsApp bridge missing: $HERMES_DIR/scripts/whatsapp-bridge/bridge.js (required by install-operator-gateway.sh)"

# The qualifier fails closed unless both typed client MCPs are enrolled, and the
# gateway installer registers each one only when its CLI is on PATH. Missing
# binaries would therefore surface as an opaque qualification RED rather than as
# the installation gap it actually is.
MISSING_CLIENTS=()
command -v codex  >/dev/null 2>&1 || MISSING_CLIENTS+=(codex)
command -v claude >/dev/null 2>&1 || MISSING_CLIENTS+=(claude)
if (( ${#MISSING_CLIENTS[@]} > 0 )); then
  if (( ALLOW_MISSING_CLIENTS )); then
    echo "WARNING: client CLI not on PATH: ${MISSING_CLIENTS[*]} -- qualification will report RED until enrolled." >&2
  else
    fail "client CLI not on PATH: ${MISSING_CLIENTS[*]}. Install them (they must resolve for the owning user, not only for root), or re-run with --allow-missing-clients to proceed deliberately."
  fi
fi
[[ -f "$COMMANDER_SPEC/package.json" && -f "$COMMANDER_SPEC/package-lock.json" ]] || fail "canonical Commander lock files missing"
locked_version="$(node -e 'const p=require(process.argv[1]); process.stdout.write(p.packages["node_modules/@wonderwhy-er/desktop-commander"]?.version||"")' "$COMMANDER_SPEC/package-lock.json")"
[[ "$locked_version" == "0.2.50" ]] || fail "Commander lock version mismatch: $locked_version"
mkdir -p "$COMMANDER_PREFIX" "$(dirname "$COMMANDER_WRAPPER")"
cp "$COMMANDER_SPEC/package.json" "$COMMANDER_PREFIX/package.json"
cp "$COMMANDER_SPEC/package-lock.json" "$COMMANDER_PREFIX/package-lock.json"
lock_hash="$(sha256sum "$COMMANDER_SPEC/package-lock.json" | awk '{print $1}')"
marker="$COMMANDER_PREFIX/.package-lock.sha256"
if [[ ! -x "$COMMANDER_PREFIX/node_modules/.bin/desktop-commander" || ! -f "$marker" || "$(cat "$marker" 2>/dev/null || true)" != "$lock_hash" ]]; then
  npm --prefix "$COMMANDER_PREFIX" ci --ignore-scripts --no-fund --no-audit
  printf '%s' "$lock_hash" > "$marker"
  chmod 0644 "$marker"
fi
cat > "$COMMANDER_WRAPPER" <<WRAPPER
#!/usr/bin/env bash
set -euo pipefail
exec "$COMMANDER_PREFIX/node_modules/.bin/desktop-commander" "\$@"
WRAPPER
chmod 0755 "$COMMANDER_WRAPPER"
echo "Preflight passed; pinned full Commander runtime is installed."

# ---------------------------------------------------------------------------
# Register the subordinate FULL-CAPABILITY Commander under mcp_servers.
#
# The live Hermes config is edited in place by splicing only this one block. A
# full YAML round-trip would silently discard operator comments, anchors and
# merge keys, so the surrounding bytes are preserved verbatim. The result is
# re-parsed and compared against the original before anything is written, and a
# timestamped backup is taken whenever a write actually happens.
# ---------------------------------------------------------------------------
DIAL_DRY_RUN="$DRY_RUN" python3 - "$HERMES_CONFIG" "$COMMANDER_WRAPPER" <<'PY'
import os, re, sys, shutil, tempfile, datetime, yaml

path, wrapper = sys.argv[1], sys.argv[2]
dry = os.environ.get('DIAL_DRY_RUN') == '1'
KEY, PARENT = 'dial_local_commander', 'mcp_servers'

spec = {
    'command': wrapper,
    'args': [],
    'enabled': True,
    'connect_timeout': 20,
    'timeout': 600,
    'supports_parallel_tool_calls': False,
}

def indent_of(line): return len(line) - len(line.lstrip(' '))
def is_blank(line): return line.strip() == '' or line.lstrip().startswith('#')

def render(indent):
    body = yaml.safe_dump({KEY: spec}, sort_keys=False, default_flow_style=False, width=10**6)
    pad = ' ' * indent
    return ''.join(pad + l if l.strip() else l for l in body.splitlines(keepends=True))

def splice(text):
    lines = text.splitlines(keepends=True)
    if lines and not lines[-1].endswith('\n'):
        lines[-1] += '\n'
    pi = next((i for i, l in enumerate(lines) if re.match(r'^%s\s*:' % PARENT, l)), None)
    if pi is None:
        sep = '' if (not lines or lines[-1].strip() == '') else '\n'
        return ''.join(lines) + sep + '%s:\n' % PARENT + render(2)
    m = re.match(r'^(%s\s*:)([^\n]*)\n$' % PARENT, lines[pi])
    tail = m.group(2).strip() if m else ''
    if tail in ('{}', '~', 'null', ''):
        lines[pi] = '%s:\n' % PARENT
    elif not tail.startswith('#'):
        sys.exit('ERROR: %s has an unsupported inline value: %r' % (PARENT, tail))
    end = pi + 1
    while end < len(lines) and (is_blank(lines[end]) or indent_of(lines[end]) > 0):
        end += 1
    while end > pi + 1 and is_blank(lines[end - 1]):
        end -= 1
    child = next((indent_of(l) for l in lines[pi + 1:end] if not is_blank(l)), 2)
    ki = next((i for i in range(pi + 1, end)
               if indent_of(lines[i]) == child and re.match(r'^\s*%s\s*:' % KEY, lines[i])), None)
    block = render(child)
    if ki is None:
        return ''.join(lines[:end]) + block + ''.join(lines[end:])
    ke = ki + 1
    while ke < end and (is_blank(lines[ke]) or indent_of(lines[ke]) > child):
        ke += 1
    return ''.join(lines[:ki]) + block + ''.join(lines[ke:])

with open(path, encoding='utf-8') as f:
    original = f.read()
try:
    before = yaml.safe_load(original) or {}
except Exception as exc:
    sys.exit('ERROR: refusing to touch unparseable Hermes config: %s' % exc)
if not isinstance(before, dict):
    sys.exit('ERROR: Hermes config root is not a mapping')

updated = splice(original)

# Verify the edit did exactly what was intended, before committing it to disk.
after = yaml.safe_load(updated) or {}
if (after.get(PARENT) or {}).get(KEY) != spec:
    sys.exit('ERROR: post-splice verification failed; config left untouched')
if {k: v for k, v in before.items() if k != PARENT} != {k: v for k, v in after.items() if k != PARENT}:
    sys.exit('ERROR: splice altered unrelated configuration; config left untouched')
if {k: v for k, v in (before.get(PARENT) or {}).items() if k != KEY} != \
   {k: v for k, v in (after.get(PARENT) or {}).items() if k != KEY}:
    sys.exit('ERROR: splice altered sibling MCP servers; config left untouched')

if updated == original:
    print('Hermes config already matches the pinned full-capability Commander surface; no change.')
    sys.exit(0)
if dry:
    print('DRY RUN: would add/refresh %s.%s in %s (no write performed).' % (PARENT, KEY, path))
    sys.exit(0)

stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = '%s.dial-bak-%s' % (path, stamp)
shutil.copy2(path, backup)
os.chmod(backup, 0o600)

st = os.stat(path)
fd, tmp = tempfile.mkstemp(prefix='.config.yaml.', dir=os.path.dirname(path) or '.', text=True)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(updated); f.flush(); os.fsync(f.fileno())
    os.chmod(tmp, st.st_mode & 0o7777)
    try:
        os.chown(tmp, st.st_uid, st.st_gid)
    except PermissionError:
        pass
    os.replace(tmp, path)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
print('Hermes config updated. Rollback: cp %s %s' % (backup, path))
PY

if (( DRY_RUN )); then
  echo 'DRY RUN: skipping install-operator-gateway.sh.'
  exit 0
fi

# Claude Code and Codex receive only the typed DIAL operator MCP. They do not
# receive a direct Desktop Commander registration. Hermes owns the full subordinate
# local Commander capability surface and remains the sole project authority.
bash "$REPO_DIR/deploy/oracle/hermes-codex/install-operator-gateway.sh"

# Do not disable the owner-facing remote Commander on dial-hermes-control.
# The outer remote device is transport into Hermes; this local child MCP is Hermes'
# actuator. They have distinct identities and may coexist.

GATEWAY_UNIT="$(systemctl --user list-unit-files --type=service --no-legend 2>/dev/null | awk 'tolower($1) ~ /hermes.*gateway|gateway.*hermes/ {print $1; exit}')"
[[ -n "$GATEWAY_UNIT" ]] || fail "Hermes gateway systemd unit not found"
systemctl --user restart "$GATEWAY_UNIT"
sleep 3
systemctl --user is-active --quiet "$GATEWAY_UNIT" || fail "Hermes gateway did not return active after local MCP activation"

echo 'Hermes local MCP plane installed.'
echo '- Claude Code -> dial-oracle-control (typed DIAL MCP)'
echo '- Codex       -> dial-oracle-control (typed DIAL MCP)'
echo '- Hermes      -> dial_local_commander (local FULL Desktop Commander MCP)'
echo '- Owner       -> dial-owner-commander-remote.service (remote transport into Hermes, when paired)'
echo '- Recovery    -> GitHub + OCI Run Command; oracle-admin is not a normal project entry point'
