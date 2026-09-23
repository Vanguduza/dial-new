#!/usr/bin/env bash
# Owner OCI browser login -> durable, least-privilege recovery API key on dial-control.
#
#   oci-edge-login.sh start  [region]                 open the browser-login bridge
#   oci-edge-login.sh status                          PENDING_OWNER_LOGIN | SESSION_READY | ABSENT
#   oci-edge-login.sh finish <tenancy-ocid> [region]  session -> dedicated user + API key, then teardown
#   oci-edge-login.sh abort                           revoke/remove the session and stop the bridge
#
# Facts this relies on, read from the pinned oci-cli 3.93.0 source (oci_cli/cli_setup_bootstrap.py,
# oci_cli/cli_session.py), not recalled:
#   - `session authenticate` binds 0.0.0.0:8181 and waits with NO timeout until one GET carries
#     `security_token`; any caller can end the wait. The bridge therefore carries its own
#     RuntimeMaxSec, and `finish` refuses a token whose `tenant` claim is not the expected tenancy.
#   - The auth URL carries the session public key and is printed in a PUBLIC Actions log, so a
#     third party could complete a login to THEIR tenancy with it. The tenant check is the defence.
#   - The session token is proof-of-possession bound to a private key that never leaves this host.
#   - The session is written to <token-location>/<profile>/{token,oci_api_key.pem,
#     oci_api_key_public.pem} and <config-location>. Session TTL is 5-60 minutes.
#
# The session is used exactly once: to create or reconcile the dedicated recovery identity and
# register the recovery public key prepared by prepare-oci-recovery.sh. It is then revoked and
# deleted. No private key, token or config content is ever printed.
set -Eeuo pipefail
umask 077

MODE="${1:-}"
ADMIN_USER="${DIAL_OCI_ADMIN_USER:-ubuntu}"
ADMIN_HOME="${DIAL_OCI_ADMIN_HOME:-/home/$ADMIN_USER}"
LIB="${DIAL_CONTROL_LIB:-/usr/local/lib/dial-control}"
STATE="${DIAL_OCI_EDGE_STATE:-/var/lib/dial-control/oci-edge-auth}"
READY_MARKER="${DIAL_OCI_READY_MARKER:-/var/lib/dial-control/github-oidc/github-oci-ready}"
ESTATE="${DIAL_OCI_ESTATE_FILE:-/etc/dial/oracle-estate.env}"
PROFILE=DIAL_EDGE_SESSION
SESSION_CONFIG="$ADMIN_HOME/.oci/edge-session-config"
SESSION_ROOT="$ADMIN_HOME/.oci/edge-session"
SESSION_DIR="$SESSION_ROOT/$PROFILE"
RECOVERY_PUB="$ADMIN_HOME/.oci/netcup-hermes-recovery_public.pem"
RECOVERY_KEY="$ADMIN_HOME/.oci/netcup-hermes-recovery.pem"
BRIDGE_MAX_SECONDS="${DIAL_OCI_EDGE_MAX_SECONDS:-1800}"
CLOUDFLARED_VERSION=2026.9.1
CLOUDFLARED_SHA256=03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc

# Names of the tenancy-level IAM objects this flow owns. Reconciled, never duplicated.
RECOVERY_NAME=dial-netcup-recovery
RUNCOMMAND_DG=dial-oracle-estate-runcommand

die() { echo "OCI_EDGE_LOGIN_REFUSED: $*" >&2; exit "${2:-2}"; }
say() { printf '%s\n' "$*"; }

[[ "$(hostname)" == "${DIAL_EXPECT_HOST:-dial-control}" ]] || die "wrong host"
if [[ "${DIAL_OCI_AS_USER:-1}" == 1 && "$(id -u)" -ne 0 ]]; then die "must run as root"; fi

# Every OCI call runs as the admin user, never as root, with an explicit auth selection.
as_admin() {
  if [[ "${DIAL_OCI_AS_USER:-1}" == 1 ]]; then
    /usr/sbin/runuser -u "$ADMIN_USER" -- env HOME="$ADMIN_HOME" \
      PATH="$ADMIN_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" "$@"
  else
    env HOME="$ADMIN_HOME" "$@"
  fi
}
oci_session() { as_admin oci --config-file "$SESSION_CONFIG" --profile "$PROFILE" --auth security_token "$@"; }
oci_durable() { as_admin oci --config-file "$ADMIN_HOME/.oci/config" --profile DEFAULT "$@"; }

session_present() { [[ -s "$SESSION_CONFIG" && -s "$SESSION_DIR/token" ]]; }
bridge_active() {
  systemctl list-units --type=service --state=active --no-legend 'dial-oci-edge-session-*' 2>/dev/null | grep -q .
}

# JWT payload claims, decoded locally. Prints "sub tenant exp" and nothing else.
token_claims() {
  python3 - "$SESSION_DIR/token" <<'PY'
import base64, json, sys
tok = open(sys.argv[1]).read().strip().split('.')
if len(tok) != 3:
    sys.exit(3)
p = tok[1] + '=' * (-len(tok[1]) % 4)
c = json.loads(base64.urlsafe_b64decode(p))
print(c.get('sub', ''), c.get('tenant', ''), int(c.get('exp', 0)))
PY
}

# Same fingerprint form OCI reports for an API key (MD5 over DER, colon separated).
recovery_fingerprint() {
  openssl rsa -pubout -outform DER -in "$RECOVERY_KEY" 2>/dev/null | openssl md5 -c | awk '{print $2}'
}

stop_bridge() {
  local u
  for u in $(systemctl list-units --type=service --all --no-legend 'dial-oci-edge-*' 2>/dev/null | awk '{print $1}'); do
    systemctl stop "$u" >/dev/null 2>&1 || true
  done
}

# Revoke first (while the token still exists), then delete every session artefact.
destroy_session() {
  if session_present; then
    oci_session session terminate >/dev/null 2>&1 || true
  fi
  stop_bridge
  rm -rf "$SESSION_ROOT" "$SESSION_CONFIG"
  rm -f "$STATE/oci.log" "$STATE/tunnel.log"
}

start() {
  local region="${1:-af-johannesburg-1}"
  [[ "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]] || die "invalid region"
  local oci_bin cf_bin
  oci_bin="$(command -v oci || true)"
  [[ -x "$oci_bin" ]] || die "OCI CLI missing" 31
  local real; real="$(readlink -f "$oci_bin")"
  [[ "$real" == /opt/oci-cli/* ]] && chmod -R a+rX /opt/oci-cli
  as_admin "$oci_bin" --version >/dev/null 2>&1 || {
    namei -l "$real" || true
    die "OCI CLI is not executable by $ADMIN_USER" 36
  }

  cf_bin="$(command -v cloudflared || true)"
  if [[ ! -x "$cf_bin" ]]; then
    local tmp; tmp="$(mktemp /tmp/cloudflared.XXXXXX)"
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
      --connect-timeout 10 --max-time 120 --retry 3 --retry-delay 2 \
      "https://github.com/cloudflare/cloudflared/releases/download/$CLOUDFLARED_VERSION/cloudflared-linux-amd64" -o "$tmp"
    echo "$CLOUDFLARED_SHA256  $tmp" | sha256sum -c - >/dev/null
    install -m 0755 "$tmp" /usr/local/bin/cloudflared
    rm -f "$tmp"
    cf_bin=/usr/local/bin/cloudflared
  fi

  # A new login replaces any previous, unfinished one. Never two listeners.
  destroy_session
  install -d -m 0700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$ADMIN_HOME/.oci" "$STATE" "$SESSION_ROOT"
  fuser -k 8181/tcp >/dev/null 2>&1 || true

  local stamp; stamp="$(date +%s%N)"
  # RuntimeMaxSec: the CLI itself never gives up waiting, so the bridge must.
  systemd-run --unit="dial-oci-edge-session-$stamp" \
    --property=User="$ADMIN_USER" --property=Group="$ADMIN_USER" \
    --property=RuntimeMaxSec="$BRIDGE_MAX_SECONDS" \
    --property=WorkingDirectory="$ADMIN_HOME" \
    --setenv=HOME="$ADMIN_HOME" --setenv=BROWSER=/bin/false --setenv=PYTHONUNBUFFERED=1 \
    --setenv=PATH="$ADMIN_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
    /bin/bash -c "exec '$oci_bin' session authenticate --region '$region' --profile-name '$PROFILE' \
      --config-location '$SESSION_CONFIG' --token-location '$SESSION_ROOT' \
      --session-expiration-in-minutes 60 >'$STATE/oci.log' 2>&1" >/dev/null

  local auth_url="" i
  for i in $(seq 1 30); do
    auth_url="$(grep -Eo 'https://login\.[^[:space:]]+' "$STATE/oci.log" 2>/dev/null | head -1 || true)"
    [[ -n "$auth_url" && "$(ss -ltnH 'sport = :8181' 2>/dev/null | wc -l)" -ge 1 ]] && break
    sleep 2
  done
  [[ -n "$auth_url" ]] || { destroy_session; die "OCI authorization URL did not appear" 33; }
  [[ "$(ss -ltnH 'sport = :8181' 2>/dev/null | wc -l)" -ge 1 ]] || { destroy_session; die "OCI callback listener is not active" 34; }

  systemd-run --unit="dial-oci-edge-tunnel-$stamp" --property=RuntimeMaxSec="$BRIDGE_MAX_SECONDS" \
    /bin/bash -c "exec '$cf_bin' tunnel --no-autoupdate --url http://127.0.0.1:8181 >'$STATE/tunnel.log' 2>&1" >/dev/null

  local callback=""
  for i in $(seq 1 45); do
    callback="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/tunnel.log" 2>/dev/null | head -1 || true)"
    [[ -n "$callback" ]] && break
    sleep 2
  done
  [[ -n "$callback" ]] || { destroy_session; die "HTTPS callback bridge did not become ready" 35; }

  say "OCI_EDGE_AUTH_URL=$auth_url"
  say "OCI_EDGE_CALLBACK_URL=$callback"
  say "OCI_EDGE_BRIDGE_EXPIRES_IN_SECONDS=$BRIDGE_MAX_SECONDS"
  say "OCI_EDGE_BRIDGE=GREEN"
}

status() {
  if session_present; then
    local sub tenant exp
    read -r sub tenant exp < <(token_claims) || die "session token unreadable"
    say "OCI_EDGE_SESSION=SESSION_READY"
    say "session_tenancy=$tenant"
    say "session_seconds_left=$(( exp - $(date +%s) ))"
  elif bridge_active; then
    say "OCI_EDGE_SESSION=PENDING_OWNER_LOGIN"
  else
    say "OCI_EDGE_SESSION=ABSENT"
  fi
  [[ -f "$READY_MARKER" ]] && say "OCI_RECOVERY_READY=true" || say "OCI_RECOVERY_READY=false"
}

# ---- finish: reconcile helpers (idempotent, tenancy root) ------------------------------
ocid_by_name() { # ocid_by_name <user|group|policy|dynamic-group> <tenancy> <name>
  oci_session iam "$1" list --compartment-id "$2" --name "$3" --all 2>/dev/null |
    jq -r '[.data[]? | select(."lifecycle-state" != "DELETED")][0].id // ""'
}

ensure_named() { # ensure_named <kind> <tenancy> <name> <description> [extra create args...]
  local kind="$1" tenancy="$2" name="$3" desc="$4"; shift 4
  local id; id="$(ocid_by_name "$kind" "$tenancy" "$name")"
  if [[ -z "$id" ]]; then
    id="$(oci_session iam "$kind" create --compartment-id "$tenancy" --name "$name" \
          --description "$desc" "$@" --wait-for-state ACTIVE | jq -r '.data.id')"
    say "iam_${kind//-/_}=CREATED" >&2
  fi
  [[ "$id" == ocid1.* ]] || die "could not resolve $kind $name" 40
  printf '%s\n' "$id"
}

finish() {
  local expected_tenancy="${1:-}" region="${2:-af-johannesburg-1}"
  [[ "$expected_tenancy" =~ ^ocid1\.tenancy\.[a-z0-9-]+\.[a-z0-9-]*\.[a-z0-9]+$ ]] || die "expected tenancy OCID required"
  [[ "$region" =~ ^[a-z]{2}-[a-z]+-[0-9]+$ ]] || die "invalid region"

  if ! session_present; then
    if bridge_active; then say "OCI_EDGE_SESSION=PENDING_OWNER_LOGIN"; exit 20; fi
    say "OCI_EDGE_SESSION=ABSENT"; exit 21
  fi

  # From here on, the session is destroyed on every exit path, success or failure.
  trap 'destroy_session' EXIT

  local sub tenant exp
  read -r sub tenant exp < <(token_claims) || die "session token unreadable" 22
  [[ "$tenant" == "$expected_tenancy" ]] || die "session belongs to a different tenancy; destroyed" 22
  (( exp - $(date +%s) >= 120 )) || die "session expires in under two minutes; start a new login" 23
  [[ "$sub" == ocid1.user.* ]] || die "session subject is not a user" 22
  oci_session iam region list >/dev/null || die "session was not accepted by OCI" 24
  say "OCI_EDGE_SESSION=VERIFIED"

  # The recovery key pair is generated on this host by prepare-oci-recovery.sh; ensure it exists.
  as_admin bash "$LIB/prepare-oci-recovery.sh" status >/dev/null
  [[ -s "$RECOVERY_PUB" && -s "$RECOVERY_KEY" ]] || die "recovery key pair missing" 25

  # Inventory first, with the owner's session: the policy is scoped to the estate compartment,
  # so the compartment must be known before any IAM object is written.
  as_admin env OCI_CLI_CONFIG_FILE="$SESSION_CONFIG" OCI_CLI_PROFILE="$PROFILE" OCI_CLI_AUTH=security_token \
    OCI_RECOVERY_TENANCY_OCID="$tenant" OCI_RECOVERY_REGION="$region" OCI_RECOVERY_DISCOVERY_AUTH=session \
    bash "$LIB/prepare-oci-recovery.sh" discover
  # shellcheck source=/dev/null
  source "$ESTATE"
  [[ "${DIAL_OCI_COMPARTMENT:-}" == ocid1.compartment.* || "${DIAL_OCI_COMPARTMENT:-}" == ocid1.tenancy.* ]] ||
    die "estate compartment not discovered" 26

  # Dedicated identity: API keys only, no console password or other credentials.
  local group user
  group="$(ensure_named group "$tenant" "$RECOVERY_NAME" "DIAL Netcup recovery (least privilege, managed by oci-edge-login.sh)")"
  user="$(ensure_named user "$tenant" "$RECOVERY_NAME" "DIAL Netcup recovery API principal (managed by oci-edge-login.sh)")"
  oci_session iam user update-user-capabilities --user-id "$user" \
    --can-use-console-password false --can-use-api-keys true --can-use-auth-tokens false \
    --can-use-smtp-credentials false --can-use-customer-secret-keys false \
    --can-use-db-credentials false --can-use-o-auth false >/dev/null
  if ! oci_session iam user list-groups --compartment-id "$tenant" --user-id "$user" --all |
       jq -e --arg g "$group" '[.data[]?.id] | index($g)' >/dev/null; then
    oci_session iam group add-user --user-id "$user" --group-id "$group" >/dev/null
  fi

  # Run Command executes only on instances that are themselves allowed to fetch commands.
  local rule dg
  rule="ANY {instance.id = '$ORACLE_ADMIN_OCID', instance.id = '$VEKL_WORKER_OCID', instance.id = '$VAN_TRADING_CORE_OCID'}"
  dg="$(ensure_named dynamic-group "$tenant" "$RUNCOMMAND_DG" "DIAL Oracle estate Run Command targets" --matching-rule "$rule")"
  oci_session iam dynamic-group update --dynamic-group-id "$dg" --matching-rule "$rule" --force >/dev/null

  # Least privilege, compartment-scoped. Resource-type and permission names are the documented
  # OCI ones as recalled; docs.oracle.com is unreachable from the authoring environment. The
  # durable-key probe below verifies read and Run Command empirically; INSTANCE_POWER_ACTIONS is
  # only proven by a real reset, which is R3 and is not exercised here.
  local c="$DIAL_OCI_COMPARTMENT" scope statements policy
  # Policy grammar: the root compartment is addressed as "tenancy", never by its OCID.
  if [[ "$c" == ocid1.tenancy.* ]]; then scope="tenancy"; else scope="compartment id $c"; fi
  statements="$(jq -cn --arg g "$RECOVERY_NAME" --arg d "$RUNCOMMAND_DG" --arg s "$scope" '[
    "Allow group \($g) to inspect compartments in tenancy",
    "Allow group \($g) to read instance-family in \($s)",
    "Allow group \($g) to use instances in \($s) where request.permission = '"'"'INSTANCE_POWER_ACTIONS'"'"'",
    "Allow group \($g) to manage instance-agent-command-family in \($s)",
    "Allow dynamic-group \($d) to use instance-agent-command-execution-family in \($s) where request.instance.id = target.instance.id"
  ]')"
  policy="$(ocid_by_name policy "$tenant" "$RECOVERY_NAME")"
  if [[ -z "$policy" ]]; then
    oci_session iam policy create --compartment-id "$tenant" --name "$RECOVERY_NAME" \
      --description "DIAL Netcup recovery (managed by oci-edge-login.sh)" \
      --statements "$statements" --wait-for-state ACTIVE >/dev/null
    say "iam_policy=CREATED"
  else
    oci_session iam policy update --policy-id "$policy" --statements "$statements" --force >/dev/null
    say "iam_policy=RECONCILED"
  fi

  # Register the recovery public key once. OCI allows at most three API keys per user.
  local fp keys
  fp="$(recovery_fingerprint)"
  keys="$(oci_session iam user api-key list --user-id "$user" --all)"
  if ! jq -e --arg fp "$fp" '[.data[]? | select(."lifecycle-state" != "DELETED") | .fingerprint] | index($fp)' <<<"$keys" >/dev/null; then
    [[ "$(jq '[.data[]? | select(."lifecycle-state" != "DELETED")] | length' <<<"$keys")" -lt 3 ]] ||
      die "$RECOVERY_NAME already has three API keys; remove a stale one in the Console" 41
    oci_session iam user api-key upload --user-id "$user" --key-file "$RECOVERY_PUB" >/dev/null
    say "api_key=UPLOADED"
  else
    say "api_key=ALREADY_REGISTERED"
  fi

  # Durable config for the dedicated user; the session plays no further part.
  as_admin env OCI_RECOVERY_USER_OCID="$user" OCI_RECOVERY_TENANCY_OCID="$tenant" OCI_RECOVERY_REGION="$region" \
    bash "$LIB/prepare-oci-recovery.sh" configure >/dev/null

  # IAM and key propagation are eventually consistent: retry the probe, bounded.
  local ok=false i
  for i in $(seq 1 24); do
    if oci_durable iam region list >/dev/null 2>&1 &&
       oci_durable compute instance list --compartment-id "$c" --limit 1 >/dev/null 2>&1 &&
       oci_durable instance-agent command list --compartment-id "$c" --limit 1 >/dev/null 2>&1; then
      ok=true; break
    fi
    sleep 10
  done
  [[ "$ok" == true ]] || die "durable recovery key did not gain read + Run Command access within 4 minutes" 42
  say "OCI_RECOVERY_DURABLE_PROBE=GREEN"

  # Final discovery with the durable key; only this writes the recovery-ready marker.
  as_admin bash "$LIB/prepare-oci-recovery.sh" discover
  say "recovery_user=$user"
  say "OCI_EDGE_LOGIN=FINISHED"
}

case "$MODE" in
  start)  start "${2:-}" ;;
  status) status ;;
  finish) finish "${2:-}" "${3:-}" ;;
  abort)  destroy_session; say "OCI_EDGE_SESSION=ABORTED" ;;
  *) echo "Usage: $0 {start [region]|status|finish <tenancy-ocid> [region]|abort}" >&2; exit 2 ;;
esac
