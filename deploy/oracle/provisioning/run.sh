#!/usr/bin/env bash
# Runs every remaining provisioning step, in order, until something needs a human.
#
#   ~/p/run.sh            do everything that can be done unattended
#   ~/p/run.sh recheck    re-collect certification after Commander pairing
#   ~/p/run.sh status     show state, change nothing
#   ~/p/run.sh log        show the last run's output
#
# Steps are chosen from which artefacts exist, so this is safe to re-run at any
# point: completed work is skipped, nothing runs twice or out of order. It waits
# out first boot on its own rather than asking for another manual attempt.
#
# Runs in the FOREGROUND. Use it inside tmux (`tmux new -s dial`, reattach with
# `tmux attach -t dial`) — tmux already survives a dropped connection.

set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")" || exit 1

LOG=run.log
mode="${1:-next}"

# shellcheck source=/dev/null
source ./env.sh

case "$mode" in
  status) exit 0 ;;
  log)    tail -80 "$LOG" 2>/dev/null || echo "no $LOG yet"; exit 0 ;;
  recheck)
    # Commander pairing changes the host's state, so the old evidence is stale.
    rm -f host-certification.json certification-report.json
    echo "Cleared previous certification; collecting fresh evidence."
    ;;
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

_try_collect() {
  local tmp; tmp="$(mktemp)"
  if ! ssh_host 'sudo dial-host-certify' > "$tmp" 2>/dev/null; then
    # dial-host-certify exits non-zero for any verdict below GREEN, which is a
    # result, not a transport failure. Only an unparseable body means SSH failed.
    if ! jq -e . "$tmp" >/dev/null 2>&1; then rm -f "$tmp"; return 1; fi
  fi
  mv "$tmp" host-certification.json
}

# First boot installs Node, clones the repository and stages the recovery plane on a
# 1 GB host, so SSH legitimately refuses for several minutes after launch. Waiting
# here is the script's job, not the operator's.
collect_certification() {
  local attempts="${DIAL_CERT_ATTEMPTS:-10}" i
  for ((i = 1; i <= attempts; i++)); do
    echo "Collecting host certification from $(instance_ip) (attempt $i/$attempts) …"
    if _try_collect; then
      jq -r '"host verdict: \(.certification.state) — \(.certification.reason)"' host-certification.json
      return 0
    fi
    if [[ $i -lt $attempts ]]; then
      echo "  not reachable yet — still in first boot. Waiting 60s."
      sleep 60
    fi
  done
  echo >&2
  echo "Could not collect certification after $attempts attempts." >&2
  echo "Check the instance is RUNNING in the console, then run ~/p/run.sh again." >&2
  return 1
}

final_report() {
  node 30-certify.mjs --host-report host-certification.json
  local rc=$?
  # 2 is AMBER: healthy host, Commander not yet proven. Expected before pairing.
  [[ $rc -eq 2 ]] && return 0
  return $rc
}

: > "$LOG"

while :; do
  if   [[ ! -f hermes-before.json ]]; then step=(./00-hermes-fingerprint.sh snapshot hermes-before.json)
  elif [[ ! -f network.json       ]]; then step=(./10-network-preflight.sh)
  elif [[ ! -f instance.json      ]]; then step=(./20-launch-oracle-admin.sh)
  elif [[ ! -f hermes-after.json  ]]; then step=(./00-hermes-fingerprint.sh snapshot hermes-after.json)
  elif [[ ! -f hermes-diff.txt    ]]; then step=(hermes_diff)
  elif [[ ! -s host-certification.json  ]]; then step=(collect_certification)
  elif [[ ! -s certification-report.json ]]; then step=(final_report)
  else break
  fi

  printf '\n>>> %s\n\n' "${step[*]}"
  "${step[@]}" 2>&1 | tee -a "$LOG"
  rc=${PIPESTATUS[0]}

  if [[ $rc -ne 0 ]]; then
    printf '\nSTEP FAILED (exit %s): %s\n' "$rc" "${step[*]}"
    printf 'Read the error above. Full output: %s/%s\n\n' "$PWD" "$LOG"
    exit $rc
  fi
done

state="$(jq -r '.certification.state // "unknown"' certification-report.json 2>/dev/null)"
ip="$(instance_ip)"

printf '\n=====================================================\n'
printf 'CERTIFICATION: %s\n' "$state"
printf '=====================================================\n\n'

if [[ "$state" == "GREEN" ]]; then
  printf 'oracle-admin is a proven recovery foothold. Nothing further to run.\n\n'
  exit 0
fi

cat <<EOF
Everything that can be automated is done. One step left, and it needs a browser:

  1. Pair Desktop Commander (one time):

     ssh -i "\$DIAL_SSH_PRIVATE_KEY_FILE" -t ubuntu@$ip 'sudo -u ubuntu dial-commander-pair'

     It prints a URL and a short code. Approve it in your browser.

  2. In ChatGPT, with the oracle-admin device selected, run:

     dial-commander-record-proof

  3. Back here, once:

     ~/p/run.sh recheck

EOF
