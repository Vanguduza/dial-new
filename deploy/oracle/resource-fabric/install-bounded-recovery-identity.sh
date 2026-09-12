#!/usr/bin/env bash
# Install the inbound half of the second recovery direction (Rev 3 sections 5.2, 5.4).
#
# Runs ON AN E2 ADMIN HOST. It authorizes dial-hermes-control's bounded-recovery public
# key, restricted to the forced command in bounded-recovery-command.sh, restricted to
# Hermes's private address, with every forwarding channel closed.
#
#   install-bounded-recovery-identity.sh <path-to-hermes-bounded-recovery.pub>
#   install-bounded-recovery-identity.sh --remove      # revoke, leaving E2 -> Hermes intact
#   install-bounded-recovery-identity.sh --verify      # report, change nothing
#
# It takes a PUBLIC key only. Never move a private key between hosts, and never generate
# the Hermes key here -- it is generated on Hermes, and only its .pub travels.

set -uo pipefail

FABRIC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_ID="${DIAL_FABRIC_HOST_ID:-$(hostname)}"
AUTH_KEYS="${DIAL_AUTHORIZED_KEYS:-$HOME/.ssh/authorized_keys}"
FORCED_CMD="${DIAL_BOUNDED_RECOVERY_CMD:-/usr/local/bin/dial-bounded-recovery}"
MARKER="dial-bounded-recovery@dial-hermes-control"

die() { echo "install-bounded-recovery-identity: $*" >&2; exit 1; }

# --- Who may hold the inbound half ------------------------------------------------
# Only a RECOVERY-role host. Installing this on Hermes itself would create the symmetric
# mesh Rev 2 section 4.2 warns against, which is the one outcome this design must avoid.
read -r ROLE_OK PEER_IP < <(node -e '
  const f = require(process.argv[1]);
  const self = f.hosts.find((h) => h.host_id === process.argv[2]);
  const peer = f.hosts.find((h) => h.roles.includes("BOUNDED_RECOVERY"));
  const ok = Boolean(self && self.roles.includes("RECOVERY") && peer && peer.recovers.includes(self.host_id));
  process.stdout.write(`${ok ? "yes" : "no"} ${peer ? peer.private_ip : "none"}\n`);
' "$FABRIC_DIR/hosts.json" "$HOST_ID" 2>/dev/null) \
  || die "could not read hosts.json"

[[ "$ROLE_OK" == "yes" ]] \
  || die "$HOST_ID is not a RECOVERY host named in the bounded recoverer's recovers list; refusing"
[[ "$PEER_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  || die "bounded recoverer has no usable private_ip in hosts.json; refusing to install an unrestricted entry"

mkdir -p "$(dirname "$AUTH_KEYS")" && chmod 700 "$(dirname "$AUTH_KEYS")"
touch "$AUTH_KEYS" && chmod 600 "$AUTH_KEYS"

current_entry() { grep -F "$MARKER" "$AUTH_KEYS" 2>/dev/null || true; }

case "${1:-}" in
  --verify)
    entry="$(current_entry)"
    if [[ -z "$entry" ]]; then echo "ABSENT: no bounded-recovery entry on $HOST_ID"; exit 1; fi
    for required in "command=\"$FORCED_CMD\"" "from=\"$PEER_IP\"" \
                    no-agent-forwarding no-port-forwarding no-X11-forwarding no-pty; do
      grep -qF "$required" <<<"$entry" || { echo "DEGRADED: entry is missing $required"; exit 2; }
    done
    echo "PRESENT and correctly restricted on $HOST_ID (peer $PEER_IP, forced command $FORCED_CMD)"
    exit 0 ;;
  --remove)
    # Separately revocable (section 5.4 rule 5): this removes only the Hermes -> E2
    # capability. The E2's own outbound key into Hermes is a different file and untouched.
    tmp="$(mktemp)"
    grep -vF "$MARKER" "$AUTH_KEYS" > "$tmp" 2>/dev/null || true
    cat "$tmp" > "$AUTH_KEYS" && rm -f "$tmp"
    echo "Revoked the bounded-recovery entry on $HOST_ID. E2 -> Hermes recovery is unaffected."
    exit 0 ;;
esac

PUBKEY_FILE="${1:-}"
[[ -n "$PUBKEY_FILE" && -r "$PUBKEY_FILE" ]] || die "usage: $0 <hermes-bounded-recovery.pub> | --verify | --remove"

pubkey="$(tr -d '\r\n' < "$PUBKEY_FILE")"
[[ "$pubkey" =~ ^(ssh-ed25519|ecdsa-sha2-nistp[0-9]+|ssh-rsa)[[:space:]]+[A-Za-z0-9+/=]+ ]] \
  || die "that file is not an OpenSSH public key"
[[ "$pubkey" == *"PRIVATE KEY"* ]] && die "that is a PRIVATE key. Never copy a private key between hosts."

# Section 5.4 rule 1: distinct identities. If this key material is already authorized here
# without our marker, it is some other identity's key -- most likely the operator's own or
# the reverse recovery key -- and binding a forced command to it would either break that
# access or silently widen this one.
keydata="$(awk '{print $2}' <<<"$pubkey")"
if grep -F "$keydata" "$AUTH_KEYS" 2>/dev/null | grep -vF "$MARKER" | grep -q .; then
  die "this key is already authorized on $HOST_ID under a different entry. The bounded
recovery identity MUST be a distinct key (section 5.4 rule 1). Generate a dedicated
keypair on dial-hermes-control and supply only its .pub."
fi

[[ -x "$FORCED_CMD" ]] || die "forced command $FORCED_CMD is not installed or not executable.
Install bounded-recovery-command.sh there first -- authorizing the key before the
restriction exists would briefly grant an unrestricted shell."

options="command=\"$FORCED_CMD\",from=\"$PEER_IP\",restrict,no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty"
line="$options $pubkey $MARKER"

tmp="$(mktemp)"
grep -vF "$MARKER" "$AUTH_KEYS" > "$tmp" 2>/dev/null || true
printf '%s\n' "$line" >> "$tmp"

# Prove sshd will accept the file before it becomes the file. A malformed authorized_keys
# does not fail loudly -- it fails as "permission denied" during the next outage.
if command -v ssh-keygen >/dev/null 2>&1; then
  ssh-keygen -l -f "$tmp" >/dev/null 2>&1 || { rm -f "$tmp"; die "resulting authorized_keys did not parse; nothing changed"; }
fi

cat "$tmp" > "$AUTH_KEYS" && rm -f "$tmp"
chmod 600 "$AUTH_KEYS"

echo "Authorized the bounded-recovery identity on $HOST_ID."
echo "  peer allowed from : $PEER_IP"
echo "  forced command    : $FORCED_CMD"
echo "  capability        : R0 observe + R1 restart of this host's recovery units only"
echo "  revoke with       : $0 --remove"
