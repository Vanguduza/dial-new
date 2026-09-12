#!/usr/bin/env bash
# One short command that runs whatever provisioning step comes next.
#
#   ~/p/run.sh
#
# Typing long paths on a phone keyboard is its own failure mode: a mangled command
# either errors or, worse, half-runs. This picks the next step from which artefacts
# already exist, so there is nothing to remember and no way to run a step twice or
# out of order.
#
# Runs in the FOREGROUND. Use it inside tmux (`tmux new -s dial`, reattach with
# `tmux attach -t dial`) — tmux already survives a dropped connection, so nohup
# would only hide the output.
#
#   ~/p/run.sh status   show state without doing anything
#   ~/p/run.sh log      show the last run's output

set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")" || exit 1

LOG=run.log
mode="${1:-next}"

# shellcheck source=/dev/null
source ./env.sh

case "$mode" in
  status) exit 0 ;;
  log)    tail -60 "$LOG" 2>/dev/null || echo "no $LOG yet"; exit 0 ;;
esac

if   [[ ! -f hermes-before.json ]]; then
  step=(./00-hermes-fingerprint.sh snapshot hermes-before.json)
elif [[ ! -f network.json ]]; then
  step=(./10-network-preflight.sh)
elif [[ ! -f instance.json ]]; then
  step=(./20-launch-oracle-admin.sh)
elif [[ ! -f hermes-after.json ]]; then
  step=(./00-hermes-fingerprint.sh snapshot hermes-after.json)
else
  ip="$(jq -r '.public_ip // "unknown"' instance.json 2>/dev/null)"
  cat <<EOF

All provisioning steps are done. Public IP: $ip

Remaining steps need your input, so they are not automated here:

  1. Prove Hermes was untouched
     ./00-hermes-fingerprint.sh diff hermes-before.json hermes-after.json

  2. Collect host certification (wait ~10 min after launch for first boot)
     ssh -i "\$DIAL_SSH_PRIVATE_KEY_FILE" ubuntu@$ip 'sudo dial-host-certify' > host-certification.json
     node 30-certify.mjs --host-report host-certification.json

  3. Authorize Desktop Commander (one-time, opens a browser code)
     ssh -i "\$DIAL_SSH_PRIVATE_KEY_FILE" -t ubuntu@$ip 'sudo -u ubuntu dial-commander-pair'

EOF
  exit 0
fi

printf '\n>>> %s\n\n' "${step[*]}"
# Tee so the output is both on screen and kept for `run.sh log`.
"${step[@]}" 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}

printf '\n'
if [[ $rc -eq 0 ]]; then
  printf 'STEP OK. Run ~/p/run.sh again for the next step.\n\n'
else
  printf 'STEP FAILED (exit %s). Do not re-run blindly — read the error above.\n' "$rc"
  printf 'Full output is in %s/%s\n\n' "$PWD" "$LOG"
fi
exit $rc
