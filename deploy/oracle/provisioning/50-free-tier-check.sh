#!/usr/bin/env bash
# Measure the estate against the Always Free allowance, and refuse to guess.
#
#   ./50-free-tier-check.sh              # live check against OCI
#   ./50-free-tier-check.sh --declared   # check hosts.json only; no OCI, no credentials
#   ./50-free-tier-check.sh --tenancy    # read THIS account's real service limits
#   ./50-free-tier-check.sh --json
#
# WHY THIS EXISTS
#
# Rev 3 section 2.1 asserted the estate fitted inside Always Free using figures with no
# provenance and no expiry. The first attempt to fix that replaced them with different
# figures that had no better provenance — the same mistake with fresher digits.
#
# So this reports TWO separate things and never conflates them:
#
#   1. Does the estate exceed the figures on record?   (arithmetic — reliable)
#   2. Are the figures on record actually known?       (provenance — often not)
#
# When (2) is weak, (1) is not a finding. "Over an unverified line" is not "over the
# line", and reporting it as though it were sends someone resizing production on the
# strength of a blog post nobody read.
#
# THIS FILE IS NOT AUTHORITY FOR WHAT A TENANCY MAY RUN.
#
# Service limits are per-account: grandfathering, account age, region and account type
# all change the answer. The tenancy's own limits are the only authority, and --tenancy
# reads them. Everything else here is a prompt to go and look.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALLOWANCE="${DIAL_FREE_TIER_ALLOWANCE:-$HERE/../free-tier-allowance.json}"
HOSTS="${DIAL_FABRIC_HOSTS:-$HERE/../resource-fabric/hosts.json}"
MODE=live
JSON_ONLY=false

TENANCY_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --declared) MODE=declared; shift ;;
    --tenancy)  TENANCY_ONLY=true; shift ;;
    --json)     JSON_ONLY=true; shift ;;
    *) echo "50-free-tier-check: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

say() { [[ "$JSON_ONLY" == true ]] || echo "$*" >&2; }

[[ -r "$ALLOWANCE" ]] || { echo "50-free-tier-check: no allowance file at $ALLOWANCE" >&2; exit 2; }
[[ -r "$HOSTS" ]]     || { echo "50-free-tier-check: no hosts.json at $HOSTS" >&2; exit 2; }

# --- --tenancy: ask the only source that actually decides -----------------------------
if [[ "$TENANCY_ONLY" == true ]]; then
  # shellcheck source=/dev/null
  if ! source "$HERE/lib.sh" >/dev/null 2>&1 || ! command -v oci >/dev/null 2>&1; then
    cat >&2 <<'HELP'
No OCI CLI or credentials here, so the tenancy's real limits cannot be read from this
machine. They are the ONLY authority for what this account may run — published free-tier
figures describe a default, and accounts are grandfathered, upgraded and regional.

Read them from OCI Cloud Shell:

  oci limits value list \
    --compartment-id "$OCI_TENANCY" \
    --service-name compute --region af-johannesburg-1 --all \
    --query "data[?contains(name,'a1')].{limit:name,value:value}" --output table

Or in the Console:

  Governance & Administration -> Limits, Quotas and Usage
  Service: Compute -> Region: af-johannesburg-1 -> look for the Ampere A1 core count

Whatever that says is the answer. Record it in deploy/oracle/free-tier-allowance.json
with provenance.canonical_source_read set to true.
HELP
    exit 3
  fi
  limits="$(oci_ limits value list --compartment-id "${DIAL_OCI_TENANCY:-$DIAL_OCI_COMPARTMENT}" \
    --service-name compute --all 2>/dev/null)" || limits=""
  if [[ -n "$limits" ]] && jq -e '.data' >/dev/null 2>&1 <<<"$limits"; then
    jq -r '.data[] | select(.name | test("a1|micro|e2"; "i")) | "  \(.name): \(.value)"' <<<"$limits"
    echo
    echo "These are this tenancy's actual limits and they outrank every published figure."
    exit 0
  fi
  echo "Could not read service limits; check the Console path above." >&2
  exit 3
fi

# ---- is the allowance itself still trustworthy? -------------------------------------
confirmed="$(jq -r '.confirmed_at_utc // ""' "$ALLOWANCE")"
stale_days="$(jq -r '.stale_after_days // 90' "$ALLOWANCE")"
canonical_read="$(jq -r '.provenance.canonical_source_read // false' "$ALLOWANCE")"
age_days=-1
if [[ -n "$confirmed" ]]; then
  now_s=$(date -u +%s)
  conf_s=$(date -u -d "$confirmed" +%s 2>/dev/null || echo 0)
  [[ "$conf_s" -gt 0 ]] && age_days=$(( (now_s - conf_s) / 86400 ))
fi

allowance_state=FRESH
if [[ "$age_days" -lt 0 ]]; then
  allowance_state=UNDATED
elif [[ "$age_days" -gt "$stale_days" ]]; then
  allowance_state=STALE
fi

# ---- what exists ---------------------------------------------------------------------
# Shapes come either from the live control plane or from hosts.json. The live reading is
# the one that matters — hosts.json records what DIAL intends, and the whole failure mode
# here is intent and reality drifting apart without anyone looking.
observed='[]'
source_of_truth="$MODE"

if [[ "$MODE" == live ]]; then
  # shellcheck source=/dev/null
  if source "$HERE/lib.sh" >/dev/null 2>&1 && command -v oci >/dev/null 2>&1; then
    raw="$(oci_ compute instance list --compartment-id "$DIAL_OCI_COMPARTMENT" --all 2>/dev/null)" || raw=""
    if [[ -n "$raw" ]] && jq -e '.data' >/dev/null 2>&1 <<<"$raw"; then
      observed="$(jq -c '[.data[]
        | select(."lifecycle-state" != "TERMINATED" and ."lifecycle-state" != "TERMINATING")
        | {host: ."display-name", shape: .shape,
           ocpu: (."shape-config"."ocpus" // 0), memory_mb: ((."shape-config"."memory-in-gbs" // 0) * 1024)}]' <<<"$raw")"
    else
      say "Could not read live instances from OCI; falling back to the declared inventory."
      source_of_truth="declared (OCI unreadable)"
      MODE=declared
    fi
  else
    say "No usable OCI CLI or credentials here; falling back to the declared inventory."
    source_of_truth="declared (no OCI CLI)"
    MODE=declared
  fi
fi

if [[ "$MODE" == declared ]]; then
  observed="$(jq -c '[.hosts[] | {host: .host_id, shape: .oci_shape, ocpu: .cpu_total, memory_mb: .memory_total_mb}]' "$HOSTS")"
fi

# ---- compare --------------------------------------------------------------------------
verdict="$(jq -n --argjson o "$observed" --slurpfile a "$ALLOWANCE" '
  $a[0] as $al
  | ($o | map(select(.shape == "VM.Standard.E2.1.Micro"))) as $e2
  | ($o | map(select(.shape == "VM.Standard.A1.Flex")))    as $a1
  | ($a1 | map(.ocpu)      | add // 0) as $a1_ocpu
  | ($a1 | map(.memory_mb) | add // 0) as $a1_mem
  | [
      { resource: "VM.Standard.E2.1.Micro instances",
        used: ($e2 | length), allowed: $al.compute."VM.Standard.E2.1.Micro".max_instances },
      { resource: "A1.Flex instances",
        used: ($a1 | length), allowed: $al.compute."VM.Standard.A1.Flex".max_instances },
      { resource: "A1.Flex OCPU (total)",
        used: $a1_ocpu, allowed: $al.compute."VM.Standard.A1.Flex".max_ocpu_total },
      { resource: "A1.Flex memory MB (total)",
        used: $a1_mem, allowed: $al.compute."VM.Standard.A1.Flex".max_memory_mb_total }
    ]
  | map(. + {
      over: (.used > .allowed),
      headroom: (.allowed - .used)
    })')"

exceeds="$(jq -c '[.[] | select(.over)]' <<<"$verdict")"
n_over="$(jq 'length' <<<"$exceeds")"

# The two questions, kept apart. A figure nobody has read cannot establish that anything
# exceeds it, so weak provenance downgrades an "over" result to a prompt to go and look —
# it does not promote it to a finding.
figures_known=true
[[ "$allowance_state" == FRESH ]] || figures_known=false
[[ "$canonical_read" == true ]]   || figures_known=false

if [[ "$figures_known" != true ]]; then
  if [[ "$n_over" -gt 0 ]]; then
    state=CHECK_TENANCY
  else
    state=UNVERIFIED
  fi
elif [[ "$n_over" -gt 0 ]]; then
  state=EXCEEDS
else
  state=WITHIN
fi

report="$(jq -n \
  --arg state "$state" --arg src "$source_of_truth" --arg at "$(date -u +%FT%TZ)" \
  --arg astate "$allowance_state" --arg conf "$confirmed" --argjson age "$age_days" \
  --argjson canon "$canonical_read" --argjson rows "$verdict" --argjson obs "$observed" \
  --arg conf_level "$(jq -r '.provenance.confidence // "UNKNOWN"' "$ALLOWANCE")" \
  --argjson read_any "$(jq -r '.provenance.any_source_read_directly // false' "$ALLOWANCE")" \
  '{schema_version:2, report:"Always Free allowance check",
    source_authority:"the tenancy service limits; this file is a prompt to read them, not a substitute",
    figures_from:"deploy/oracle/free-tier-allowance.json",
    observed_at:$at, inventory_source:$src, state:$state,
    allowance:{state:$astate, confirmed_at_utc:$conf, age_days:$age,
               canonical_source_read:$canon, any_source_read_directly:$read_any,
               confidence:$conf_level},
    rows:$rows, observed:$obs}')"

if [[ "$JSON_ONLY" == true ]]; then
  printf '%s\n' "$report"
else
  echo "Always Free allowance check — inventory from: $source_of_truth"
  echo "Allowance confirmed $confirmed (${age_days}d ago, $allowance_state, canonical page read: $canonical_read)"
  echo
  jq -r '.rows[] | "  \(if .over then "OVER " else "ok   " end) \(.resource): \(.used) of \(.allowed)"' <<<"$report"
  echo
  echo "STATE: $state"
  case "$state" in
    CHECK_TENANCY)
      echo
      echo "The estate is over the figures ON RECORD — but those figures are not known well"
      echo "enough to call that a finding. Confidence is $(jq -r '.provenance.confidence' "$ALLOWANCE"), and"
      echo "any_source_read_directly is $(jq -r '.provenance.any_source_read_directly' "$ALLOWANCE")."
      echo
      jq -r '.provenance.contradicting_evidence
             | "Evidence against them: \(.observation)\n\(.why_it_matters)"' "$ALLOWANCE" 2>/dev/null
      echo
      echo "Service limits are per-account. Read this tenancy's own:"
      echo "  ./50-free-tier-check.sh --tenancy"
      echo "Whatever that says settles it. Until then, change nothing on this basis."
      echo
      echo "Independent of the limit question: no host has a boot-volume backup, and that"
      echo "is worth fixing whatever the limits turn out to be."
      echo "  ./40-backup-policy.sh --apply --include-hermes" ;;
    EXCEEDS)
      echo
      echo "One or more resources exceed the allowance, against figures that were actually"
      echo "confirmed. Oracle terminates over-limit instances, and an over-limit host with"
      echo "no boot-volume backup is the 2026-09-12 loss repeating."
      echo "Resize in the OCI Console, or accept the cost deliberately. Then run:"
      echo "  ./40-backup-policy.sh --apply --include-hermes" ;;
    UNVERIFIED)
      echo
      echo "Inside the figures on record, but the figures are $allowance_state and"
      echo "confidence is $(jq -r '.provenance.confidence' "$ALLOWANCE"). Read the tenancy's own limits:"
      echo "  ./50-free-tier-check.sh --tenancy" ;;
    WITHIN)
      echo "Inside the allowance, against figures confirmed ${age_days} days ago." ;;
  esac
fi

case "$state" in
  WITHIN)                   exit 0 ;;
  UNVERIFIED|CHECK_TENANCY) exit 3 ;;
  *)                        exit 1 ;;
esac
