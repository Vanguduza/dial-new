#!/usr/bin/env bash
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { echo root-required >&2; exit 40; }
SRC="${1:-$(cd "$(dirname "$0")" && pwd)}"
BASE=/opt/dial-browser-runtime
STATE=/var/lib/dial-browser
if ! id dial-browser >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE" --shell /usr/sbin/nologin dial-browser
fi
install -d -o dial-browser -g dial-browser -m 0750 "$BASE" "$BASE/browsers" "$STATE" "$STATE/evidence" "$STATE/profiles" /var/log/dial-browser
install -d -o root -g root -m 0755 /etc/dial-browser
install -d -o dial-browser -g dial-browser -m 0700 "$STATE/secrets"
install -o dial-browser -g dial-browser -m 0644 "$SRC/package.json" "$BASE/package.json"
if [[ -f "$SRC/package-lock.json" ]]; then
  install -o dial-browser -g dial-browser -m 0644 "$SRC/package-lock.json" "$BASE/package-lock.json"
else
  rm -f "$BASE/package-lock.json"
fi
install -o dial-browser -g dial-browser -m 0755 "$SRC/server.mjs" "$BASE/server.mjs"
if [[ ! -s "$STATE/secrets/api.token" ]]; then
  umask 077
  openssl rand -hex 32 > "$STATE/secrets/api.token"
  chown dial-browser:dial-browser "$STATE/secrets/api.token"
fi
install -o root -g root -m 0640 "$SRC/runtime.env.example" /etc/dial-browser/runtime.env
if [[ -f "$BASE/package-lock.json" ]]; then
  sudo -u dial-browser npm --prefix "$BASE" ci --omit=dev --no-audit --no-fund
else
  sudo -u dial-browser npm --prefix "$BASE" install --omit=dev --no-audit --no-fund
fi
export PLAYWRIGHT_BROWSERS_PATH="$BASE/browsers"
"$BASE/node_modules/.bin/playwright" install-deps chromium
sudo -u dial-browser env PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_PATH" "$BASE/node_modules/.bin/playwright" install chromium
chown -R dial-browser:dial-browser "$BASE/browsers"
install -o root -g root -m 0644 "$SRC/systemd/dial-browser-fabric.service" /etc/systemd/system/dial-browser-fabric.service
systemctl daemon-reload
systemctl enable --now dial-browser-fabric.service
curl -fsS http://127.0.0.1:9150/healthz
