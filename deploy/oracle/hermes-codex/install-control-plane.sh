#!/usr/bin/env bash
set -euo pipefail
umask 077

DIAL_REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export DIAL_REPO_DIR DIAL_CONTROL_HOME HERMES_HOME CODEX_HOME
fail(){ echo "ERROR: $*" >&2; exit 1; }
warn(){ echo "WARNING: $*" >&2; }

[[ -f "$DIAL_REPO_DIR/package.json" ]] || fail "DIAL repository not found at $DIAL_REPO_DIR"
for cmd in node codex hermes claude python3; do command -v "$cmd" >/dev/null || fail "$cmd is required"; done
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" -ge 22 ]] || fail "Node 22+ is required"

codex_version="$(codex --version 2>/dev/null || true)"
python3 - "$codex_version" <<'PY' || exit 1
import re,sys
m=re.search(r'(\d+)\.(\d+)\.(\d+)',sys.argv[1])
if not m or tuple(map(int,m.groups())) < (0,144,0):
    print(f"ERROR: Codex CLI >=0.144.0 required for GPT-5.6 Sol; found {sys.argv[1]!r}",file=sys.stderr); raise SystemExit(1)
PY

if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" ]]; then fail "Unset OPENAI_API_KEY/CODEX_API_KEY before installing the ChatGPT-subscription Hermes primary runtime."; fi
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then fail "Unset ANTHROPIC_API_KEY before installing the Claude-subscription Hermes fallback runtime."; fi
if [[ -f "$HERMES_HOME/.env" ]] && grep -Eq '^[[:space:]]*(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)[[:space:]]*=[[:space:]]*[^[:space:]#]+' "$HERMES_HOME/.env"; then fail "$HERMES_HOME/.env contains an API-key assignment for a subscription-only runtime."; fi

codex_status="$(codex login status 2>&1 || true)"
[[ "$codex_status" == *"Logged in using ChatGPT"* ]] || fail "Codex must use ChatGPT subscription OAuth. Current status: $codex_status"
claude auth status >/dev/null 2>&1 || fail "Claude Code must be authenticated through the supported Claude subscription route."

mkdir -p "$HERMES_HOME/agent-hooks" "$HOME/.config/systemd/user" "$CODEX_HOME" "$HOME/.local/bin"
chmod 700 "$HERMES_HOME" "$HERMES_HOME/agent-hooks" "$CODEX_HOME" "$HOME/.local/bin" 2>/dev/null || true

MEMORY="$HERMES_HOME/MEMORY.md"; touch "$MEMORY"
python3 - "$MEMORY" <<'PY'
import re,sys
p=sys.argv[1]; start='<!-- DIAL_HERMES_RUNTIME_BEGIN -->'; end='<!-- DIAL_HERMES_RUNTIME_END -->'
block=f'''{start}
DIAL Hermes external-runtime invariants:
- The DIAL repository, registries, tests and evidence are authoritative; memory never overrides them.
- Hermes is a persistent external runtime/control layer, not a second source of truth.
- Exact runtime chain: GPT-5.6 Sol through Codex App Server, then exact Claude Sonnet 5 through official Claude Code CLI, then fail closed.
- Discovered plan models are informational only and never become runtime fallbacks.
- Runtime fallback is an availability mechanism only and does not redefine DIAL development governance.
- Product development remains blocked until the external Oracle orchestrator reaches PRODUCTION_GREEN.
- Once green, development enters through dial-hermes-submit; direct project-session development is not the canonical path.
- Checkpoints, handoffs and Feature memory are continuity context and must be verified against current Git/canon.
- Never advance a DIAL gate from model prose, cached memory or a previous session alone.
- Never persist credentials, OAuth tokens, API keys, passwords, private SSH keys or secret environment files in DIAL/Hermes memory.
{end}'''
text=open(p,encoding='utf-8').read(); pat=re.compile(re.escape(start)+r'.*?'+re.escape(end),re.S)
text=pat.sub(block,text) if pat.search(text) else (text.rstrip()+'\n\n'+block+'\n').lstrip()
open(p,'w',encoding='utf-8').write(text)
PY
chmod 600 "$MEMORY"

install -m 0700 "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/hermes-hooks/dial-pre-turn-context.sh" "$HERMES_HOME/agent-hooks/dial-pre-turn-context.sh"
install -m 0700 "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/hermes-hooks/dial-post-turn-checkpoint.sh" "$HERMES_HOME/agent-hooks/dial-post-turn-checkpoint.sh"
PRE_HOOK="$HERMES_HOME/agent-hooks/dial-pre-turn-context.sh"; POST_HOOK="$HERMES_HOME/agent-hooks/dial-post-turn-checkpoint.sh"
CONFIG="$HERMES_HOME/config.yaml"; [[ -f "$CONFIG" ]] || printf '{}\n' >"$CONFIG"; chmod 600 "$CONFIG"
python3 - "$CONFIG" "$PRE_HOOK" "$POST_HOOK" <<'PY'
import sys,yaml
p,pre,post=sys.argv[1:]; cfg=yaml.safe_load(open(p,encoding='utf-8')) or {}; model=cfg.setdefault('model',{})
model['provider']='openai-codex'; model['default']='gpt-5.6-sol'; model['openai_runtime']='codex_app_server'; cfg['hooks_auto_accept']=False
model.pop('base_url', None)
cfg['fallback_providers']=[]; cfg.pop('fallback_model',None)
hooks=cfg.setdefault('hooks',{})
for event,command,timeout in [('pre_llm_call',pre,12),('post_llm_call',post,12)]:
    entries=[e for e in hooks.setdefault(event,[]) if not (isinstance(e,dict) and e.get('command')==command)]; entries.append({'command':command,'timeout':timeout}); hooks[event]=entries
with open(p,'w',encoding='utf-8') as f: yaml.safe_dump(cfg,f,sort_keys=False,allow_unicode=True)
PY

ALLOW="$HERMES_HOME/shell-hooks-allowlist.json"
python3 - "$ALLOW" "$PRE_HOOK" "$POST_HOOK" <<'PY'
import json,os,sys
p,pre,post=sys.argv[1:]
try: data=json.load(open(p,encoding='utf-8'))
except Exception: data={}
approvals=[x for x in data.get('approvals',[]) if isinstance(x,dict)]
for event,cmd in [('pre_llm_call',pre),('post_llm_call',post)]:
    if not any(a.get('event')==event and a.get('command')==cmd for a in approvals): approvals.append({'event':event,'command':cmd})
data['approvals']=approvals; os.makedirs(os.path.dirname(p),exist_ok=True)
with open(p,'w',encoding='utf-8') as f: json.dump(data,f,indent=2); f.write('\n')
PY
chmod 600 "$ALLOW"

CODEX_CONFIG="$CODEX_HOME/config.toml"; touch "$CODEX_CONFIG"; chmod 600 "$CODEX_CONFIG"
normalize_codex_config(){
  python3 - "$CODEX_CONFIG" <<'PY'
import re,sys
p=sys.argv[1]; text=open(p,encoding='utf-8').read()
for key,value in [('model','gpt-5.6-sol'),('default_permissions',':workspace')]:
    text=re.sub(rf'(?m)^(?!\s*#){re.escape(key)}\s*=.*\n?', '', text)
    text=f'{key} = "{value}"\n'+text
open(p,'w',encoding='utf-8').write(text)
PY
}
normalize_codex_config

cat >"$HOME/.local/bin/dial-hermes" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="${DIAL_REPO_DIR}"
export DIAL_CONTROL_HOME="${DIAL_CONTROL_HOME}"
exec "$(command -v node)" "${DIAL_REPO_DIR}/agent-system/orchestration/hermes-runtime-executor.mjs" "\$@"
EOF
chmod 0700 "$HOME/.local/bin/dial-hermes"

mkdir -p "$DIAL_CONTROL_HOME"; chmod 700 "$DIAL_CONTROL_HOME"
node "$DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs" init >/dev/null
NODE_BIN="$(command -v node)"; HERMES_BIN="$(command -v hermes)"
cat >"$HOME/.config/systemd/user/dial-hermes-runtime.service" <<EOF
[Unit]
Description=DIAL Hermes runtime supervisor
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
WorkingDirectory=$DIAL_REPO_DIR
Environment=DIAL_REPO_DIR=$DIAL_REPO_DIR
Environment=DIAL_CONTROL_HOME=$DIAL_CONTROL_HOME
Environment=HERMES_HOME=$HERMES_HOME
Environment=CODEX_HOME=$CODEX_HOME
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE_BIN $DIAL_REPO_DIR/agent-system/orchestration/supervisor.mjs daemon
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$DIAL_CONTROL_HOME $DIAL_REPO_DIR $HERMES_HOME $CODEX_HOME -$HOME/.claude -$HOME/.config/claude
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
Environment=HERMES_HOME=$HERMES_HOME
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$HERMES_BIN dashboard --host 127.0.0.1 --port 9119 --no-open
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now dial-hermes-runtime.service
if "$HERMES_BIN" dashboard --help >/dev/null 2>&1; then systemctl --user enable --now hermes-dial-dashboard.service || warn "Hermes dashboard could not start; session search remains degraded."; fi

hermes gateway install || warn "Hermes gateway install did not complete; run it manually after authentication."
GATEWAY_UNIT="$(systemctl --user list-unit-files --type=service --no-legend 2>/dev/null | awk 'tolower($1) ~ /hermes.*gateway|gateway.*hermes/ {print $1; exit}')"
if [[ -n "$GATEWAY_UNIT" ]]; then
  mkdir -p "$HOME/.config/systemd/user/${GATEWAY_UNIT}.d"
  cat >"$HOME/.config/systemd/user/${GATEWAY_UNIT}.d/dial-recovery.conf" <<'EOF'
[Unit]
StartLimitIntervalSec=0
[Service]
Restart=on-failure
RestartSec=5
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$GATEWAY_UNIT" || warn "Hermes gateway unit $GATEWAY_UNIT could not be enabled yet."
else
  warn "Hermes gateway systemd unit was not discovered; process-recovery soak will remain blocked until it exists."
  hermes gateway start || warn "Hermes gateway did not start yet; start it after runtime activation."
fi
normalize_codex_config

bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-external-orchestrator.sh"
bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-operations-plane.sh"
bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-chat-control-bridge.sh"

cat <<'EOF'

DIAL HERMES CONTROL PLANE INSTALLED

Runtime chain is locked to:
  GPT-5.6 Sol / Codex App Server
  -> Claude Sonnet 5 / official Claude Code
  -> NO_HERMES_RUNTIME_AVAILABLE

The external Oracle orchestrator, non-authoritative auxiliary operations plane, persistent mission controller and DIAL-only Claude chat control bridge are installed, but PRODUCT DEVELOPMENT REMAINS BLOCKED.
The only pre-green queued action permitted is the fixed read-only/no-tools qualification canary.

NEXT REQUIRED INTERACTIVE HERMES ACTION:
  Start Hermes in the canonical DIAL repository configured by DIAL_REPO_DIR and run:
    /codex-runtime codex_app_server
  Exit that cached session and start a fresh Hermes session.

After live subscription capacity is available, execute in order:
  bash deploy/oracle/hermes-codex/qualify-control-plane.sh
  bash deploy/oracle/hermes-codex/soak-control-plane.sh process
  bash deploy/oracle/hermes-codex/soak-external-orchestrator.sh
  bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-pre
  sudo reboot
  # reconnect
  bash deploy/oracle/hermes-codex/soak-control-plane.sh reboot-post
  bash deploy/oracle/hermes-codex/finalize-control-plane.sh

Only after finalization prints EXTERNAL_HERMES_ORCHESTRATION=PRODUCTION_GREEN may
Dial development resume, and the canonical development entrypoint is then:
  dial-hermes-submit "<development instruction>"

Do not deliberately exhaust subscription quota to manufacture a provider failure.
EOF
