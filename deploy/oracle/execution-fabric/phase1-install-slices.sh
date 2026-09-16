#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo install -d -m 0755 /etc/systemd/system /etc/systemd/system/ssh.service.d /etc/systemd/system/ssh.socket.d /etc/systemd/system/dial-desktop-commander.service.d /etc/systemd/system/user@1001.service.d

sudo install -m 0644 "$HERE/slices/dial-survival.slice" /etc/systemd/system/dial-survival.slice
sudo install -m 0644 "$HERE/slices/dial-hermes.slice" /etc/systemd/system/dial-hermes.slice
sudo install -m 0644 "$HERE/slices/dial-dev.slice" /etc/systemd/system/dial-dev.slice
sudo install -m 0644 "$HERE/slices/dial-commander.slice" /etc/systemd/system/dial-commander.slice

sudo install -m 0644 "$HERE/dropins/ssh-survival.conf" /etc/systemd/system/ssh.service.d/dial-survival.conf
if [[ -f /lib/systemd/system/ssh.socket || -f /usr/lib/systemd/system/ssh.socket ]]; then
  sudo install -m 0644 "$HERE/dropins/ssh-socket-survival.conf" /etc/systemd/system/ssh.socket.d/dial-survival.conf
fi
if systemctl list-unit-files dial-desktop-commander.service >/dev/null 2>&1; then
  sudo install -m 0644 "$HERE/dropins/commander-slice.conf" /etc/systemd/system/dial-desktop-commander.service.d/dial-slice.conf
fi
sudo install -m 0644 "$HERE/dropins/user-hermes-slice.conf" /etc/systemd/system/user@1001.service.d/dial-hermes-slice.conf

sudo systemctl daemon-reload
sudo systemctl start dial-survival.slice dial-hermes.slice dial-dev.slice dial-commander.slice
sudo systemctl restart ssh.service || sudo systemctl restart ssh
if systemctl is-enabled dial-desktop-commander.service >/dev/null 2>&1 || systemctl is-active dial-desktop-commander.service >/dev/null 2>&1; then
  sudo systemctl restart dial-desktop-commander.service || true
fi
# Bounce the ubuntu user manager so control-plane units join dial-hermes.slice.
# SSH is system sshd and stays up. Linger brings user units back.
sudo systemctl restart user@1001.service

sleep 3
systemctl show dial-hermes.slice -p MemoryMin -p MemoryLow -p MemoryHigh -p MemoryMax -p CPUQuota -p CPUWeight --no-pager
systemctl show ssh.service -p Slice --no-pager
systemctl show user@1001.service -p Slice --no-pager
systemctl --user --no-pager is-active dial-hermes-orchestrator.service dial-hermes-runtime.service || true
printf 'PHASE1_SLICES_INSTALLED\n'
