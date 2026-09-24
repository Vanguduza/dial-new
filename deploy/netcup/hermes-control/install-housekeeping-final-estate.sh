#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO="${DIAL_RUNTIME_ROOT:-/usr/local/lib/dial-control/runtime}"
KEY=/home/ubuntu/.ssh/dial-oracle-admin
[[ -s "$KEY" ]] || KEY=/home/ubuntu/.ssh/dial-bootstrap-oracle

die(){ echo "HOUSEKEEPING_ESTATE_REFUSED: $*" >&2; exit 2; }
[[ "$(hostname)" == dial-control ]] || die "wrong host"
[[ -s "$KEY" ]] || die "Oracle SSH identity missing"
[[ -f /var/lib/dial-control/github-oidc/overlay-verified ]] || die "private overlay is not verified"

FILES=(
  agent-system/orchestration/state-store.mjs
  agent-system/orchestration/resource-lifecycle-registry.mjs
  agent-system/orchestration/housekeeping-gc.mjs
  agent-system/registries/HOUSEKEEPING_POLICY.json
  deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh
  deploy/oracle/hermes-codex/systemd/dial-housekeeping.service
  deploy/oracle/hermes-codex/systemd/dial-housekeeping.path
  deploy/oracle/hermes-codex/systemd/dial-housekeeping.timer
)
for rel in "${FILES[@]}"; do
  [[ -f "$REPO/$rel" ]] || die "missing canonical housekeeping source: $rel"
done

TMPDIR="$(mktemp -d /tmp/dial-housekeeping-estate.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT
# The runtime payload is a bounded subset without install-pinned-node.sh; the admin workflow
# refreshes it beside the other helpers.
NODE_INSTALLER="${DIAL_PINNED_NODE_INSTALLER:-/usr/local/lib/dial-control/install-pinned-node.sh}"
[[ -s "$NODE_INSTALLER" ]] || die "missing pinned Node installer: $NODE_INSTALLER"
install -d "$TMPDIR/bundle/deploy/oracle/hermes-codex"
tar -C "$REPO" -cf - "${FILES[@]}" | tar -C "$TMPDIR/bundle" -xf -
install -m 0755 "$NODE_INSTALLER" "$TMPDIR/bundle/deploy/oracle/hermes-codex/install-pinned-node.sh"
tar -C "$TMPDIR/bundle" -czf "$TMPDIR/bundle.tar.gz" .

# Rebuilt peers (auth-20260923-owner-estate-rebuild-hermes-becomes-van) boot from a bare image
# without Node; install the repo's SHA-pinned Node before the housekeeping installer needs it.
declare -A ACTIVE_REPOS=(
  [oracle-admin]=/opt/dial-recovery/dial-new
  [vekl-worker]=/home/ubuntu/dial-new
)

for HOST_ID in oracle-admin vekl-worker; do
  ACTIVE_REPO="${ACTIVE_REPOS[$HOST_ID]}"
  SSH=(runuser -u ubuntu -- ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "ubuntu@$HOST_ID")
  cat "$TMPDIR/bundle.tar.gz" | "${SSH[@]}" 'set -Eeuo pipefail; rm -rf /tmp/dial-housekeeping-bundle; mkdir -p /tmp/dial-housekeeping-bundle; tar -xz -C /tmp/dial-housekeeping-bundle'
  OUTPUT="$("${SSH[@]}" "set -Eeuo pipefail; if ! command -v lsof >/dev/null 2>&1; then sudo apt-get update -qq; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends 'lsof=4.95.0-1build3'; fi; command -v git >/dev/null 2>&1 || { sudo apt-get update -qq; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git; }; PATH=\"\$HOME/.local/bin:\$PATH\" command -v node >/dev/null 2>&1 || bash /tmp/dial-housekeeping-bundle/deploy/oracle/hermes-codex/install-pinned-node.sh >&2; env DIAL_REPO_DIR=/tmp/dial-housekeeping-bundle DIAL_HOUSEKEEPING_ACTIVE_REPO='$ACTIVE_REPO' DIAL_HOUSEKEEPING_HOST_ID='$HOST_ID' DIAL_SERVICE_USER=ubuntu XDG_RUNTIME_DIR=/run/user/\$(id -u) bash /tmp/dial-housekeeping-bundle/deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh")"
  grep -q '^STATE_AWARE_HOUSEKEEPING=INSTALLED$' <<<"$OUTPUT" || die "housekeeping receipt missing for $HOST_ID"
  echo "HOUSEKEEPING_HOST=$HOST_ID GREEN"
done

install -d -m 0700 /var/lib/dial-control/github-oidc
printf '%s\n' "$(date -u +%FT%TZ)" >/var/lib/dial-control/github-oidc/housekeeping-estate-installed
chmod 0600 /var/lib/dial-control/github-oidc/housekeeping-estate-installed

echo "STATE_AWARE_HOUSEKEEPING_ESTATE=GREEN"
echo "hosts=oracle-admin,vekl-worker"
