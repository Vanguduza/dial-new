#!/usr/bin/env bash
# Give the GitHub-side Oracle recovery path (oracle-recovery.yml) its own OCI API key. Run as root on Dial Control.
#
#   provision-github-oci-recovery.sh apply    # new key for the recovery user -> repository secrets/variables
#   provision-github-oci-recovery.sh verify   # names and fingerprints only
#
# Owner decision auth-20260924-owner-recommended-recovery-decisions. The GitHub path must not depend on
# Dial Control being alive, so it gets a key of its own rather than a copy of Dial Control's: either can
# be revoked without touching the other. It is the same least-privilege principal (dial-netcup-recovery:
# read instances, OCI Run Command, power actions; no IAM, no network), and a user may manage its own
# API keys, so no new grant is needed.
#
# The private key is generated in a RAM-backed directory, piped into the repository secret, and
# shredded. It is never printed, logged or written to persistent disk. A previous GitHub key is
# deleted only after the new one is stored.
set -Eeuo pipefail
umask 077

MODE="${1:-verify}"
REPO_SLUG="${DIAL_GITHUB_REPOSITORY:-Vanguduza/dial-new}"
OCI_CONFIG=/home/ubuntu/.oci/config
ESTATE="${DIAL_ORACLE_ESTATE:-/etc/dial/oracle-estate.env}"
MARKER=/var/lib/dial-control/state/github-oci-recovery.json

die() { echo "GITHUB_OCI_RECOVERY_REFUSED: $*" >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || die "run as root"
[[ -s "$OCI_CONFIG" && -s "$ESTATE" ]] || die "durable OCI recovery config or estate inventory missing"

U=(runuser -u ubuntu -- env HOME=/home/ubuntu PATH=/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin)
OCI=("${U[@]}" OCI_CLI_CONFIG_FILE="$OCI_CONFIG" oci)
GH=("${U[@]}" gh)
cfg() { awk -F= -v k="$1" '/^\[DEFAULT\]/{d=1;next} /^\[/{d=0} d && $1==k {print $2; exit}' "$OCI_CONFIG"; }
USER_OCID="$(cfg user)"; TENANCY_OCID="$(cfg tenancy)"; REGION="$(cfg region)"
[[ "$USER_OCID" == ocid1.user.* && "$TENANCY_OCID" == ocid1.tenancy.* && -n "$REGION" ]] || die "durable OCI config incomplete"
# shellcheck source=/dev/null
source "$ESTATE"

verify() {
  echo "recovery_user=$USER_OCID"
  echo "api_keys=$("${OCI[@]}" iam user api-key list --user-id "$USER_OCID" --all 2>/dev/null | jq -r '[.data[]? | select(."lifecycle-state"=="ACTIVE") | .fingerprint] | join(",")')"
  echo "github_key=$(jq -r '.fingerprint // "none"' "$MARKER" 2>/dev/null || echo none)"
  echo "repo_secrets=$("${GH[@]}" secret list -R "$REPO_SLUG" 2>/dev/null | awk '{print $1}' | grep '^OCI_RECOVERY_' | tr '\n' ' ')"
  echo "repo_variables=$("${GH[@]}" variable list -R "$REPO_SLUG" 2>/dev/null | awk '{print $1}' | grep -E '^OCI_(RECOVERY|INSTANCE)_' | tr '\n' ' ')"
}

apply() {
  "${GH[@]}" auth status >/dev/null 2>&1 || die "gh is not authenticated on Dial Control"
  local active old_fp
  active="$("${OCI[@]}" iam user api-key list --user-id "$USER_OCID" --all | jq '[.data[]? | select(."lifecycle-state"=="ACTIVE")] | length')"
  old_fp="$(jq -r '.fingerprint // empty' "$MARKER" 2>/dev/null || true)"
  [[ "$active" -lt 3 ]] || die "recovery user already has 3 API keys; remove a stale one first"

  local dir; dir="$(mktemp -d /dev/shm/dial-gh-oci.XXXXXX)"; chown ubuntu:ubuntu "$dir"
  # shellcheck disable=SC2064
  trap "shred -u '$dir'/* 2>/dev/null || true; rm -rf '$dir'" EXIT
  "${U[@]}" openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$dir/key.pem" 2>/dev/null
  "${U[@]}" openssl rsa -in "$dir/key.pem" -pubout -out "$dir/pub.pem" 2>/dev/null
  local fp; fp="$("${OCI[@]}" iam user api-key upload --user-id "$USER_OCID" --key-file "$dir/pub.pem" --query data.fingerprint --raw-output 2>/dev/null)"
  [[ "$fp" =~ ^([0-9a-f]{2}:){15}[0-9a-f]{2}$ ]] || die "API key upload did not return a fingerprint"

  "${GH[@]}" secret set OCI_RECOVERY_PRIVATE_KEY -R "$REPO_SLUG" <"$dir/key.pem" >/dev/null
  "${GH[@]}" secret set OCI_RECOVERY_FINGERPRINT -R "$REPO_SLUG" --body "$fp" >/dev/null
  "${GH[@]}" secret set OCI_RECOVERY_USER_OCID -R "$REPO_SLUG" --body "$USER_OCID" >/dev/null
  "${GH[@]}" secret set OCI_RECOVERY_TENANCY_OCID -R "$REPO_SLUG" --body "$TENANCY_OCID" >/dev/null
  "${GH[@]}" variable set OCI_RECOVERY_REGION -R "$REPO_SLUG" --body "$REGION" >/dev/null
  "${GH[@]}" variable set OCI_RECOVERY_COMPARTMENT_OCID -R "$REPO_SLUG" --body "$DIAL_OCI_COMPARTMENT" >/dev/null
  "${GH[@]}" variable set OCI_INSTANCE_ORACLE_ADMIN -R "$REPO_SLUG" --body "$ORACLE_ADMIN_OCID" >/dev/null
  "${GH[@]}" variable set OCI_INSTANCE_VEKL_WORKER -R "$REPO_SLUG" --body "$VEKL_WORKER_OCID" >/dev/null
  "${GH[@]}" variable set OCI_INSTANCE_VAN_TRADING_CORE -R "$REPO_SLUG" --body "$VAN_TRADING_CORE_OCID" >/dev/null
  [[ -z "${DIAL_HERMES_CONTROL_SOURCE_OCID:-}" ]] ||
    "${GH[@]}" variable set OCI_INSTANCE_DIAL_HERMES_CONTROL -R "$REPO_SLUG" --body "$DIAL_HERMES_CONTROL_SOURCE_OCID" >/dev/null

  install -d -m 0700 "$(dirname "$MARKER")"
  jq -n --arg fp "$fp" --arg at "$(date -u +%FT%TZ)" --arg user "$USER_OCID" '{fingerprint:$fp, stored_at_utc:$at, user:$user}' >"$MARKER"
  if [[ -n "$old_fp" && "$old_fp" != "$fp" ]]; then
    "${OCI[@]}" iam user api-key delete --user-id "$USER_OCID" --fingerprint "$old_fp" --force >/dev/null 2>&1 &&
      echo "previous_github_key_deleted=$old_fp" || echo "previous_github_key_delete_failed=$old_fp"
  fi
  echo "GITHUB_OCI_RECOVERY=PROVISIONED fingerprint=$fp"
  verify
}

case "$MODE" in
  apply) apply ;;
  verify) verify ;;
  *) echo "usage: $0 apply|verify" >&2; exit 2 ;;
esac
