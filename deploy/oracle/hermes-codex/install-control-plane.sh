#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-/srv/dial/repo}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME HERMES_HOME CODEX_HOME

fail(){ echo "ERROR: $*" >&2; exit 1; }
warn(){ echo "WARNING: $*" >&2; }

[[ -f "$DIAL_REPO_DIR/package.json" ]] || fail "DIAL repository not found at $DIAL_REPO_DIR"
command -v node >/dev/null || fail "node is required"
command -v codex >/dev/null || fail "codex is required"
command -v hermes >/dev/null || fail "hermes is required"
command -v python3 >/dev/null || fail "python3 is required"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" -ge 22 ]] || fail "Node 22+ is required"

codex_version="$(codex --version 2>/dev/null || true)"
python3 - "$codex_version" <<'PY' || exit 1
import re,sys
text=sys.argv[1]
m=re.search(r'(\d+)\.(\d+)\.(\d+)', text)
if not m or tuple(map(int,m.groups())) < (0,144,0):
    print(f"ERROR: Codex CLI >=0.144.0 required for GPT-5.6 Sol; found {text!r}", file=sys.stderr)
    raise SystemExit(1)
PY

# Subscription route guard. Ambient API-key credentials can silently change billing/auth mode.
if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" ]]; then
  fail "OPENAI_API_KEY/CODEX_API_KEY is present in this shell. Unset it before installing the ChatGPT-subscription Hermes primary runtime."
fi
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  fail "ANTHROPIC_API_KEY is present in this shell. Unset it before installing the Claude subscription Hermes fallback runtime."
fi
if [[ -f "$HERMES_HOME/.env" ]] && grep -Eq '^[[:space:]]*(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$HERMES_HOME/.env"; then
  fail "$HERMES_HOME/.env contains an API-key assignment for a subscription-only control-plane provider. Remove that assignment from the Hermes gateway environment before installation."
fi

codex_status="$(codex login status 2>&1 || true)"
if [[ "$codex_status" != *"Logged in using ChatGPT"* ]]; then
  fail "Codex must be logged in using ChatGPT subscription OAuth. Current status: $codex_status"
fi

mkdir -p "$HERMES_HOME/agent-hooks" "$HOME/.config/systemd/user" "$CODEX_HOME"
chmod 700 "$HERMES_HOME" "$HERMES_HOME/agent-hooks" "$CODEX_HOME" 2>/dev/null || true

# Stable Hermes memory contains only control-plane invariants. Rapidly changing
# work state lives in /var/lib/dial-control and is retrieved per turn.
MEMORY="$HERMES_HOME/MEMORY.md"
touch "$MEMORY"
python3 - "$MEMORY" <<'PY'
import re,sys
p=sys.argv[1]
start='<!-- DIAL_CONTROL_PLANE_BEGIN -->'
end='<!-- DIAL_CONTROL_PLANE_END -->'
block=f'''{start}
DIAL control-plane invariants:
- The DIAL repository, registries, tests and evidence are authoritative; memory never overrides them.
- Hermes runtime orchestration and DIAL software-development orchestration are separate systems.
- Hermes is availability-first: GPT-5.6 Sol via Codex App Server is the primary Hermes runtime model; Claude Sonnet 5 is the Hermes fallback runtime model.
- A Hermes runtime selection carries runtime-continuity authority only. Sonnet powering Hermes does NOT automatically authorise Sonnet to manage complex DIAL development.
- DIAL development orchestration is quality-first. Default Manager Chair families are Fable, Claude Opus and GPT Sol as dynamically registered and available.
- Sonnet, Terra, Luna and DeepSeek models are not default Manager Chair models; they may perform bounded work or become Manager Chair only through explicit user configuration.
- If no qualified Manager Chair is available, checkpoint and preserve the mission and pause complex development rather than lowering the quality floor.
- DeepSeek Harness remains a first-class bounded development execution harness.
- Model identity, runtime/harness identity, chat visibility and orchestration authority are separate concepts.
- Verify handoff capsules and retrieved memories against current Git/canon before acting.
- Never advance a DIAL gate from model prose or cached memory alone.
- Never put credentials, OAuth tokens, API keys or passwords into DIAL/Hermes memory.
{end}'''
text=open(p,'r',encoding='utf-8').read()
pat=re.compile(re.escape(start)+r'.*?'+re.escape(end),re.S)
if pat.search(text): text=pat.sub(block,text)
else: text=(text.rstrip()+'\n\n'+block+'\n').lstrip()
open(p,'w',encoding='utf-8').write(text)
PY
chmod 600 "$MEMORY"

# Install reviewed hooks into the Hermes-private hook directory.
install -m 0700 "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/hermes-hooks/dial-pre-turn-context.sh" \
  "$HERMES_HOME/agent-hooks/dial-pre-turn-context.sh"
install -m 0700 "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/hermes-hooks/dial-post-turn-checkpoint.sh" \
  "$HERMES_HOME/agent-hooks/dial-post-turn-checkpoint.sh"

PRE_HOOK="$HERMES_HOME/agent-hooks/dial-pre-turn-context.sh"
POST_HOOK="$HERMES_HOME/agent-hooks/dial-post-turn-checkpoint.sh"
CONFIG="$HERMES_HOME/config.yaml"
[[ -f "$CONFIG" ]] || printf '{}\n' >"$CONFIG"
chmod 600 "$CONFIG"

# Preserve existing Hermes configuration while locking the DIAL primary Hermes runtime and hooks.
python3 - "$CONFIG" "$PRE_HOOK" "$POST_HOOK" <<'PY'
import sys,yaml
p,pre,post=sys.argv[1:]
with open(p,'r',encoding='utf-8') as f:
    cfg=yaml.safe_load(f) or {}
model=cfg.setdefault('model',{})
model['provider']='openai-codex'
model['default']='gpt-5.6-sol'
model['openai_runtime']='codex_app_server'
cfg['hooks_auto_accept']=False
hooks=cfg.setdefault('hooks',{})

def install_hook(event, command, timeout):
    entries=hooks.setdefault(event,[])
    entries=[e for e in entries if not (isinstance(e,dict) and e.get('command')==command)]
    entries.append({'command':command,'timeout':timeout})
    hooks[event]=entries

install_hook('pre_llm_call',pre,12)
install_hook('post_llm_call',post,12)
with open(p,'w',encoding='utf-8') as f:
    yaml.safe_dump(cfg,f,sort_keys=False,allow_unicode=True)
PY
chmod 600 "$CONFIG"

# Manual exact-command hook allowlist for headless service use; preserve unrelated approvals.
ALLOW="$HERMES_HOME/shell-hooks-allowlist.json"
python3 - "$ALLOW" "$PRE_HOOK" "$POST_HOOK" <<'PY'
import json,os,sys
p,pre,post=sys.argv[1:]
try:
    with open(p,'r',encoding='utf-8') as f: data=json.load(f)
except Exception:
    data={}
approvals=[x for x in data.get('approvals',[]) if isinstance(x,dict)]
for event,cmd in [('pre_llm_call',pre),('post_llm_call',post)]:
    if not any(a.get('event')==event and a.get('command')==cmd for a in approvals):
        approvals.append({'event':event,'command':cmd})
data['approvals']=approvals
os.makedirs(os.path.dirname(p),exist_ok=True)
with open(p,'w',encoding='utf-8') as f: json.dump(data,f,indent=2); f.write('\n')
PY
chmod 600 "$ALLOW"

# Pin Sol in Codex user config outside Hermes' managed block. Replace a pre-existing
# top-level model/default_permissions assignment instead of creating invalid duplicates.
CODEX_CONFIG="$CODEX_HOME/config.toml"
touch "$CODEX_CONFIG"
chmod 600 "$CODEX_CONFIG"
python3 - "$CODEX_CONFIG" <<'PY'
import re,sys
p=sys.argv[1]
text=open(p,'r',encoding='utf-8').read()

def set_top(key,value):
    global text
    pat=re.compile(rf'(?m)^(?!\s*#){re.escape(key)}\s*=.*$')
    line=f'{key} = "{value}"'
    if pat.search(text): text=pat.sub(line,text,count=1)
    else: text=(line+'\n'+text)
set_top('model','gpt-5.6-sol')
set_top('default_permissions',':workspace')
open(p,'w',encoding='utf-8').write(text)
PY

# Persistent state/memory layout may already exist from bootstrap; enforce private ownership/modes.
mkdir -p "$DIAL_CONTROL_HOME"
chmod 700 "$DIAL_CONTROL_HOME"
node "$DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs" init >/dev/null

NODE_BIN="$(command -v node)"
HERMES_BIN="$(command -v hermes)"

cat >"$HOME/.config/systemd/user/dial-orchestrator.service" <<EOF
[Unit]
Description=DIAL deterministic orchestration supervisor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_CONTROL_HOME=$DIAL_CONTROL_HOME
ExecStart=$NODE_BIN $DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DIAL_CONTROL_HOME $DIAL_REPO_DIR

[Install]
WantedBy=default.target
EOF

cat >"$HOME/.config/systemd/user/hermes-dial-dashboard.service" <<EOF
[Unit]
Description=Hermes localhost dashboard/session-search backend for DIAL
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_CONTROL_HOME=$DIAL_CONTROL_HOME
ExecStart=$HERMES_BIN dashboard --host 127.0.0.1 --port 9119 --no-open
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now dial-orchestrator.service
# Dashboard is useful for FTS session retrieval but its optional web extra may be absent.
if "$HERMES_BIN" dashboard --help >/dev/null 2>&1; then
  systemctl --user enable --now hermes-dial-dashboard.service || warn "Hermes dashboard could not start; context broker will run without cross-session FTS until web extras are installed."
fi

# Hermes owns its gateway service. Installation is idempotent on supported Linux builds.
hermes gateway install || warn "Hermes gateway install did not complete. Run it manually after confirming Hermes authentication."
hermes gateway start || warn "Hermes gateway did not start yet; start it after completing the runtime activation step below."

# The documented runtime command performs MCP/plugin migration and takes effect next session.
# Config is already pinned here, but qualification must still prove the actual runtime/model.

echo
printf 'Hermes config:      %s\n' "$CONFIG"
printf 'Hermes memory:      %s\n' "$MEMORY"
printf 'Codex config:       %s\n' "$CODEX_CONFIG"
printf 'Control state:      %s\n' "$DIAL_CONTROL_HOME"
printf 'DIAL repo:          %s\n' "$DIAL_REPO_DIR"
printf 'Codex auth:         %s\n' "$codex_status"

echo
cat <<'EOF'
NEXT REQUIRED INTERACTIVE HERMES ACTION (one time):
  Start Hermes in /srv/dial/repo and run:
    /codex-runtime codex_app_server
  Then exit that cached session and start a fresh Hermes session.

This documented command is required because Hermes uses it to perform its supported
Codex MCP/plugin migration. The installer intentionally does not call private migration internals.

Then run:
  bash deploy/oracle/hermes-codex/qualify-control-plane.sh

Qualification treats these as separate gates:
  HERMES_RUNTIME_QUALIFICATION
  DEVELOPMENT_MANAGER_POLICY_QUALIFICATION
Passing Sonnet fallback runtime qualification never grants Sonnet Development Manager Chair authority.
EOF
