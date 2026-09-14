#!/usr/bin/env bash
# Section 19 evidence: prove dial-hermes-control was not modified.
#
#   ./00-hermes-fingerprint.sh snapshot before.json
#   ... provision ...
#   ./00-hermes-fingerprint.sh snapshot after.json
#   ./00-hermes-fingerprint.sh diff before.json after.json
#
# `diff` exits non-zero if anything about the Hermes instance, its VNICs, or the
# subnets / route tables / security lists it depends on changed. That is a real
# check against the API, not a claim in a report.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cmd="${1:?usage: snapshot <file> | diff <before> <after>}"

case "$cmd" in
  snapshot)
    require_cli
    out="${2:?output file required}"
    log "Snapshotting dial-hermes-control state (read-only)…"
    hermes_fingerprint > "$out"
    log "Wrote $out"
    ;;
  diff)
    before="${2:?}"; after="${3:?}"
    if diff -u <(jq -S . "$before") <(jq -S . "$after") > /tmp/hermes-drift.$$ 2>&1; then
      echo "HERMES_UNCHANGED=GREEN"
      rm -f /tmp/hermes-drift.$$
      exit 0
    fi
    echo "HERMES_UNCHANGED=RED"
    echo "--- drift detected in dial-hermes-control state ---"
    cat /tmp/hermes-drift.$$
    rm -f /tmp/hermes-drift.$$
    exit 1
    ;;
  *) die "unknown command: $cmd" ;;
esac
