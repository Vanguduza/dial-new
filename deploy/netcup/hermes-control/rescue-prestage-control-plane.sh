#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOTDEV="${1:?root device required}"
PAYLOAD_REF="${2:?payload ref required}"
IMAGE_BLOB="${3:?image blob required}"
ROOT=/mnt/dial-root
ADMIN=ubuntu
REPO="$ROOT/home/$ADMIN/dial-new"
STATE="$ROOT/var/lib/dial-control/bootstrap"
NODE_VERSION=22.23.2
NODE_SHA256=d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307
NODE_ARCHIVE="/tmp/dial-node-${NODE_VERSION}.tar.xz"
POLICY_OLD=/tmp/policy-rc.d.old
RESOLV_OLD=/tmp/resolv.conf.old
BINDS=()
MOUNTS=()
POLICY_HAD=false
RESOLV_HAD=false
RESOLV_LINK=

[[ "$PAYLOAD_REF" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid payload ref" >&2; exit 2; }
[[ "$IMAGE_BLOB" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid image blob" >&2; exit 2; }

cleanup() {
  set +e
  if [[ "$POLICY_HAD" == true ]]; then cp -a "$POLICY_OLD" "$ROOT/usr/sbin/policy-rc.d"; else rm -f "$ROOT/usr/sbin/policy-rc.d"; fi
  if [[ -n "$RESOLV_LINK" ]]; then
    rm -f "$ROOT/etc/resolv.conf"; ln -s "$RESOLV_LINK" "$ROOT/etc/resolv.conf"
  elif [[ "$RESOLV_HAD" == true ]]; then
    cp -a "$RESOLV_OLD" "$ROOT/etc/resolv.conf"
  fi
  for ((i=${#BINDS[@]}-1;i>=0;i--)); do umount -l "${BINDS[$i]}" >/dev/null 2>&1 || true; done
  for ((i=${#MOUNTS[@]}-1;i>=0;i--)); do umount -l "${MOUNTS[$i]}" >/dev/null 2>&1 || true; done
  sync
}
trap cleanup EXIT

apt_retry() {
  local rc=1
  for attempt in $(seq 1 10); do
    if chroot "$ROOT" env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 "$@"; then return 0; else rc=$?; fi
    echo "prestage apt attempt=$attempt rc=$rc" >&2
    sleep $((attempt < 6 ? attempt * 10 : 60))
  done
  return "$rc"
}

dpkg_retry() {
  local rc=1
  for attempt in $(seq 1 10); do
    if chroot "$ROOT" dpkg --configure -a; then return 0; else rc=$?; fi
    echo "prestage dpkg attempt=$attempt rc=$rc" >&2
    sleep $((attempt < 6 ? attempt * 10 : 60))
  done
  return "$rc"
}

mkdir -p "$ROOT"
if mountpoint -q "$ROOT"; then
  [[ "$(findmnt -n -o SOURCE --target "$ROOT")" == "$ROOTDEV" ]] || { echo "wrong root mounted" >&2; exit 3; }
else
  mount "$ROOTDEV" "$ROOT"
fi
grep -q '^ID=ubuntu' "$ROOT/etc/os-release" || { echo "not Ubuntu root" >&2; exit 3; }
grep -Eq '^VERSION_ID="?24\.04"?$' "$ROOT/etc/os-release" || { echo "Ubuntu 24.04 required" >&2; exit 3; }

mount_fstab_target() {
  local target="$1" source fstype options
  mkdir -p "$ROOT$target"
  mountpoint -q "$ROOT$target" && return 0
  source="$(findmnt --fstab --evaluate --tab-file "$ROOT/etc/fstab" --target "$target" --output SOURCE -n 2>/dev/null | head -1 || true)"
  fstype="$(findmnt --fstab --tab-file "$ROOT/etc/fstab" --target "$target" --output FSTYPE -n 2>/dev/null | head -1 || true)"
  options="$(findmnt --fstab --tab-file "$ROOT/etc/fstab" --target "$target" --output OPTIONS -n 2>/dev/null | head -1 || true)"
  [[ -n "$source" ]] || { echo "fstab source missing for $target" >&2; return 1; }
  if [[ -n "$fstype" && -n "$options" ]]; then
    mount -t "$fstype" -o "$options" "$source" "$ROOT$target"
  elif [[ -n "$fstype" ]]; then
    mount -t "$fstype" "$source" "$ROOT$target"
  else
    mount "$source" "$ROOT$target"
  fi
  MOUNTS+=("$ROOT$target")
}

mount_fstab_target /boot
mount_fstab_target /boot/efi

for src in /dev /dev/pts /proc /sys; do
  dst="$ROOT$src"
  mkdir -p "$dst"
  if ! mountpoint -q "$dst"; then
    mount --rbind "$src" "$dst"
    mount --make-rslave "$dst"
    BINDS+=("$dst")
  fi
done

if [[ -L "$ROOT/etc/resolv.conf" ]]; then
  RESOLV_LINK="$(readlink "$ROOT/etc/resolv.conf")"
elif [[ -f "$ROOT/etc/resolv.conf" ]]; then
  RESOLV_HAD=true; cp -a "$ROOT/etc/resolv.conf" "$RESOLV_OLD"
fi
rm -f "$ROOT/etc/resolv.conf"; cp -L /etc/resolv.conf "$ROOT/etc/resolv.conf"; chmod 0644 "$ROOT/etc/resolv.conf"

mkdir -p "$ROOT/usr/sbin"
if [[ -e "$ROOT/usr/sbin/policy-rc.d" ]]; then POLICY_HAD=true; cp -a "$ROOT/usr/sbin/policy-rc.d" "$POLICY_OLD"; fi
printf '#!/bin/sh\nexit 101\n' >"$ROOT/usr/sbin/policy-rc.d"; chmod 0755 "$ROOT/usr/sbin/policy-rc.d"

if [[ -f "$ROOT/etc/environment" ]]; then
  sed -i 's|^DIAL_CONTROL_DISPLAY_NAME=.*$|DIAL_CONTROL_DISPLAY_NAME="Dial Control"|' "$ROOT/etc/environment"
fi
chroot "$ROOT" /bin/sh -c '. /etc/environment'
dpkg_retry
apt_retry update
apt_retry install -y --no-install-recommends \
  sudo openssh-server ca-certificates curl git jq rsync xz-utils \
  python3 python3-venv python3-pip ufw age wireguard-tools netplan.io

if ! chroot "$ROOT" id "$ADMIN" >/dev/null 2>&1; then chroot "$ROOT" useradd -m -s /bin/bash "$ADMIN"; fi
chroot "$ROOT" usermod -aG sudo "$ADMIN"
mkdir -p "$ROOT/etc/sudoers.d"
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$ADMIN" >"$ROOT/etc/sudoers.d/90-dial-admin"; chmod 0440 "$ROOT/etc/sudoers.d/90-dial-admin"

printf 'dial-control\n' >"$ROOT/etc/hostname"
if grep -qE '^127\.0\.1\.1[[:space:]]' "$ROOT/etc/hosts"; then sed -i 's/^127\.0\.1\.1.*/127.0.1.1 dial-control/' "$ROOT/etc/hosts"; else printf '127.0.1.1 dial-control\n' >>"$ROOT/etc/hosts"; fi

install -d -m 0700 "$ROOT/etc/dial" "$ROOT/etc/wireguard" "$STATE"
cat >"$ROOT/etc/dial/host-role" <<'ROLE'
ROLE=CONTROL_AUTHORITY
HOSTNAME=dial-hermes-control
NODE_ID=dial-hermes-control
PHYSICAL_HOSTNAME=dial-control
DISPLAY_NAME=Dial Control
FABRIC=PROVIDER_FIRST_EXECUTION_FABRIC
REVISION=4.0
ROLE
chmod 0644 "$ROOT/etc/dial/host-role"

cat >"$ROOT/etc/profile.d/dial-host-identity.sh" <<'PROFILE'
export DIAL_HERMES_HOST_ID=dial-control
export DIAL_FABRIC_HOST_ID=dial-hermes-control
export DIAL_HOST_ROLE=dial-hermes-control
export DIAL_CONTROL_DISPLAY_NAME='Dial Control'
PROFILE
chmod 0644 "$ROOT/etc/profile.d/dial-host-identity.sh"

grep -vE '^(DIAL_HERMES_HOST_ID|DIAL_FABRIC_HOST_ID|DIAL_HOST_ROLE|DIAL_CONTROL_DISPLAY_NAME)=' "$ROOT/etc/environment" >/tmp/dial-env || true
cat >>/tmp/dial-env <<'ENV'
DIAL_HERMES_HOST_ID=dial-control
DIAL_FABRIC_HOST_ID=dial-hermes-control
DIAL_HOST_ROLE=dial-hermes-control
DIAL_CONTROL_DISPLAY_NAME="Dial Control"
ENV
install -m 0644 /tmp/dial-env "$ROOT/etc/environment"; rm -f /tmp/dial-env

install -d -m 0755 "$ROOT/home/$ADMIN/.config/environment.d"
cat >"$ROOT/home/$ADMIN/.config/environment.d/10-dial-host.conf" <<'ENV'
DIAL_HERMES_HOST_ID=dial-control
DIAL_FABRIC_HOST_ID=dial-hermes-control
DIAL_HOST_ROLE=dial-hermes-control
DIAL_CONTROL_DISPLAY_NAME="Dial Control"
ENV

rm -rf "$REPO"; install -d -m 0755 "$REPO"
git -C "$REPO" init -q
git -C "$REPO" remote add origin https://github.com/Vanguduza/dial-new.git
git -C "$REPO" fetch --depth 1 origin "$PAYLOAD_REF"
git -C "$REPO" checkout --detach FETCH_HEAD
[[ "$(git -c safe.directory="$REPO" -C "$REPO" rev-parse HEAD)" == "$PAYLOAD_REF" ]] || { echo "repo pin mismatch" >&2; exit 4; }

curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 8 --retry-all-errors \
  -o "$NODE_ARCHIVE" "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
printf '%s  %s\n' "$NODE_SHA256" "$NODE_ARCHIVE" | sha256sum --check --status || { echo "Node SHA mismatch" >&2; exit 4; }
NODE_PREFIX="$ROOT/home/$ADMIN/.local/lib/node-v${NODE_VERSION}"
rm -rf "$NODE_PREFIX"; install -d -m 0755 "$NODE_PREFIX" "$ROOT/home/$ADMIN/.local/bin"
tar -xJf "$NODE_ARCHIVE" --strip-components=1 -C "$NODE_PREFIX"
for binary in node npm npx corepack; do ln -sfn "../lib/node-v${NODE_VERSION}/bin/$binary" "$ROOT/home/$ADMIN/.local/bin/$binary"; done
[[ "$(chroot "$ROOT" /home/$ADMIN/.local/bin/node --version)" == "v${NODE_VERSION}" ]] || exit 4
chroot "$ROOT" /home/$ADMIN/.local/bin/node --check /home/$ADMIN/dial-new/deploy/netcup/hermes-control/github-oidc-control.mjs

uid="$(chroot "$ROOT" id -u "$ADMIN")"; gid="$(chroot "$ROOT" id -g "$ADMIN")"
chown -R "$uid:$gid" "$ROOT/home/$ADMIN/dial-new" "$ROOT/home/$ADMIN/.local" "$ROOT/home/$ADMIN/.config"

install -d -m 0700 "$ROOT/home/$ADMIN/.ssh"
if [[ ! -s "$ROOT/home/$ADMIN/.ssh/authorized_keys" && -s "$ROOT/root/.ssh/authorized_keys" ]]; then
  install -m 0600 "$ROOT/root/.ssh/authorized_keys" "$ROOT/home/$ADMIN/.ssh/authorized_keys"
fi
if [[ ! -e "$ROOT/home/$ADMIN/.ssh/authorized_keys" ]]; then
  install -m 0600 /dev/null "$ROOT/home/$ADMIN/.ssh/authorized_keys"
fi
if [[ ! -s "$ROOT/home/$ADMIN/.ssh/authorized_keys" ]]; then
  echo "SSH_AUTHORIZED_KEYS=DEFERRED_TO_AUTHENTICATED_CONTROL_PLANE"
fi
if [[ ! -s "$ROOT/home/$ADMIN/.ssh/dial-bootstrap-oracle" ]]; then
  chroot "$ROOT" runuser -u "$ADMIN" -- ssh-keygen -q -t ed25519 -N '' -C dial-control-zero-touch-bootstrap -f /home/$ADMIN/.ssh/dial-bootstrap-oracle
fi
chown -R "$uid:$gid" "$ROOT/home/$ADMIN/.ssh"; chmod 0700 "$ROOT/home/$ADMIN/.ssh"
chmod 0600 "$ROOT/home/$ADMIN/.ssh/authorized_keys" "$ROOT/home/$ADMIN/.ssh/dial-bootstrap-oracle"; chmod 0644 "$ROOT/home/$ADMIN/.ssh/dial-bootstrap-oracle.pub"
chroot "$ROOT" ssh-keygen -A
install -d -m 0755 "$ROOT/run/sshd"; chroot "$ROOT" /usr/sbin/sshd -t

if [[ ! -s "$ROOT/etc/wireguard/dial-netcup.key" ]]; then chroot "$ROOT" /bin/bash -lc 'umask 077; wg genkey >/etc/wireguard/dial-netcup.key; wg pubkey </etc/wireguard/dial-netcup.key >/etc/wireguard/dial-netcup.pub'; fi
chmod 0600 "$ROOT/etc/wireguard/dial-netcup.key"; chmod 0644 "$ROOT/etc/wireguard/dial-netcup.pub"

if [[ ! -s "$ROOT/etc/dial/github-bootstrap-age.key" ]]; then chroot "$ROOT" /bin/bash -lc 'umask 077; age-keygen -o /etc/dial/github-bootstrap-age.key >/dev/null 2>&1; age-keygen -y /etc/dial/github-bootstrap-age.key >/etc/dial/github-bootstrap-age.pub'; fi
chmod 0600 "$ROOT/etc/dial/github-bootstrap-age.key"; chmod 0644 "$ROOT/etc/dial/github-bootstrap-age.pub"

if [[ ! -x "$ROOT/opt/oci-cli/bin/oci" ]] || ! chroot "$ROOT" /opt/oci-cli/bin/oci --version >/dev/null 2>&1; then
  rm -rf "$ROOT/opt/oci-cli"; chroot "$ROOT" python3 -m venv /opt/oci-cli
  chroot "$ROOT" /opt/oci-cli/bin/pip install --disable-pip-version-check --no-cache-dir --retries 8 'oci-cli==3.93.0'
fi
ln -sfn /opt/oci-cli/bin/oci "$ROOT/usr/local/bin/oci"; chroot "$ROOT" /usr/local/bin/oci --version >/dev/null

install -d -m 0755 "$ROOT/usr/local/lib/dial-control" "$ROOT/usr/local/sbin"
install -m 0755 "$REPO/deploy/netcup/hermes-control/github-oidc-control.mjs" "$ROOT/usr/local/lib/dial-control/github-oidc-control.mjs"
install -d -m 0700 "$ROOT/var/lib/dial-control/github-oidc"; rm -f "$ROOT/var/lib/dial-control/github-oidc/READY"

cat >"$ROOT/usr/local/sbin/dial-oidc-ready-check" <<'READY'
#!/usr/bin/env bash
set -Eeuo pipefail
RECEIPT=/var/lib/dial-control/bootstrap/image-bootstrap.receipt
EXPECTED="$(sed -n 's/^bootstrap_ref=//p' "$RECEIPT" | head -1)"
[[ "$EXPECTED" =~ ^[0-9a-f]{40}$ ]]
for attempt in $(seq 1 30); do
  HEALTH="$(curl -fsS --max-time 2 http://127.0.0.1:9134/healthz 2>/dev/null || echo '{}')"
  if jq -e --arg expected "$EXPECTED" '
       .ok == true and
       .host == "dial-control" and
       .bootstrap_ref == $expected and
       .bootstrap_phase == "CONTROL_PLANE_READY" and
       .repo_head == $expected
     ' <<<"$HEALTH" >/dev/null 2>&1; then
    install -d -m 0700 /var/lib/dial-control/github-oidc
    date -u +%FT%TZ >/var/lib/dial-control/github-oidc/READY
    chmod 0600 /var/lib/dial-control/github-oidc/READY
    exit 0
  fi
  sleep 1
done
exit 1
READY
chmod 0755 "$ROOT/usr/local/sbin/dial-oidc-ready-check"

cat >"$ROOT/etc/systemd/system/dial-github-oidc-control.service" <<'UNIT'
[Unit]
Description=DIAL GitHub OIDC zero-touch control
After=network-online.target ssh.service
Wants=network-online.target ssh.service

[Service]
Type=simple
User=root
Group=root
Environment=DIAL_REPO_DIR=/home/ubuntu/dial-new
Environment=DIAL_CONTROL_HOME=/var/lib/dial-control
Environment=DIAL_GITHUB_OIDC_PORT=9134
Environment=PATH=/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/ubuntu/.local/bin/node /usr/local/lib/dial-control/github-oidc-control.mjs
ExecStartPost=/usr/local/sbin/dial-oidc-ready-check
Restart=always
RestartSec=3
UMask=0077
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "$ROOT/etc/systemd/system/dial-github-oidc-control.service"

mkdir -p "$ROOT/var/lib/systemd/linger"; touch "$ROOT/var/lib/systemd/linger/$ADMIN"
systemctl --root="$ROOT" enable ssh.service >/dev/null
systemctl --root="$ROOT" enable dial-github-oidc-control.service >/dev/null
systemctl --root="$ROOT" disable dial-control-bootstrap.service >/dev/null 2>&1 || true
rm -f "$ROOT/etc/systemd/system/multi-user.target.wants/dial-control-bootstrap.service"
if [[ -f "$ROOT/etc/ufw/ufw.conf" ]]; then sed -i 's/^ENABLED=.*/ENABLED=no/' "$ROOT/etc/ufw/ufw.conf"; fi

chroot "$ROOT" netplan generate
mountpoint -q "$ROOT/boot"
mountpoint -q "$ROOT/boot/efi"
chroot "$ROOT" findmnt --verify --verbose --tab-file /etc/fstab
systemd-analyze verify --root="$ROOT" /etc/systemd/system/dial-github-oidc-control.service >/tmp/dial-systemd-verify.txt 2>&1 || { cat /tmp/dial-systemd-verify.txt; exit 6; }

. "$ROOT/etc/os-release"
{
  printf 'bootstrap_ref=%s\n' "$PAYLOAD_REF"
  printf 'bootstrap_phase=CONTROL_PLANE_READY\n'
  printf 'prestage=RESCUE_OFFLINE_CONTROL_PLANE_V1\n'
  printf 'image_bootstrap_blob=%s\n' "$IMAGE_BLOB"
  printf 'display_name=Dial Control\n'
  printf 'hostname=dial-control\n'
  printf 'canonical_host_id=dial-hermes-control\n'
  printf 'os=%s\n' "$PRETTY_NAME"
  printf 'node=%s\n' "$(chroot "$ROOT" /home/$ADMIN/.local/bin/node --version)"
  printf 'oci=%s\n' "$(chroot "$ROOT" /usr/local/bin/oci --version)"
  printf 'wireguard_public_key='; cat "$ROOT/etc/wireguard/dial-netcup.pub"
  printf 'bootstrap_ssh_public_key='; cat "$ROOT/home/$ADMIN/.ssh/dial-bootstrap-oracle.pub"
  printf 'github_bootstrap_age_recipient='; cat "$ROOT/etc/dial/github-bootstrap-age.pub"
  printf 'postbootstrap_convergence=DEFERRED_TO_ZERO_TOUCH_ACTIVATION\n'
} >"$STATE/image-bootstrap.receipt"
chmod 0600 "$STATE/image-bootstrap.receipt"
printf '%s CONTROL_PLANE_READY\n' "$(date -u +%FT%TZ)" >"$STATE/stage"
rm -f "$STATE/failure-snapshot.txt" "$STATE/runner-diagnostics.txt"

grep -qx "bootstrap_ref=$PAYLOAD_REF" "$STATE/image-bootstrap.receipt"
grep -qx 'bootstrap_phase=CONTROL_PLANE_READY' "$STATE/image-bootstrap.receipt"
[[ "$(git -c safe.directory="$REPO" -C "$REPO" rev-parse HEAD)" == "$PAYLOAD_REF" ]]
[[ "$(chroot "$ROOT" /home/$ADMIN/.local/bin/node --version)" == "v${NODE_VERSION}" ]]
test -L "$ROOT/etc/systemd/system/multi-user.target.wants/ssh.service"
test -L "$ROOT/etc/systemd/system/multi-user.target.wants/dial-github-oidc-control.service"

sync
echo "effective_bootstrap_ref=$PAYLOAD_REF"
echo "effective_image_blob=$IMAGE_BLOB"
echo "RESCUE_CONTROL_PLANE_PRESTAGE=GREEN"
