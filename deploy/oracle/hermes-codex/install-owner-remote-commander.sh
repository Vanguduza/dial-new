#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${DIAL_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
EXPECTED_HOST="${DIAL_HERMES_HOST_ID:-dial-hermes-control}"
PREFIX="${DIAL_OWNER_COMMANDER_PREFIX:-$HOME/.local/share/dial/desktop-commander}"
SPEC="$REPO_DIR/deploy/oracle/provisioning/commander-runtime"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT="dial-owner-commander-remote.service"
SLICE="dial-owner-commander.slice"

fail(){ echo "ERROR: $*" >&2; exit 1; }

# The control role runs on the Oracle A1 (dial-hermes-control) or, after migration, on Netcup (dial-control).
[[ "$(hostname)" == "$EXPECTED_HOST" || "$(hostname)" == dial-control ]] || fail "must run on $EXPECTED_HOST or dial-control; got $(hostname)"
command -v npm >/dev/null 2>&1 || fail "npm is required"
command -v node >/dev/null 2>&1 || fail "node is required"
[[ -f "$SPEC/package.json" && -f "$SPEC/package-lock.json" ]] || fail "canonical Commander lock files missing"

locked_version="$(node -e 'const p=require(process.argv[1]); process.stdout.write(p.packages["node_modules/@wonderwhy-er/desktop-commander"]?.version||"")' "$SPEC/package-lock.json")"
[[ "$locked_version" == "0.2.50" ]] || fail "Commander lock version mismatch: $locked_version"

mkdir -p "$PREFIX" "$UNIT_DIR" "$HOME/.desktop-commander-device"
chmod 700 "$HOME/.desktop-commander-device"
cp "$SPEC/package.json" "$PREFIX/package.json"
cp "$SPEC/package-lock.json" "$PREFIX/package-lock.json"
lock_hash="$(sha256sum "$SPEC/package-lock.json" | awk '{print $1}')"
marker="$PREFIX/.package-lock.sha256"
if [[ ! -x "$PREFIX/node_modules/.bin/desktop-commander" || ! -f "$marker" || "$(cat "$marker" 2>/dev/null || true)" != "$lock_hash" ]]; then
  npm --prefix "$PREFIX" ci --ignore-scripts --no-fund --no-audit
  printf '%s' "$lock_hash" > "$marker"
fi

DIAL_COMMANDER_PREFIX="$PREFIX" bash "$REPO_DIR/deploy/oracle/provisioning/commander-session-persistence-patch.sh"

install -m 0644 "$REPO_DIR/deploy/oracle/hermes-codex/systemd/$SLICE" "$UNIT_DIR/$SLICE"
install -m 0644 "$REPO_DIR/deploy/oracle/hermes-codex/systemd/$UNIT" "$UNIT_DIR/$UNIT"

mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/dial-owner-commander-pair" <<WRAP
#!/usr/bin/env bash
exec bash "$REPO_DIR/deploy/oracle/hermes-codex/pair-owner-remote-commander.sh" "\$@"
WRAP
cat > "$HOME/.local/bin/dial-owner-commander-probe" <<WRAP
#!/usr/bin/env bash
exec bash "$REPO_DIR/deploy/oracle/hermes-codex/probe-owner-remote-commander.sh" "\$@"
WRAP
cat > "$HOME/.local/bin/dial-owner-hermes" <<WRAP
#!/usr/bin/env bash
exec node "$REPO_DIR/agent-system/orchestration/desktop-commander-owner-dispatch.mjs" "\$@"
WRAP
chmod 0755 "$HOME/.local/bin/dial-owner-commander-pair" "$HOME/.local/bin/dial-owner-commander-probe" "$HOME/.local/bin/dial-owner-hermes"

systemctl --user daemon-reload
systemctl --user enable "$UNIT" >/dev/null
if [[ -s "$HOME/.desktop-commander-device/device.json" ]]; then
  chmod 600 "$HOME/.desktop-commander-device/device.json"
  systemctl --user restart "$UNIT"
else
  echo "PAIRING_REQUIRED: run dial-owner-commander-pair once under the owner Commander account."
fi

echo "OWNER_COMMANDER_INSTALL=GREEN"
echo "unit=$UNIT"
echo "prefix=$PREFIX"
