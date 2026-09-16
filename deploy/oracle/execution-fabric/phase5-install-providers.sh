#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${DIAL_REPO_DIR:-/home/ubuntu/dial-new}"
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
NODE="$(command -v node)"

sudo install -d -m 0755 /etc/dial
sudo install -m 0644 "$HERE/provider-registry.json" /etc/dial/provider-registry.json
sudo install -m 0644 "$HERE/project-binding.example.json" /etc/dial/project-binding.example.json
install -d -m 0700 "$CONTROL/secrets" "$CONTROL/execution" "$CONTROL/state"
if [[ ! -e "$CONTROL/execution/fabric-audit.jsonl" ]]; then
  install -m 0600 /dev/null "$CONTROL/execution/fabric-audit.jsonl"
else
  chmod 0600 "$CONTROL/execution/fabric-audit.jsonl"
fi
if command -v chattr >/dev/null 2>&1; then
  sudo chattr +a "$CONTROL/execution/fabric-audit.jsonl" 2>/dev/null || true
fi

if [[ ! -s "$CONTROL/secrets/venue-ed25519.pem" || ! -s "$CONTROL/secrets/venue-ed25519.pub" ]]; then
  command -v openssl >/dev/null 2>&1 || { echo "openssl required for venue signing keys" >&2; exit 2; }
  umask 077
  openssl genpkey -algorithm ED25519 -out "$CONTROL/secrets/venue-ed25519.pem"
  openssl pkey -in "$CONTROL/secrets/venue-ed25519.pem" -pubout -out "$CONTROL/secrets/venue-ed25519.pub"
  chmod 0600 "$CONTROL/secrets/venue-ed25519.pem"
  chmod 0644 "$CONTROL/secrets/venue-ed25519.pub"
fi

install -d -m 0700 "$HOME/.config/systemd/user" "$HOME/.local/bin"
cat >"$HOME/.config/systemd/user/dial-venue-guard.service" <<EOF
[Unit]
Description=DIAL venue-decision guard heartbeat
After=network-online.target
[Service]
Type=simple
Environment=DIAL_CONTROL_HOME=$CONTROL
Environment=DIAL_REPO_DIR=$REPO
Environment=PATH=$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin
UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY
ExecStart=$NODE $HERE/dial-venue-guard-daemon.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadOnlyPaths=$REPO
ReadWritePaths=$CONTROL
[Install]
WantedBy=default.target
EOF

cat >"$HOME/.local/bin/dial-venue-admit" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="$REPO"
export DIAL_CONTROL_HOME="$CONTROL"
export DIAL_PROVIDER_REGISTRY="/etc/dial/provider-registry.json"
export DIAL_HOST_ROLE_FILE="/etc/dial/host-role"
exec "$NODE" "$HERE/dial-venue-admit.mjs" "\$@"
EOF
chmod 0700 "$HOME/.local/bin/dial-venue-admit"

cat >"$HOME/.local/bin/dial-local-sandbox-run" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DIAL_REPO_DIR="$REPO"
export DIAL_CONTROL_HOME="$CONTROL"
exec "$NODE" "$HERE/dial-local-sandbox-run.mjs" "\$@"
EOF
chmod 0700 "$HOME/.local/bin/dial-local-sandbox-run"

systemctl --user daemon-reload
systemctl --user enable --now dial-venue-guard.service
sleep 1
systemctl --user is-active --quiet dial-venue-guard.service
printf 'PHASE5_PROVIDERS_INSTALLED guard=%s registry=/etc/dial/provider-registry.json\n' "$(systemctl --user is-active dial-venue-guard.service)"
echo 'PHASE5_CLOUDFLARE_ACCESS=NOT_CONFIGURED owner action required'
echo 'PHASE5_LIVE_ORCHESTRATOR_ADMISSION=PROVIDER_FIRST_HERMES_EXECUTOR'
