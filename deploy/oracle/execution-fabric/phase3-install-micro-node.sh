#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLE="${1:-BACKGROUND_COORDINATOR}"
HOST="$(hostname)"

sudo hostnamectl set-hostname vekl-worker
sudo tee /etc/hostname >/dev/null <<<'vekl-worker'

bash "$HERE/install-host-role.sh" "$ROLE"
sudo tee /etc/dial/host-role >/dev/null <<EOF
ROLE=$ROLE
HOSTNAME=vekl-worker
NODE_ID=vekl-worker
FABRIC=PROVIDER_FIRST_EXECUTION_FABRIC
REVISION=2.0
EOF
sudo chmod 0644 /etc/dial/host-role

sudo install -d -m 0755 /etc/systemd/system /etc/systemd/system/ssh.service.d /etc/systemd/system/ssh.socket.d
sudo install -m 0644 "$HERE/slices/micro/dial-survival.slice" /etc/systemd/system/dial-survival.slice
sudo install -m 0644 "$HERE/slices/micro/dial-node.slice" /etc/systemd/system/dial-node.slice
sudo install -m 0644 "$HERE/dropins/ssh-survival.conf" /etc/systemd/system/ssh.service.d/dial-survival.conf
if [[ -f /lib/systemd/system/ssh.socket || -f /usr/lib/systemd/system/ssh.socket ]]; then
  sudo install -m 0644 "$HERE/dropins/ssh-survival.conf" /etc/systemd/system/ssh.socket.d/dial-survival.conf
fi

UBUNTU_UID="$(id -u ubuntu)"
sudo install -d -m 0755 "/etc/systemd/system/user@${UBUNTU_UID}.service.d"
sudo tee "/etc/systemd/system/user@${UBUNTU_UID}.service.d/dial-node-slice.conf" >/dev/null <<'EOF'
[Service]
Slice=dial-node.slice
EOF

sudo systemctl daemon-reload
sudo systemctl start dial-survival.slice dial-node.slice
sudo systemctl restart ssh.service || sudo systemctl restart ssh
sudo loginctl enable-linger ubuntu
sudo systemctl restart "user@${UBUNTU_UID}.service" || true
sleep 2
systemctl show dial-survival.slice -p MemoryMin -p MemoryLow -p CPUWeight --no-pager
systemctl show dial-node.slice -p MemoryHigh -p MemoryMax -p CPUWeight --no-pager
systemctl show ssh.service -p Slice --no-pager
printf 'PHASE3_MICRO_NODE_INSTALLED role=%s host=%s\n' "$ROLE" "$(hostname)"
