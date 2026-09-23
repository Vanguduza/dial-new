#!/usr/bin/env bash
set -euo pipefail
S="$FAKE_STATE"
echo "$*" >>"$S/calls.log"
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
case "$1 $2 $3" in
  "iam region list"*|"iam compartment list"*|"instance-agent command list"*) echo '{"data":[]}' ;;
  "session terminate"*) : ;;
  "compute instance list"*)
    name="$(opt --display-name "$@")"
    case "$name" in
      oracle-admin) echo '{"data":[{"id":"ocid1.instance.oc1..admin","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"oracle-admin","shape":"VM.Standard.E2.1.Micro","lifecycle-state":"RUNNING"}]}' ;;
      vekl-worker)  echo '{"data":[{"id":"ocid1.instance.oc1..vekl","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"vekl-worker","shape":"VM.Standard.E2.1.Micro","lifecycle-state":"RUNNING"}]}' ;;
      dial-hermes-control) echo '{"data":[{"id":"ocid1.instance.oc1..a1","compartment-id":"'"$FAKE_COMPARTMENT"'","display-name":"dial-hermes-control","shape":"VM.Standard.A1.Flex","lifecycle-state":"RUNNING"}]}' ;;
      *) echo '{"data":[]}' ;;
    esac ;;
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
  "iam policy update") opt --statements "$@" >"$S/iam/policy-statements"; echo '{"data":{}}' ;;
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
