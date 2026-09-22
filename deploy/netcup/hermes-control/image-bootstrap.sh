#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DIAL_BOOTSTRAP_REF:?DIAL_BOOTSTRAP_REF must be an exact 40-hex commit SHA}"
[[ "$DIAL_BOOTSTRAP_REF" =~ ^[0-9a-f]{40}$ ]] || { echo "REFUSE: DIAL_BOOTSTRAP_REF must be 40 hex" >&2; exit 2; }

export DEBIAN_FRONTEND=noninteractive
HOST=dial-control
CANONICAL_HOST_ID=dial-hermes-control
DISPLAY_NAME='Dial Control'
ADMIN=ubuntu
HOME_DIR=/home/$ADMIN
REPO=$HOME_DIR/dial-new
STATE=/var/lib/dial-control/bootstrap

install -d -m 0700 "$STATE"
stage() {
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$1" >"$STATE/stage"
  echo "IMAGE_BOOTSTRAP_STAGE=$1"
}
stage IMAGE_STARTED

. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo "Ubuntu 24.04 required" >&2; exit 2; }
case "$(uname -m)" in x86_64|amd64) ;; *) echo "x86_64 required" >&2; exit 2;; esac

hostnamectl set-hostname "$HOST"
timedatectl set-timezone UTC || true
apt-get update
apt-get install -y --no-install-recommends \
  sudo openssh-server ca-certificates curl git jq rsync xz-utils unzip zip \
  python3 python3-venv python3-pip python3-yaml pipx sqlite3 ripgrep openssl \
  build-essential cmake ninja-build pkg-config shellcheck \
  wireguard wireguard-tools ufw age rclone tmux htop lsof tree \
  openjdk-17-jdk-headless openjdk-21-jdk-headless adb fastboot \
  postgresql-client redis-tools gh
stage BASE_PACKAGES_READY

if ! id "$ADMIN" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$ADMIN"
fi
usermod -aG sudo "$ADMIN"
install -m 0440 /dev/stdin /etc/sudoers.d/90-dial-admin <<EOF
$ADMIN ALL=(ALL) NOPASSWD:ALL
EOF

install -d -m 0700 -o "$ADMIN" -g "$ADMIN" "$HOME_DIR/.ssh"
if [[ -s /root/.ssh/authorized_keys ]]; then
  install -m 0600 -o "$ADMIN" -g "$ADMIN" /root/.ssh/authorized_keys "$HOME_DIR/.ssh/authorized_keys"
fi

if [[ ! -s "$HOME_DIR/.ssh/dial-bootstrap-oracle" ]]; then
  sudo -u "$ADMIN" ssh-keygen -q -t ed25519 -N '' \
    -C 'dial-control-zero-touch-bootstrap' \
    -f "$HOME_DIR/.ssh/dial-bootstrap-oracle"
fi
chmod 0600 "$HOME_DIR/.ssh/dial-bootstrap-oracle"
chmod 0644 "$HOME_DIR/.ssh/dial-bootstrap-oracle.pub"
chown "$ADMIN:$ADMIN" "$HOME_DIR/.ssh/dial-bootstrap-oracle" "$HOME_DIR/.ssh/dial-bootstrap-oracle.pub"

install -d -m 0700 -o "$ADMIN" -g "$ADMIN" /var/lib/dial-control "$STATE"
install -d -m 0700 /etc/dial /etc/wireguard
printf 'ROLE=CONTROL_AUTHORITY\nHOSTNAME=%s\nNODE_ID=%s\nPHYSICAL_HOSTNAME=%s\nDISPLAY_NAME=%s\nFABRIC=PROVIDER_FIRST_EXECUTION_FABRIC\nREVISION=4.0\n' "$CANONICAL_HOST_ID" "$CANONICAL_HOST_ID" "$HOST" "$DISPLAY_NAME" >/etc/dial/host-role
chmod 0644 /etc/dial/host-role

cat >/etc/profile.d/dial-host-identity.sh <<EOF
export DIAL_HERMES_HOST_ID=$HOST
export DIAL_FABRIC_HOST_ID=$CANONICAL_HOST_ID
export DIAL_HOST_ROLE=$CANONICAL_HOST_ID
export DIAL_CONTROL_DISPLAY_NAME='Dial Control'
EOF
chmod 0644 /etc/profile.d/dial-host-identity.sh

grep -vE '^(DIAL_HERMES_HOST_ID|DIAL_FABRIC_HOST_ID|DIAL_HOST_ROLE|DIAL_CONTROL_DISPLAY_NAME)=' /etc/environment >/tmp/dial-environment || true
cat >>/tmp/dial-environment <<EOF
DIAL_HERMES_HOST_ID=$HOST
DIAL_FABRIC_HOST_ID=$CANONICAL_HOST_ID
DIAL_HOST_ROLE=$CANONICAL_HOST_ID
DIAL_CONTROL_DISPLAY_NAME='Dial Control'
EOF
install -m 0644 /tmp/dial-environment /etc/environment
rm -f /tmp/dial-environment

install -d -m 0755 -o "$ADMIN" -g "$ADMIN" "$HOME_DIR/.config/environment.d"
cat >"$HOME_DIR/.config/environment.d/10-dial-host.conf" <<EOF
DIAL_HERMES_HOST_ID=$HOST
DIAL_FABRIC_HOST_ID=$CANONICAL_HOST_ID
DIAL_HOST_ROLE=$CANONICAL_HOST_ID
DIAL_CONTROL_DISPLAY_NAME='Dial Control'
EOF
chown "$ADMIN:$ADMIN" "$HOME_DIR/.config/environment.d/10-dial-host.conf"
chmod 0644 "$HOME_DIR/.config/environment.d/10-dial-host.conf"

if [[ ! -s /etc/wireguard/dial-netcup.key ]]; then
  wg genkey >/etc/wireguard/dial-netcup.key
  chmod 0600 /etc/wireguard/dial-netcup.key
  wg pubkey </etc/wireguard/dial-netcup.key >/etc/wireguard/dial-netcup.pub
  chmod 0644 /etc/wireguard/dial-netcup.pub
fi

# One-time encryption identity used by GitHub Actions to deliver the OCI recovery
# bundle without exposing the private key on the public bootstrap transport.
if [[ ! -s /etc/dial/github-bootstrap-age.key ]]; then
  age-keygen -o /etc/dial/github-bootstrap-age.key >/dev/null 2>&1
  chmod 0600 /etc/dial/github-bootstrap-age.key
  age-keygen -y /etc/dial/github-bootstrap-age.key >/etc/dial/github-bootstrap-age.pub
  chmod 0644 /etc/dial/github-bootstrap-age.pub
fi

rm -rf "$REPO"
install -d -m 0755 -o "$ADMIN" -g "$ADMIN" "$REPO"
sudo -u "$ADMIN" git -C "$REPO" init -q
sudo -u "$ADMIN" git -C "$REPO" remote add origin https://github.com/Vanguduza/dial-new.git
sudo -u "$ADMIN" git -C "$REPO" fetch --depth 1 origin "$DIAL_BOOTSTRAP_REF"
sudo -u "$ADMIN" git -C "$REPO" checkout --detach FETCH_HEAD
stage IMMUTABLE_REPO_CHECKED_OUT

# Rev 5.1 development pack is the bootstrap design authority projection.
# Minimal preflight uses jq because a truly minimal Ubuntu image may not have Node yet.
POLICY="$REPO/ops/development-bootstrap/rev5.1/REV5_1_BOOTSTRAP_POLICY.json"
[[ -s "$POLICY" ]] || { echo "REFUSE: Rev 5.1 bootstrap policy missing" >&2; exit 3; }
jq -e '
  .source_pack.pack_id == "DIAL-DEV-SYS-REV5.1" and
  .current_pack_state.build_ready == false and
  .gap_closure_policy.rule == "IDENTIFIED_GAP_MUST_BE_COVERED"
' "$POLICY" >/dev/null || { echo "REFUSE: invalid Rev 5.1 bootstrap policy" >&2; exit 3; }
stage REV51_POLICY_PREFLIGHT_GREEN

sudo -u "$ADMIN" env HOME="$HOME_DIR" DIAL_REPO_DIR="$REPO" PATH="$HOME_DIR/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  bash -lc '
    set -euo pipefail
    if [[ ! -x "$HOME/.local/bin/node" ]] || [[ "$("$HOME/.local/bin/node" --version 2>/dev/null || true)" != "v22.23.2" ]]; then
      bash "$DIAL_REPO_DIR/deploy/oracle/hermes-codex/install-pinned-node.sh"
    fi
    [[ "$("$HOME/.local/bin/node" --version)" == "v22.23.2" ]]
  '
stage PINNED_NODE_READY

systemctl enable --now ssh
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
loginctl enable-linger "$ADMIN" || true
stage SSH_RECOVERY_CHANNEL_READY

bash "$REPO/deploy/netcup/hermes-control/install-github-oidc-control.sh"
stage OIDC_CONTROL_EARLY_READY

sudo -u "$ADMIN" env HOME="$HOME_DIR" DIAL_REPO_DIR="$REPO" \
  bash "$REPO/deploy/oracle/hermes-codex/bootstrap-host.sh"
stage CORE_HOST_CONVERGENCE_READY

# Node is now installed at the repository-reviewed pin; run the full policy verifier.
sudo -u "$ADMIN" env HOME="$HOME_DIR" DIAL_REPO_DIR="$REPO" \
  node "$REPO/ops/development-bootstrap/rev5.1/verify-bootstrap-policy.mjs" image \
  >"$STATE/rev5.1-bootstrap-policy.json"
chmod 0600 "$STATE/rev5.1-bootstrap-policy.json"
stage REV51_FULL_POLICY_GREEN

# Hard runtime postconditions: these are real host installations, not capability
# declarations. Authentication remains a separate owner gate, but binaries must exist
# at the reviewed pins before the image bootstrap may succeed.
sudo -u "$ADMIN" env HOME="$HOME_DIR" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc '
  set -euo pipefail
  command -v claude >/dev/null
  claude --version | grep -Eq "2\\.1\\.270"
  command -v agy >/dev/null
  agy --version | grep -Eq "1\\.2\\.0"
  command -v antigravity >/dev/null
  antigravity --version | grep -Eq "1\\.2\\.0"
  command -v codex >/dev/null
  codex --version >/dev/null
  command -v hermes >/dev/null
  hermes --version >/dev/null
'
stage PROVIDER_RUNTIMES_VERIFIED

sudo -u "$ADMIN" env HOME="$HOME_DIR" XDG_RUNTIME_DIR="/run/user/$(id -u "$ADMIN")" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc '
  set -euo pipefail
  command -v dial-housekeeping >/dev/null
  command -v dial-resource >/dev/null
  systemctl --user is-enabled --quiet dial-housekeeping.path
  systemctl --user is-enabled --quiet dial-housekeeping.timer
  dial-housekeeping status | grep -q "DIAL_STATE_AWARE_HOUSEKEEPING_V1"
'

# Full owner-facing Commander package is installed now; pairing is deliberately interactive later.
sudo -u "$ADMIN" env HOME="$HOME_DIR" DIAL_REPO_DIR="$REPO" \
  bash "$REPO/deploy/oracle/hermes-codex/install-owner-remote-commander.sh"

# Pin the VAN/Trading Core subordinate control definitions used by Hermes.
VAN_REPO="$HOME_DIR/Van"
VAN_REF="0067d55071342b963293d0724f5a1604d233d105"
rm -rf "$VAN_REPO"
install -d -m 0755 -o "$ADMIN" -g "$ADMIN" "$VAN_REPO"
sudo -u "$ADMIN" git -C "$VAN_REPO" init -q
sudo -u "$ADMIN" git -C "$VAN_REPO" remote add origin https://github.com/Vanguduza/Van.git
sudo -u "$ADMIN" git -C "$VAN_REPO" fetch --depth 1 origin "$VAN_REF"
sudo -u "$ADMIN" git -C "$VAN_REPO" checkout --detach FETCH_HEAD
stage VAN_CONTROL_DEFINITIONS_READY

if getent group docker >/dev/null 2>&1; then usermod -aG docker "$ADMIN"; fi

# Occasional Android/Java developer toolchain. Gradle remains project-wrapper owned.
ANDROID_HOME=$HOME_DIR/Android/Sdk
install -d -m 0755 -o "$ADMIN" -g "$ADMIN" "$ANDROID_HOME"
ANDROID_BUILD=15859902
ANDROID_ZIP=/tmp/android-cmdline-tools.zip
curl --proto '=https' --tlsv1.2 -fL --retry 5 --retry-delay 3 \
  -o "$ANDROID_ZIP" "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_BUILD}_latest.zip"
rm -rf /tmp/android-cli "$ANDROID_HOME/cmdline-tools/latest"
mkdir -p /tmp/android-cli "$ANDROID_HOME/cmdline-tools/latest"
unzip -q "$ANDROID_ZIP" -d /tmp/android-cli
cp -a /tmp/android-cli/cmdline-tools/. "$ANDROID_HOME/cmdline-tools/latest/"
chown -R "$ADMIN:$ADMIN" "$ANDROID_HOME"
sudo -u "$ADMIN" env JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ANDROID_HOME="$ANDROID_HOME" \
  bash -lc 'yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null; "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-35" "platforms;android-36" "build-tools;35.0.0" "build-tools;36.0.0"'
[[ -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]] || { echo "Android sdkmanager missing" >&2; exit 4; }
[[ -d "$ANDROID_HOME/platforms/android-35" ]] || { echo "Android API 35 missing" >&2; exit 4; }
[[ -d "$ANDROID_HOME/platforms/android-36" ]] || { echo "Android API 36 missing" >&2; exit 4; }
cat >/etc/profile.d/dial-android.sh <<EOF
export ANDROID_HOME=$ANDROID_HOME
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=\$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
EOF
chmod 0644 /etc/profile.d/dial-android.sh
stage ANDROID_TOOLCHAIN_READY

# OCI CLI is installed in an isolated venv; authentication material is never embedded here.
python3 -m venv /opt/oci-cli
/opt/oci-cli/bin/pip install --disable-pip-version-check --no-cache-dir 'oci-cli==3.93.0'
ln -sfn /opt/oci-cli/bin/oci /usr/local/bin/oci
install -d -m 0700 -o "$ADMIN" -g "$ADMIN" "$HOME_DIR/.oci"
stage OCI_CLI_READY

{
  printf 'bootstrap_ref=%s\n' "$DIAL_BOOTSTRAP_REF"
  printf 'display_name=%s\n' 'Dial Control'
  printf 'hostname='; hostname
  printf 'canonical_host_id=%s\n' "$CANONICAL_HOST_ID"
  printf 'os=%s\n' "$PRETTY_NAME"
  printf 'kernel='; uname -r
  printf 'node='; sudo -u "$ADMIN" env HOME="$HOME_DIR" bash -lc 'node --version 2>/dev/null || true'
  printf 'claude='; sudo -u "$ADMIN" env HOME="$HOME_DIR" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc 'claude --version 2>/dev/null | head -1 || true'
  printf 'antigravity='; sudo -u "$ADMIN" env HOME="$HOME_DIR" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc 'agy --version 2>/dev/null | head -1 || true'
  printf 'codex='; sudo -u "$ADMIN" env HOME="$HOME_DIR" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc 'codex --version 2>/dev/null | head -1 || true'
  printf 'hermes='; sudo -u "$ADMIN" env HOME="$HOME_DIR" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc 'hermes --version 2>/dev/null | head -1 || true'
  printf 'java17='; /usr/lib/jvm/java-17-openjdk-amd64/bin/java -version 2>&1 | head -1
  printf 'java21='; /usr/lib/jvm/java-21-openjdk-amd64/bin/java -version 2>&1 | head -1
  printf 'adb='; adb version 2>/dev/null | head -1 || true
  printf 'oci='; oci --version 2>/dev/null || true
  printf 'wireguard_public_key='; cat /etc/wireguard/dial-netcup.pub
  printf 'bootstrap_ssh_public_key='; cat "$HOME_DIR/.ssh/dial-bootstrap-oracle.pub"
  printf 'github_bootstrap_age_recipient='; cat /etc/dial/github-bootstrap-age.pub
  printf 'rev51_pack_id=%s\n' 'DIAL-DEV-SYS-REV5.1'
  printf 'rev51_build_ready=false\n'
  printf 'rev51_new_external_tools=QUALIFICATION_GATED\n'
  printf 'housekeeping=%s\n' 'DIAL_STATE_AWARE_HOUSEKEEPING_V1'
} >"$STATE/image-bootstrap.receipt"
chmod 0600 "$STATE/image-bootstrap.receipt"

cat >"$STATE/NEXT" <<'EOF'
ZERO_TOUCH_POSTBOOT=ENABLED
GitHub OIDC convergence takes over automatically after image bootstrap.
No shell command is required from the owner.
The old Oracle control VM remains protected until migration, cutover and recovery certification pass.
EOF
chmod 0600 "$STATE/NEXT"

stage COMPLETE
echo "DIAL_NETCUP_IMAGE_BOOTSTRAP=COMPLETE"
echo "GitHub OIDC zero-touch postbootstrap is enabled; no owner shell steps are required."
