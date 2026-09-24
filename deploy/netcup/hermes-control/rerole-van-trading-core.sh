#!/usr/bin/env bash
# Re-role the old Hermes control A1 (dial-hermes-control) into van-trading-core and move VAN's state
# onto it. Run as root on Dial Control. Owner decision auth-20260923-owner-estate-rebuild-hermes-becomes-van
# (keep the dial-hermes-control instance, format it, bootstrap it into van-trading-core, terminate the
# current van-trading-core), carried out by auth-20260924-owner-finish-hermes-clone-van-rerole.
#
#   rerole-van-trading-core.sh access-old          authorize Dial Control on the old van-trading-core (via the source)
#   rerole-van-trading-core.sh capture [--final]   archive VAN state from the old van-trading-core to Dial Control;
#                                                  --final stops the old VAN services first (consistent copy)
#   rerole-van-trading-core.sh bootstrap-new       VAN's own bootstrap.sh on the re-roled host, pinned to VAN_SHA
#   rerole-van-trading-core.sh restore             final capture -> new host, then VAN bootstrap again (reconciles)
#   rerole-van-trading-core.sh qualify             VAN's own qualify.sh against VAN_SHA
#   rerole-van-trading-core.sh status
#
# VAN stays the authority for VAN (estate-topology.json): only VAN's installers and qualifier run on the
# host. DIAL supplies the topology around them. Netcup reaches the host over the overlay (10.77.0.4) and
# as "van-trading-core", which the commander certificate already names (DNS:van-trading-core), so the
# CA and certificates move unchanged. The old host is reached through oracle-admin, whose VCN address
# its firewall already admits, so this does not depend on the migration source surviving.
set -Eeuo pipefail
umask 077

MODE="${1:-status}"; shift || true
CONTROL="${DIAL_CONTROL_HOME:-/var/lib/dial-control}"
WORK="${DIAL_VAN_MIGRATION_DIR:-$CONTROL/van-migration}"
STATE="$CONTROL/state"
VAN_REPO_URL="${VAN_REPO_URL:-https://github.com/Vanguduza/Van.git}"
VAN_SHA="${VAN_SHA:-61d86cd0f2291df3f244b941d4ad3c96a1a1aaca}"
OLD_VAN_IP="${DIAL_OLD_VAN_PRIVATE_IP:-10.0.1.233}"
ADMIN_OVERLAY_IP=10.77.0.2
NEW_VAN_IP=10.77.0.4
SOURCE_IP=10.77.0.5
PERM=/home/ubuntu/.ssh/dial-oracle-admin
BOOT=/home/ubuntu/.ssh/dial-bootstrap-oracle
KNOWN="$WORK/known_hosts"
VAN_UNITS=(vati-mt5-pull vati-commander vati-vekl vati-automation vati-supabase)

die() { echo "VAN_REROLE_REFUSED: $*" >&2; exit 2; }
say() { printf '%s\n' "$*"; }
[[ "$(id -u)" == 0 ]] || die "run as root"
[[ "$(hostname)" == dial-control ]] || die "run on Dial Control"
[[ "$VAN_SHA" =~ ^[0-9a-f]{40}$ ]] || die "VAN_SHA must be an exact 40-hex commit"
install -d -m 0700 "$WORK" "$STATE"

keys() { local k a=(); for k in "$PERM" "$BOOT"; do [[ -s "$k" ]] && a+=(-i "$k"); done; printf '%s\n' "${a[@]}"; }
mapfile -t ID_ARGS < <(keys)
[[ ${#ID_ARGS[@]} -gt 0 ]] || die "no Dial Control SSH identity"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new
  -o UserKnownHostsFile="$KNOWN" -o ControlMaster=no -o ControlPath=none -o ServerAliveInterval=30)
chown ubuntu:ubuntu "$WORK"; touch "$KNOWN"; chown ubuntu:ubuntu "$KNOWN"

# ssh as ubuntu (the keys belong to it). old_ssh reaches the old van through oracle-admin.
new_ssh() { runuser -u ubuntu -- ssh "${ID_ARGS[@]}" "${SSH_OPTS[@]}" "ubuntu@$NEW_VAN_IP" "$@"; }
old_ssh() {
  local jump
  jump="ssh ${ID_ARGS[*]} -o BatchMode=yes -o ConnectTimeout=10 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$KNOWN -W %h:%p ubuntu@$ADMIN_OVERLAY_IP"
  runuser -u ubuntu -- ssh "${ID_ARGS[@]}" "${SSH_OPTS[@]}" -o ProxyCommand="$jump" "ubuntu@$OLD_VAN_IP" "$@"
}
src_ssh() { runuser -u ubuntu -- ssh "${ID_ARGS[@]}" "${SSH_OPTS[@]}" "ubuntu@$SOURCE_IP" "$@"; }

# The permanent key is created only by rotate-bootstrap-identities.sh: the estate reads its existence as
# "identities rotated" (peerKey() in github-oidc-control.mjs), so this never creates it. Whichever keys
# exist are authorized; the old van is not in the rotation set, so both stay valid there.
access_old() {
  local pubs; pubs="$([[ -s "$PERM.pub" ]] && cat "$PERM.pub"; [[ -s "$BOOT.pub" ]] && cat "$BOOT.pub")"
  [[ -n "$pubs" ]] || die "no Dial Control public key to authorize"
  if [[ "$(old_ssh hostname 2>/dev/null || true)" != van-trading-core ]]; then
    # The old van admits the source's node-hermes-to-trading key; the source relays the append.
    [[ "$(src_ssh hostname 2>/dev/null || true)" == dial-hermes-control ]] || die "migration source unreachable; cannot authorize Dial Control on the old van-trading-core"
    local b64; b64="$(printf '%s\n' "$pubs" | base64 -w0)"
    src_ssh "timeout 60 ssh -i ~/.ssh/node-hermes-to-trading -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ubuntu@$OLD_VAN_IP \
      'set -e; umask 077; mkdir -p ~/.ssh; touch ~/.ssh/authorized_keys; echo $b64 | base64 -d | while read -r k; do [ -n \"\$k\" ] && { grep -qxF \"\$k\" ~/.ssh/authorized_keys || printf \"%s\n\" \"\$k\" >>~/.ssh/authorized_keys; }; done; hostname'" >/dev/null
  fi
  [[ "$(old_ssh hostname)" == van-trading-core ]] || die "old van-trading-core did not answer as itself through oracle-admin"
  date -u +%FT%TZ >"$STATE/old-van-access-verified"
  say "OLD_VAN_ACCESS=GREEN path=dial-control->oracle-admin($ADMIN_OVERLAY_IP)->$OLD_VAN_IP"
}

# Every volume mounted by a VAN container, with the container and destination it serves, so an
# anonymous volume can be matched to its counterpart on the new host by (container, destination).
REMOTE_MOUNTS='sudo -n docker ps -a --format "{{.Names}}" | while read -r c; do
  case "$c" in supabase-*|realtime-*|van-*) ;; *) continue ;; esac
  sudo -n docker inspect --format "{{range .Mounts}}{{if eq .Type \"volume\"}}{{$.Name}} {{.Name}} {{.Destination}}{{println}}{{end}}{{end}}" "$c"
done | sed "s#^/##" | awk "NF==3" | sort -u'

capture() {
  local final=0; [[ "${1:-}" == --final ]] && final=1
  [[ "$(old_ssh hostname)" == van-trading-core ]] || die "old van-trading-core unreachable; run access-old"
  local stamp dir; stamp="$(date -u +%Y%m%dT%H%M%SZ)"; dir="$WORK/capture-$stamp"
  install -d -m 0700 "$dir"
  old_ssh "sudo -n git -c safe.directory='*' -C /opt/van-trading/app rev-parse HEAD" >"$dir/old-app-sha"
  old_ssh "systemctl list-unit-files --no-legend 'vati*' | awk '\$2==\"enabled\"{print \$1}'" >"$dir/enabled-units"
  old_ssh "$REMOTE_MOUNTS" >"$dir/mounts"
  [[ -s "$dir/mounts" ]] || die "no VAN container volumes found on the old host"
  if (( final )); then
    # Consistent copy: the databases must be stopped. From here VAN is down until restore.
    old_ssh "for u in ${VAN_UNITS[*]}; do sudo -n systemctl stop \$u 2>/dev/null || true; done
      for u in \$(systemctl list-units --no-legend --plain 'vati-session@*' | awk '{print \$1}'); do sudo -n systemctl stop \$u; done
      sudo -n docker ps --format '{{.Names}}' | grep -E '^(supabase-|realtime-|van-)' | xargs -r sudo -n docker stop >/dev/null
      ! sudo -n docker ps --format '{{.Names}}' | grep -qE '^(supabase-|realtime-|van-)'" ||
      die "old VAN services did not stop; nothing captured"
    date -u +%FT%TZ >"$dir/old-services-stopped-at"
  fi
  # Everything under /opt/van-trading except the code checkout and the venv, which VAN's bootstrap
  # rebuilds at VAN_SHA. Owner names are stored with the ids so the service user maps by name.
  old_ssh "sudo -n tar -C / -cpzf - --exclude=opt/van-trading/app --exclude=opt/van-trading/venv opt/van-trading var/lib/van-trading" >"$dir/van-files.tgz"
  local vols; vols="$(awk '{print $2}' "$dir/mounts" | sort -u | tr '\n' ' ')"
  old_ssh "sudo -n tar -C /var/lib/docker/volumes -cpzf - $(for v in $vols; do printf '%s/_data ' "$v"; done)" >"$dir/van-volumes.tgz"
  gzip -t "$dir/van-files.tgz" && gzip -t "$dir/van-volumes.tgz" || die "capture archive is corrupt"
  (cd "$dir" && sha256sum van-files.tgz van-volumes.tgz >SHA256SUMS)
  jq -n --arg at "$(date -u +%FT%TZ)" --arg sha "$(cat "$dir/old-app-sha")" --argjson final "$final" \
    --arg files "$(du -h "$dir/van-files.tgz" | cut -f1)" --arg vols "$(du -h "$dir/van-volumes.tgz" | cut -f1)" \
    '{schema:"dial.van-capture.v1", captured_at_utc:$at, old_app_sha:$sha, final:($final==1), files_archive:$files, volumes_archive:$vols}' >"$dir/manifest.json"
  ln -sfn "$dir" "$WORK/latest"
  (( final )) && ln -sfn "$dir" "$WORK/final" && date -u +%FT%TZ >"$STATE/van-state-final-captured"
  say "VAN_CAPTURE=GREEN final=$final dir=$dir volumes=$(wc -l <"$dir/mounts") files=$(jq -r .files_archive "$dir/manifest.json") vols=$(jq -r .volumes_archive "$dir/manifest.json")"
}

# VAN's own bootstrap, run detached on the host (it takes longer than one SSH session should).
van_bootstrap_remote() {
  local tag="$1"
  new_ssh "set -e; sudo -n test -d /opt/van-src/.git || sudo -n git clone -q '$VAN_REPO_URL' /opt/van-src
    sudo -n git -C /opt/van-src fetch -q origin main; sudo -n git -C /opt/van-src checkout -q --detach '$VAN_SHA'
    sudo -n systemctl reset-failed dial-van-bootstrap 2>/dev/null || true
    sudo -n systemd-run --unit=dial-van-bootstrap --collect -p StandardOutput=file:/var/log/dial-van-bootstrap-$tag.log -p StandardError=inherit \
      /bin/bash /opt/van-src/deploy/van-trading-core/bootstrap.sh --commit-sha='$VAN_SHA'"
  local i st
  for i in $(seq 1 180); do
    sleep 20
    st="$(new_ssh "systemctl is-active dial-van-bootstrap 2>/dev/null; true" | head -1)"
    [[ "$st" == active || "$st" == activating ]] || break
  done
  new_ssh "tail -n 25 /var/log/dial-van-bootstrap-$tag.log"
  new_ssh "sudo -n grep -q '^\[bootstrap\] ERROR' /var/log/dial-van-bootstrap-$tag.log" && die "VAN bootstrap ($tag) reported an error"
  new_ssh "systemctl is-failed --quiet dial-van-bootstrap" && die "VAN bootstrap ($tag) failed"
  return 0
}

require_new() {
  [[ "$(new_ssh hostname 2>/dev/null || true)" == van-trading-core ]] || die "re-roled host does not answer as van-trading-core at $NEW_VAN_IP"
  [[ "$(new_ssh 'uname -m')" == aarch64 ]] || die "re-roled host is not the A1 (aarch64)"
}

bootstrap_new() {
  require_new
  van_bootstrap_remote initial
  date -u +%FT%TZ >"$STATE/van-bootstrap-initial"
  say "VAN_BOOTSTRAP_INITIAL=GREEN sha=$VAN_SHA"
}

restore() {
  require_new
  local dir; dir="$(readlink -f "$WORK/final" 2>/dev/null || true)"
  [[ -d "$dir" && -f "$dir/old-services-stopped-at" ]] || die "no final (stopped-service) capture; run capture --final"
  (cd "$dir" && sha256sum -c --quiet SHA256SUMS) || die "final capture failed its checksum"
  [[ -f "$STATE/van-bootstrap-initial" ]] || die "run bootstrap-new first"
  # Stop the freshly bootstrapped VAN, lay the old state over it, then let VAN's bootstrap reconcile.
  new_ssh "for u in ${VAN_UNITS[*]}; do sudo -n systemctl stop \$u 2>/dev/null || true; done
    sudo -n docker ps --format '{{.Names}}' | grep -E '^(supabase-|realtime-|van-)' | xargs -r sudo -n docker stop >/dev/null; true"
  new_ssh "$REMOTE_MOUNTS" >"$dir/new-mounts"
  new_ssh "sudo -n rm -rf /tmp/van-restore; mkdir -p /tmp/van-restore"
  runuser -u ubuntu -- scp "${ID_ARGS[@]}" "${SSH_OPTS[@]}" -q "$dir/van-files.tgz" "$dir/van-volumes.tgz" "$dir/mounts" "$dir/new-mounts" "ubuntu@$NEW_VAN_IP:/tmp/van-restore/"
  new_ssh 'set -e; cd /tmp/van-restore
    sudo -n tar -C / -xpzf van-files.tgz
    mkdir -p vols; sudo -n tar -C vols -xpzf van-volumes.tgz
    # Old volume -> new volume, matched by (container, destination); named volumes keep their names.
    while read -r c vol dest; do
      new="$(awk -v c="$c" -v d="$dest" "\$1==c && \$3==d {print \$2}" new-mounts | head -1)"
      [ -n "$new" ] || { sudo -n docker volume create "$vol" >/dev/null; new="$vol"; }
      tgt="/var/lib/docker/volumes/$new/_data"
      sudo -n find "$tgt" -mindepth 1 -delete
      sudo -n cp -a "vols/$vol/_data/." "$tgt/"
      echo "restored $c:$dest $vol -> $new"
    done < mounts
    sudo -n rm -rf /tmp/van-restore'
  van_bootstrap_remote restore
  # Whatever VAN units were enabled on the old host are enabled here too (templates excepted).
  local units; units="$(grep -E '^vati[a-z0-9@.-]*\.(service|timer)$' "$dir/enabled-units" | grep -v '@\.' | tr '\n' ' ')"
  new_ssh "for u in $units; do sudo -n systemctl enable --now \$u >/dev/null 2>&1 || echo not-started:\$u; done"
  date -u +%FT%TZ >"$STATE/van-state-restored"
  say "VAN_RESTORE=GREEN from=$(jq -r .old_app_sha "$dir/manifest.json") to=$VAN_SHA"
}

qualify() {
  require_new
  local out rc=0
  out="$(new_ssh "sudo -n env VAN_EXPECTED_REPOSITORY_SHA='$VAN_SHA' bash /opt/van-trading/app/deploy/van-trading-core/qualify.sh")" || rc=$?
  printf '%s\n' "$out" >"$WORK/qualify-$(date -u +%Y%m%dT%H%M%SZ).json"
  jq -r '.checks[]? | select(.status!="GREEN") | "\(.check) \(.status) required=\(.required) \(.detail)"' <<<"$out" 2>/dev/null | head -40 || printf '%s\n' "$out" | tail -40
  (( rc == 0 )) || { say "VAN_QUALIFY=RED rc=$rc"; return 1; }
  date -u +%FT%TZ >"$STATE/van-state-restored-verified"
  say "VAN_QUALIFY=GREEN sha=$VAN_SHA"
}

status() {
  local m
  for m in old-van-access-verified van-state-final-captured van-rerole-reimaged van-bootstrap-initial van-state-restored van-state-restored-verified van-old-terminated van-trading-core-pending-rebuild; do
    say "$m=$(cat "$STATE/$m" 2>/dev/null | head -1 || echo absent)"
  done
  [[ -e "$WORK/latest" ]] && say "latest_capture=$(jq -c . "$WORK/latest/manifest.json" 2>/dev/null)"
}

case "$MODE" in
  access-old) access_old ;;
  capture) capture "${1:-}" ;;
  bootstrap-new) bootstrap_new ;;
  restore) restore ;;
  qualify) qualify ;;
  status) status ;;
  *) echo "usage: $0 access-old|capture [--final]|bootstrap-new|restore|qualify|status" >&2; exit 2 ;;
esac
