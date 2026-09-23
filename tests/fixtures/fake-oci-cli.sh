#!/usr/bin/env bash
set -euo pipefail
S="$FAKE_STATE"
echo "$*" >>"$S/calls.log"
CFG=""; prev=""
for a in "$@"; do [[ "$prev" == --config-file ]] && CFG="$a"; prev="$a"; done
args=("$@"); rest=()
i=0
while [[ $i -lt ${#args[@]} ]]; do
  case "${args[$i]}" in
    --config-file|--profile|--auth|--region) i=$((i+2)); continue ;;
  esac
  rest+=("${args[$i]}"); i=$((i+1))
done
set -- "${rest[@]}"
opt() { local k="$1"; shift; while [[ $# -gt 0 ]]; do [[ "$1" == "$k" ]] && { echo "$2"; return; }; shift; done; }
# Options the pinned oci-cli 3.93.0 rejects (checked against its --help); click exits 2.
if [[ "$1 $2 $3" == "iam region list" && $# -gt 3 ]]; then echo "Error: No such option '$4'." >&2; exit 2; fi
if [[ "$1 $2 $3" == "iam user update-user-capabilities" ]]; then
  for a in "$@"; do [[ "$a" == --can-use-o-auth ]] && { echo "Error: No such option '--can-use-o-auth'." >&2; exit 2; }; done
fi
case "$1 $2 $3" in
  "iam region list"*|"iam compartment list"*|"instance-agent command list"*) echo '{"data":[]}' ;;
  "session terminate"*) : ;;
  "compute instance list-vnics")
    id="$(opt --instance-id "$@")"; q="$(opt --query "$@")"
    if [[ "$q" == *subnet-id* ]]; then echo ocid1.subnet.oc1..s
    else case "$id" in *admin*) echo 10.0.0.123 ;; *vekl*) echo 10.0.0.51 ;; *) echo 10.0.1.9 ;; esac; fi ;;
  "compute instance list"*)
    # IAM propagation: the durable key's listing can be refused for a while after the probe passed.
    # Durable = default ~/.oci/config (no --config-file, no OCI_CLI_CONFIG_FILE) or that file named explicitly.
    if [[ ( "$CFG" == */.oci/config || ( -z "$CFG" && -z "${OCI_CLI_CONFIG_FILE:-}" ) ) && -n "$(opt --display-name "$@")" ]]; then
      n="$(cat "$S/durable-list-fails" 2>/dev/null || echo 0)"
      if [[ "$n" -lt "${FAKE_DURABLE_LIST_FAILS:-0}" ]]; then
        echo $((n + 1)) >"$S/durable-list-fails"
        echo 'ServiceError: {"code": "NotAuthorizedOrNotFound", "message": "Authorization failed or requested resource not found."}' >&2
        exit 1
      fi
    fi
    name="$(opt --display-name "$@")"
    case "$name" in
      oracle-admin) echo '{"data":[{"id":"ocid1.instance.oc1..admin","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"oracle-admin","shape":"VM.Standard.E2.1.Micro","lifecycle-state":"RUNNING"}]}' ;;
      vekl-worker)  echo '{"data":[{"id":"ocid1.instance.oc1..vekl","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"vekl-worker","shape":"VM.Standard.E2.1.Micro","lifecycle-state":"RUNNING"}]}' ;;
      # Owner topology: two separate A1s. dial-hermes-control is the migration source
      # (absent once terminated: FAKE_NO_SOURCE=1); van-trading-core is retained.
      dial-hermes-control)
        if [[ "${FAKE_NO_SOURCE:-0}" == 1 ]]; then echo '{"data":[]}'
        else echo '{"data":[{"id":"ocid1.instance.oc1..a1src","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"dial-hermes-control","shape":"VM.Standard.A1.Flex","lifecycle-state":"RUNNING","time-created":"2026-08-01T00:00:00Z"}]}'; fi ;;
      van-trading-core)
        if [[ "${FAKE_DUP_VAN:-0}" == 1 ]]; then
          echo '{"data":[{"id":"ocid1.instance.oc1..a1van","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"van-trading-core","shape":"VM.Standard.A1.Flex","lifecycle-state":"RUNNING","time-created":"2026-09-20T00:00:00Z"},{"id":"ocid1.instance.oc1..a1van2","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"van-trading-core","shape":"VM.Standard.A1.Flex","lifecycle-state":"STOPPED","time-created":"2026-09-21T00:00:00Z"}]}'
        else echo '{"data":[{"id":"ocid1.instance.oc1..a1van","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"van-trading-core","shape":"VM.Standard.A1.Flex","lifecycle-state":"RUNNING","time-created":"2026-09-20T00:00:00Z"}]}'; fi ;;
      *) echo '{"data":[]}' ;;
    esac ;;
  "compute instance get")
    id="$(opt --instance-id "$@")"; q="$(opt --query "$@")"
    case "$id" in *admin*) nm=oracle-admin ;; *vekl*) nm=vekl-worker ;; *a1van*) nm=van-trading-core ;; *a1src*) nm=dial-hermes-control ;; *) nm=unknown ;; esac
    if [[ "$q" == *lifecycle-state* ]]; then
      if [[ -f "$S/terminated-$id" ]]; then echo TERMINATED; else echo RUNNING; fi
    elif [[ "$q" == *agent-config* ]]; then
      if [[ -f "$S/agent-$id.json" ]]; then cat "$S/agent-$id.json"
      else echo '{"is-management-disabled": false, "is-monitoring-disabled": false, "are-all-plugins-disabled": false, "plugins-config": null}'; fi
    else
      shape=VM.Standard.A1.Flex; [[ "$nm" == oracle-admin || "$nm" == vekl-worker ]] && shape=VM.Standard.E2.1.Micro
      echo '{"data":{"id":"'"$id"'","display-name":"'"${FAKE_NAME_OVERRIDE:-$nm}"'","shape":"'"$shape"'","availability-domain":"AD-1","compartment-id":"'"$FAKE_COMPARTMENT"'","metadata":{"ssh_authorized_keys":"ssh-rsa AAAAowner owner-key"}}}'
    fi ;;
  "compute boot-volume-attachment list") echo "ocid1.bootvolume.oc1..bv-$(opt --instance-id "$@" | sed 's/.*\.\.//')" ;;
  "compute image list") echo ocid1.image.oc1..ubuntu2404 ;;
  "compute instance terminate")
    id="$(opt --instance-id "$@")"; touch "$S/terminated-$id"; echo "$*" >"$S/terminate-args" ;;
  "compute instance launch")
    name="$(opt --display-name "$@")"
    if [[ -n "$(opt --source-boot-volume-id "$@")" ]]; then echo "$*" >"$S/restore-args"; echo "ocid1.instance.oc1..restored-$name"; exit 0; fi
    if [[ "${FAKE_LAUNCH_FAIL:-0}" == 1 ]]; then echo 'ServiceError: {"code": "InternalError", "message": "Out of host capacity."}' >&2; exit 1; fi
    m="$(opt --metadata "$@")"; a="$(opt --agent-config "$@")"
    cat "${m#file://}" >"$S/launch-meta-$name.json"; cat "${a#file://}" >"$S/launch-agent-$name.json"; echo "$*" >"$S/launch-args-$name"
    echo "ocid1.instance.oc1..new-$name" ;;
  "compute instance update")
    id="$(opt --instance-id "$@")"; ac="$(opt --agent-config "$@")"
    cat "${ac#file://}" >"$S/agent-update-$id.json"; echo '{"data":{}}' ;;
  "iam user list-groups") [[ -f "$S/iam/member" ]] && echo '{"data":[{"id":"ocid1.group.oc1..g"}]}' || echo '{"data":[]}' ;;
  "iam group add-user") touch "$S/iam/member"; echo '{"data":{}}' ;;
  "iam user update-user-capabilities") echo '{"data":{}}' ;;
  "iam user api-key")
    if [[ "$4" == list ]]; then
      [[ -f "$S/iam/apikey" ]] && echo '{"data":[{"fingerprint":"'"$(cat "$S/iam/apikey")"'","lifecycle-state":"ACTIVE"}]}' || echo '{"data":[]}'
    else
      kf="$(opt --key-file "$@")"
      openssl rsa -pubin -in "$kf" -outform DER 2>/dev/null | openssl md5 -c | awk '{print $2}' >"$S/iam/apikey"
      echo '{"data":{}}'
    fi ;;
  "iam dynamic-group update") opt --matching-rule "$@" >"$S/iam/dg-rule"; echo '{"data":{}}' ;;
  "iam policy update")
    # oci-cli 3.93.0: "If updating either statements or version date, both parameters must be specified."
    has_vd=0; for a in "$@"; do [[ "$a" == --version-date ]] && has_vd=1; done
    [[ "$has_vd" == 1 ]] || { echo "If updating either statements or version date, both parameters must be specified." >&2; exit 1; }
    opt --statements "$@" >"$S/iam/policy-statements"; echo '{"data":{}}' ;;
  "iam user create")
    # Identity-domain tenancies reject a user without a primary email (IdcsConversionError).
    if [[ "${FAKE_REQUIRE_EMAIL:-0}" == 1 && -z "$(opt --email "$@")" ]]; then
      echo 'ServiceError: {"code": "IdcsConversionError", "message": "The primary email must be specified."}' >&2
      exit 1
    fi
    opt --email "$@" >"$S/iam/user-email"
    echo "ocid1.user.oc1..created" >"$S/iam/user"
    echo '{"data":{"id":"ocid1.user.oc1..created"}}' ;;
  "iam "*)
    kind="$2"; verb="$3"
    if [[ "$verb" == list ]]; then
      [[ -f "$S/iam/$kind" ]] && echo '{"data":[{"id":"'"$(cat "$S/iam/$kind")"'","lifecycle-state":"ACTIVE"}]}' || echo '{"data":[]}'
    elif [[ "$verb" == create ]]; then
      id="ocid1.$kind.oc1..created"
      [[ "$kind" == group ]] && id="ocid1.group.oc1..g"
      echo "$id" >"$S/iam/$kind"
      [[ "$kind" == policy ]] && opt --statements "$@" >"$S/iam/policy-statements"
      echo '{"data":{"id":"'"$id"'"}}'
    fi ;;
  *) echo "fake oci: unhandled $*" >&2; exit 9 ;;
esac
