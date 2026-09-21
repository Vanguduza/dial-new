#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO_SLUG="${DIAL_GITHUB_REPOSITORY:-Vanguduza/dial-new}"
RUNNER_VERSION=2.337.0
RUNNER_SHA256=70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
RUNNER_USER=github-admin
RUNNER_HOME=/opt/actions-runner
DIAL_REPO="${DIAL_REPO_DIR:-$HOME/dial-new}"

fail(){ echo "ERROR: $*" >&2; exit 2; }
[[ "$(hostname)" == "dial-control" ]] || fail "must run on dial-control"
[[ "$(id -u)" -ne 0 ]] || fail "run as ubuntu, not root; sudo is used only for install steps"
command -v gh >/dev/null || fail "gh CLI required"
gh auth status >/dev/null 2>&1 || fail "authenticate GitHub first with: gh auth login --web"
gh api "repos/$REPO_SLUG" -q '.permissions.admin' | grep -qx true || fail "GitHub login must have repo admin permission"

sudo id "$RUNNER_USER" >/dev/null 2>&1 || sudo useradd --system --create-home --home-dir /home/$RUNNER_USER --shell /bin/bash "$RUNNER_USER"
sudo install -d -m 0755 -o "$RUNNER_USER" -g "$RUNNER_USER" "$RUNNER_HOME"
tmp="$(mktemp /tmp/actions-runner.XXXXXX.tar.gz)"
trap 'rm -f "$tmp"' EXIT
curl --proto '=https' --tlsv1.2 -fL --retry 3 -o "$tmp" "$RUNNER_URL"
echo "$RUNNER_SHA256  $tmp" | sha256sum -c -
sudo tar -xzf "$tmp" -C "$RUNNER_HOME"
sudo chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_HOME"

[[ -x "$DIAL_REPO/deploy/netcup/hermes-control/dial-github-admin" ]] || fail "root wrapper missing from DIAL repo"
sudo install -m 0755 -o root -g root "$DIAL_REPO/deploy/netcup/hermes-control/dial-github-admin" /usr/local/sbin/dial-github-admin
sudo tee /etc/sudoers.d/91-dial-github-admin >/dev/null <<'EOF'
github-admin ALL=(root) NOPASSWD: /usr/local/sbin/dial-github-admin
EOF
sudo chmod 0440 /etc/sudoers.d/91-dial-github-admin
sudo visudo -cf /etc/sudoers.d/91-dial-github-admin >/dev/null

token="$(gh api -X POST "repos/$REPO_SLUG/actions/runners/registration-token" -q '.token')"
[[ -n "$token" ]] || fail "could not obtain runner registration token"

if [[ -f "$RUNNER_HOME/.runner" ]]; then
  remove_token="$(gh api -X POST "repos/$REPO_SLUG/actions/runners/remove-token" -q '.token' 2>/dev/null || true)"
  if [[ -n "$remove_token" ]]; then
    sudo -u "$RUNNER_USER" bash -lc "cd '$RUNNER_HOME' && ./config.sh remove --unattended --token '$remove_token'" || true
  fi
fi

sudo -u "$RUNNER_USER" env RUNNER_ALLOW_RUNASROOT=0 bash -lc   "cd '$RUNNER_HOME' && ./config.sh --unattended --replace --disableupdate     --url 'https://github.com/$REPO_SLUG' --token '$token'     --name 'dial-control-admin'     --labels 'netcup-admin,dial-control,dial-hermes-control,control-authority'     --work '_work'"

sudo bash -lc "cd '$RUNNER_HOME' && ./svc.sh install '$RUNNER_USER'"
sudo bash -lc "cd '$RUNNER_HOME' && ./svc.sh start"
sleep 3
sudo bash -lc "cd '$RUNNER_HOME' && ./svc.sh status"

echo "GITHUB_ADMIN_RUNNER=GREEN"
echo "runner=dial-control-admin"
echo "IMPORTANT: in GitHub Settings -> Environments create/protect 'netcup-admin' and require owner approval."
