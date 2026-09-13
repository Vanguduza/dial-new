#!/usr/bin/env bash
# Records evidence that a command actually executed on oracle-admin THROUGH the
# authorized Desktop Commander client.
#
# Task brief section 18: "The success condition is not 'package installed.'" This
# script is the mechanism that makes the difference checkable. The owner asks the
# authorized client (ChatGPT, with the oracle-admin Commander device selected) to
# run:
#
#     dial-commander-record-proof
#
# The resulting file cannot be produced by the host on its own initiative in any
# way that would matter: it captures the caller's process ancestry, so a proof
# written by a local shell is distinguishable from one written by a Commander tool
# call. commander-probe.sh then promotes PING_RESPONDS and COMMAND_EXECUTES to
# GREEN only for a fresh, well-formed proof.
#
# It also collects exactly the section 18 evidence set: ping, hostname, uname -a,
# a filesystem read, and one harmless shell command.

set -uo pipefail

PROOF="${COMMANDER_PROOF:-/var/lib/dial-recovery/commander/proof.json}"
PROOF_DIR="$(dirname "$PROOF")"
install -d -m 750 "$PROOF_DIR" 2>/dev/null || true

# Say so here rather than letting the redirection below fail with a bare shell error
# that the Commander client shows as an empty result. This is the exact failure that
# kept the client criteria UNVERIFIED on a host where Commander was working perfectly:
# the directory was root-owned and this script does not run as root.
# Both halves matter. "Writable" alone passes when the path exists but is a FILE, and
# the script then falls through to a bare "Not a directory" from the redirection —
# which the Commander client renders as an empty result, the very failure mode this
# guard exists to replace.
if [[ ! -d "$PROOF_DIR" || ! -w "$PROOF_DIR" ]]; then
  echo "Cannot write the execution proof: $PROOF_DIR is not a writable directory for $(id -un)." >&2
  echo "Fix on the host with:" >&2
  echo "  sudo install -d -m 750 -o $(id -un) -g $(id -gn) $PROOF_DIR" >&2
  echo "or re-run bootstrap, which now creates it with the right owner." >&2
  exit 4
fi

# Walk the process ancestry looking for the Commander device process. A genuine
# tool call is a descendant of `desktop-commander remote`; an interactive SSH shell
# is a descendant of sshd.
ancestry=""
pid=$$
for _ in 1 2 3 4 5 6 7 8; do
  ppid="$(awk '/^PPid:/{print $2}' "/proc/$pid/status" 2>/dev/null)" || break
  [[ -z "${ppid:-}" || "$ppid" == "0" ]] && break
  cmd="$(tr '\0' ' ' < "/proc/$ppid/cmdline" 2>/dev/null | cut -c1-160)"
  ancestry+="${cmd}"$'\n'
  pid="$ppid"
done

via="unknown"
grep -qi 'desktop-commander' <<<"$ancestry" && via="desktop-commander"
[[ "$via" == "unknown" ]] && grep -qi 'sshd' <<<"$ancestry" && via="ssh"

ping_result="$(ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 && echo ok || echo failed)"
fs_read="$(head -c 64 /etc/os-release 2>/dev/null | tr '\n' ' ')"

jq -n \
  --arg executed_via "$via" \
  --arg hostname "$(hostname)" \
  --arg uname "$(uname -a)" \
  --arg at "$(date -u +%FT%TZ)" \
  --arg ping "$ping_result" \
  --arg fs_read "$fs_read" \
  --arg harmless "$(id -un)@$(hostname):$(pwd)" \
  --arg uptime "$(uptime -p 2>/dev/null)" \
  --arg ancestry "$ancestry" \
  '{schema_version:1,
    executed_via:$executed_via,
    hostname:$hostname,
    uname:$uname,
    recorded_at:$at,
    evidence:{ping:$ping, filesystem_read:$fs_read, harmless_command:$harmless, uptime:$uptime},
    caller_ancestry:$ancestry}' > "$PROOF"

chmod 640 "$PROOF"
cat "$PROOF"

if [[ "$via" != "desktop-commander" ]]; then
  echo >&2
  echo "NOTE: this proof was written via '$via', not through Desktop Commander." >&2
  echo "      commander-probe.sh will NOT promote the client criteria from it." >&2
  exit 3
fi
