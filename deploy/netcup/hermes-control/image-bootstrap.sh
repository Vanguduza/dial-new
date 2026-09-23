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

image_apt_retry() {
  local attempt rc=1
  for attempt in $(seq 1 10); do
    if apt-get -o DPkg::Lock::Timeout=600 "$@"; then
      return 0
    else
      rc=$?
    fi
    echo "image apt attempt $attempt failed rc=$rc; retrying" >&2
    sleep $((attempt < 6 ? attempt * 10 : 60))
  done
  return "$rc"
}

hostnamectl set-hostname "$HOST"
timedatectl set-timezone UTC || true
image_apt_retry update
image_apt_retry install -y --no-install-recommends \
  sudo openssh-server ca-certificates curl git jq rsync xz-utils unzip zip \
  python3 python3-venv python3-pip python3-yaml pipx sqlite3 ripgrep openssl \
  build-essential cmake ninja-build pkg-config shellcheck \
  wireguard wireguard-tools ufw age rclone tmux htop lsof tree \
  openjdk-17-jdk-headless openjdk-21-jdk-headless adb fastboot ffmpeg scrcpy docker.io \
  postgresql-client redis-tools gh
stage BASE_PACKAGES_READY

if ! id "$ADMIN" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$ADMIN"
fi
usermod -aG sudo "$ADMIN"
getent group docker >/dev/null 2>&1 && usermod -aG docker "$ADMIN" || true
systemctl enable --now docker >/dev/null 2>&1 || true
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

# Critical image bootstrap ends when the host is remotely controllable.
# Full DIAL development convergence is deliberately deferred until zero-touch
# has delivered recovery identity, overlay, migrated owner sessions and state.
python3 -m venv /opt/oci-cli
/opt/oci-cli/bin/pip install --disable-pip-version-check --no-cache-dir 'oci-cli==3.93.0'
ln -sfn /opt/oci-cli/bin/oci /usr/local/bin/oci
install -d -m 0700 -o "$ADMIN" -g "$ADMIN" "$HOME_DIR/.oci"
oci --version >/dev/null
stage OCI_CLI_READY

# A successful critical phase supersedes forensic snapshots from older failed boots.
rm -f "$STATE/failure-snapshot.txt" "$STATE/runner-diagnostics.txt"
stage CONTROL_PLANE_READY

{
  printf 'bootstrap_ref=%s\n' "$DIAL_BOOTSTRAP_REF"
  printf 'bootstrap_phase=%s\n' 'CONTROL_PLANE_READY'
  printf 'display_name=%s\n' 'Dial Control'
  printf 'hostname='; hostname
  printf 'canonical_host_id=%s\n' "$CANONICAL_HOST_ID"
  printf 'os=%s\n' "$PRETTY_NAME"
  printf 'kernel='; uname -r
  printf 'node='; sudo -u "$ADMIN" env HOME="$HOME_DIR" PATH="$HOME_DIR/.local/bin:$HOME_DIR/.npm-global/bin:/usr/local/bin:/usr/bin:/bin" bash -lc '"$HOME/.local/bin/node" --version 2>/dev/null || true'
  printf 'oci='; oci --version 2>/dev/null || true
  printf 'wireguard_public_key='; cat /etc/wireguard/dial-netcup.pub
  printf 'bootstrap_ssh_public_key='; cat "$HOME_DIR/.ssh/dial-bootstrap-oracle.pub"
  printf 'github_bootstrap_age_recipient='; cat /etc/dial/github-bootstrap-age.pub
  printf 'rev51_pack_id=%s\n' 'DIAL-DEV-SYS-REV5.1'
  printf 'rev51_build_ready=false\n'
  printf 'postbootstrap_convergence=%s\n' 'DEFERRED_TO_ZERO_TOUCH_ACTIVATION'
} >"$STATE/image-bootstrap.receipt"
chmod 0600 "$STATE/image-bootstrap.receipt"

cat >"$STATE/NEXT" <<'EOF'
ZERO_TOUCH_POSTBOOT=ENABLED
BOOTSTRAP_PHASE=CONTROL_PLANE_READY
GitHub OIDC convergence now owns recovery identity, overlay, migration and activation.
Full DIAL development convergence is enforced during activation after owner sessions/state are migrated.
No shell command is required from the owner.
The old Oracle control VM remains protected until migration, cutover and recovery certification pass.
EOF
chmod 0600 "$STATE/NEXT"

stage CONTROL_PLANE_READY
echo "DIAL_NETCUP_IMAGE_BOOTSTRAP=CONTROL_PLANE_READY"
echo "GitHub OIDC zero-touch postbootstrap is enabled; no owner shell steps are required."
