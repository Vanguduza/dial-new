#!/usr/bin/env bash
# Runs every remaining provisioning step, in order, until something needs a human.
#
#   ~/p/run.sh            do everything that can be done unattended
#   ~/p/run.sh recheck    re-collect certification after Commander pairing
#   ~/p/run.sh diagnose   probe the host directly and show what is wrong
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

instance_ip() { jq -r '.public_ip // ""' instance.json 2>/dev/null; }

ssh_host() {
  if [[ -z "${DIAL_SSH_PRIVATE_KEY_FILE:-}" || ! -r "$DIAL_SSH_PRIVATE_KEY_FILE" ]]; then
    echo "No readable SSH private key. Set DIAL_SSH_PRIVATE_KEY_FILE and re-source env.sh." >&2
    return 78
  fi
  ssh -i "$DIAL_SSH_PRIVATE_KEY_FILE" \
      -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
      "ubuntu@$(instance_ip)" "$@"
}

diagnose() {
  local ip; ip="$(instance_ip)"
  echo "Probing $ip directly."
  echo
  echo "--- can we open an SSH session at all? ---"
  ssh_host 'echo SSH_OK; id -un; uptime -p'
  echo "ssh exit: $?"
  echo
  echo "--- is the certification tool installed? ---"
  ssh_host 'ls -l /usr/local/bin/dial-host-certify 2>&1; ls -l /opt/dial-recovery 2>&1 | head'
  echo
  echo "--- did cloud-init finish, and what did bootstrap do? ---"
  ssh_host 'cloud-init status 2>&1; sudo jq -c ".phases" /var/lib/dial-recovery/bootstrap-state.json 2>&1'
  echo
  echo "--- last 25 lines of the bootstrap log ---"
  ssh_host 'sudo tail -25 /var/log/oracle-admin-bootstrap.log 2>&1'
  echo
  echo "--- run dial-host-certify and show BOTH streams ---"
  # An empty body is exactly what stalled collection, so capture the streams apart
  # rather than reading an empty stdout as "nothing wrong".
  ssh_host 'sudo dial-host-certify >/tmp/dhc.out 2>/tmp/dhc.err; echo "exit=$?";
            echo "--stdout (first 400 bytes)--"; head -c 400 /tmp/dhc.out; echo;
            echo "--stderr (last 20 lines)--";  tail -20 /tmp/dhc.err'
}

case "$mode" in
  status) exit 0 ;;
  log)    tail -80 "$LOG" 2>/dev/null || echo "no $LOG yet"; exit 0 ;;
  diagnose) diagnose; exit 0 ;;
  recheck)
    # Commander pairing changes the host's state, so the old evidence is stale.
    rm -f host-certification.json certification-report.json
    echo "Cleared previous certification; collecting fresh evidence."
    ;;
esac

# Section 19 evidence. Kept as a file so the verdict is recorded, not just printed.
hermes_diff() {
  ./00-hermes-fingerprint.sh diff hermes-before.json hermes-after.json | tee hermes-diff.txt
}

LAST_SSH_RC=""; LAST_SSH_ERR=""; LAST_BODY=""

_try_collect() {
  local tmp err; tmp="$(mktemp)"; err="$(mktemp)"
  ssh_host 'sudo dial-host-certify' > "$tmp" 2>"$err"
  local rc=$?

  # The exit code cannot decide this: dial-host-certify exits non-zero for any
  # verdict below GREEN, which is a result, not a failure. So the BODY decides, and
  # it must contain a certification state.
  #
  # Validate it UNCONDITIONALLY. The previous version only validated when ssh
  # reported failure, so a connection that returned exit 0 with an empty body was
  # accepted without any check at all: it wrote an empty host-certification.json,
  # the step-chooser saw the artefact still missing, and re-queued the step forever.
  if jq -e '.certification.state' "$tmp" >/dev/null 2>&1; then
    # Report success only if the artefact is actually on disk afterwards. Returning
    # 0 on the strength of having parsed the body meant a failed `mv` still counted
    # as collected, and the step was then re-queued forever against an empty file.
    local mverr; mverr="$(mv "$tmp" host-certification.json 2>&1)"
    if [[ -s host-certification.json ]]; then rm -f "$err"; return 0; fi
    LAST_SSH_RC="$rc"
    LAST_SSH_ERR="could not write host-certification.json: ${mverr:-unknown error}"
    LAST_BODY=""
    rm -f "$tmp" "$err"
    return 1
  fi

  LAST_SSH_RC="$rc"
  LAST_SSH_ERR="$(head -c 400 "$err")"
  LAST_BODY="$(head -c 300 "$tmp")"
  rm -f "$tmp" "$err"
  return 1
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
    # Say why, every time. Silence here is what made the last failure unreadable.
    echo "  no certification yet (ssh exit ${LAST_SSH_RC:-?})"
    [[ -n "$LAST_SSH_ERR" ]] && echo "  stderr: ${LAST_SSH_ERR%%$'\n'*}"
    [[ -n "$LAST_BODY"    ]] && echo "  body:   ${LAST_BODY%%$'\n'*}"
    [[ $i -lt $attempts ]] && sleep 60
  done
  echo >&2
  echo "Could not collect certification after $attempts attempts." >&2
  echo "Run  ~/p/run.sh diagnose  to see what the host is actually doing." >&2
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
# An earlier bug could leave a zero-byte artefact behind. It is not evidence of
# anything, and keeping it only confuses the step-chooser and the reader.
# Deliberately only the certification artefacts: clearing an empty network.json or
# instance.json would re-run the preflight or the launch, and infrastructure steps
# must never be re-triggered by a tidy-up.
for stale in host-certification.json certification-report.json; do
  if [[ -f "$stale" && ! -s "$stale" ]]; then
    echo "Removing empty $stale left by an earlier failed run."
    rm -f "$stale"
  fi
done

last_step=""; repeats=0

while :; do
  if   [[ ! -f hermes-before.json ]]; then step=(./00-hermes-fingerprint.sh snapshot hermes-before.json)
  elif [[ ! -f network.json       ]]; then step=(./10-network-preflight.sh)
  elif [[ ! -f instance.json      ]]; then step=(./20-launch-oracle-admin.sh)
  elif [[ ! -f hermes-after.json  ]]; then step=(./00-hermes-fingerprint.sh snapshot hermes-after.json)
  elif [[ ! -f hermes-diff.txt    ]]; then step=(hermes_diff)
  elif [[ ! -s host-certification.json   ]]; then step=(collect_certification)
  elif [[ ! -s certification-report.json ]]; then step=(final_report)
  else break
  fi

  # Structural safety net: a step that reports success without producing its
  # artefact would otherwise be re-queued forever. Never spin.
  if [[ "${step[*]}" == "$last_step" ]]; then
    repeats=$((repeats + 1))
    if [[ $repeats -ge 2 ]]; then
      printf '\nABORTING: step "%s" reported success but produced no artefact.\n' "${step[*]}"
      printf 'Run  ~/p/run.sh diagnose  for the host-side detail.\n\n'
      exit 1
    fi
  else
    repeats=0
  fi
  last_step="${step[*]}"

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
