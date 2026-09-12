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
#   ~/p/run.sh log      show the last step's output

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

instance_ip() { jq -r '.public_ip // ""' instance.json 2>/dev/null; }

ssh_host() {
  ssh -i "$DIAL_SSH_PRIVATE_KEY_FILE" \
      -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
      "ubuntu@$(instance_ip)" "$@"
}

# Section 19 evidence. Kept as a file so the verdict is recorded, not just printed.
hermes_diff() {
  ./00-hermes-fingerprint.sh diff hermes-before.json hermes-after.json | tee hermes-diff.txt
}

# Written via a temp file: a partial SSH transfer must not leave a truncated report
# that later steps would read as real evidence.
collect_certification() {
  local ip tmp; ip="$(instance_ip)"; tmp="$(mktemp)"
  echo "Collecting host certification from $ip …"
  if ! ssh_host 'sudo dial-host-certify' > "$tmp" 2>/tmp/ssh-cert-err.$$; then
    # dial-host-certify exits non-zero for any verdict below GREEN, which is a
    # result, not a transport failure. Only an unparseable body means SSH failed.
    if ! jq -e . "$tmp" >/dev/null 2>&1; then
      cat /tmp/ssh-cert-err.$$ >&2; rm -f "$tmp" /tmp/ssh-cert-err.$$
      echo >&2
      echo "Could not collect certification over SSH." >&2
      echo "If the instance launched only minutes ago it is still running first boot" >&2
      echo "(apt, Node, repository clone). Wait a few minutes and run ~/p/run.sh again." >&2
      return 1
    fi
  fi
  rm -f /tmp/ssh-cert-err.$$
  mv "$tmp" host-certification.json
  jq -r '"host verdict: \(.certification.state) — \(.certification.reason)"' host-certification.json
}

final_report() {
  node 30-certify.mjs --host-report host-certification.json
  local rc=$?
  # 2 is AMBER: healthy host, Commander not yet proven. That is expected progress
  # before pairing, so it must not read as a failed step.
  [[ $rc -eq 2 ]] && return 0
  return $rc
}

if   [[ ! -f hermes-before.json ]]; then step=(./00-hermes-fingerprint.sh snapshot hermes-before.json)
elif [[ ! -f network.json      ]]; then step=(./10-network-preflight.sh)
elif [[ ! -f instance.json     ]]; then step=(./20-launch-oracle-admin.sh)
elif [[ ! -f hermes-after.json ]]; then step=(./00-hermes-fingerprint.sh snapshot hermes-after.json)
elif [[ ! -f hermes-diff.txt   ]]; then step=(hermes_diff)
elif [[ ! -s host-certification.json ]]; then step=(collect_certification)
else step=(final_report)
fi

printf '\n>>> %s\n\n' "${step[*]}"
"${step[@]}" 2>&1 | tee "$LOG"
rc=${PIPESTATUS[0]}

printf '\n'
if [[ $rc -ne 0 ]]; then
  printf 'STEP FAILED (exit %s). Do not re-run blindly — read the error above.\n' "$rc"
  printf 'Full output is in %s/%s\n\n' "$PWD" "$LOG"
  exit $rc
fi

if [[ "${step[0]}" == "final_report" ]]; then
  ip="$(instance_ip)"
  cat <<EOF

The only step left needs a browser and cannot be automated:

  ssh -i "\$DIAL_SSH_PRIVATE_KEY_FILE" -t ubuntu@$ip 'sudo -u ubuntu dial-commander-pair'

Approve the code it prints. Then, from the authorized client with the
oracle-admin device selected, run:  dial-commander-record-proof
Then run ~/p/run.sh once more for the final GREEN certification.

EOF
else
  printf 'STEP OK. Run ~/p/run.sh again for the next step.\n\n'
fi
