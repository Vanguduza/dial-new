#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
fi
sudo install -d -m 0755 /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  echo '{}' | sudo tee /etc/docker/daemon.json >/dev/null
fi
python3 - <<'PY'
import json
p="/etc/docker/daemon.json"
try:
    cfg=json.load(open(p))
except Exception:
    cfg={}
cfg["cgroup-parent"]="dial-dev.slice"
open("/tmp/dial-docker-daemon.json","w").write(json.dumps(cfg, indent=2)+"\n")
PY
sudo install -m 0644 /tmp/dial-docker-daemon.json /etc/docker/daemon.json
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu || true
sudo install -d -m 0770 -o ubuntu -g ubuntu /srv/dial/workspaces /srv/dial/reference
sudo docker build -t dial/toolbox:2026.09 -f "$HERE/sandbox/Dockerfile.toolbox" "$HERE/sandbox"
printf 'PHASE4_SANDBOX_IMAGE '
sudo docker image inspect dial/toolbox:2026.09 --format '{{.Id}} {{.RepoTags}}'
printf 'PHASE4_SANDBOX_INSTALLED\n'
