// The one gate ladder.
//
// Extracted so it has exactly one definition. It previously lived inside
// gate-ladder-check.mjs, which self-executes, so no other script could import
// it — and source-map.mjs, the script credited with refusing a gate claim that
// outruns its evidence, therefore carried its own copy. That copy had drifted:
// it still began with the superseded `PLANNED` and omitted `SPECIFIED`, so it
// rejected twelve capabilities sitting at a canonical state as "unknown gate".
// A guard that cannot parse the ladder is not guarding the ladder.
//
// Source of truth for the prose:
// docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/13_GATE_LADDER/GATE_LADDER_CANON.md

export const GATE_LADDER = [
  'SPECIFIED',
  'DESIGN_CLOSED',
  'BUILDABLE',
  'CODE_PRESENT',
  'DOMAIN_TESTED',
  'INTEGRATION_GREEN',
  'STAGING_GREEN',
  'CERTIFIED_DORMANT',
  'ACTIVATION_BLOCKERS_GREEN',
  'ACTIVE',
];

// Superseded names. Present so a failure can say what to write instead, rather
// than only that the value is unknown.
export const GATE_ALIASES = {
  PLANNED: 'SPECIFIED',
  MAPPED: 'BUILDABLE',
  THIN_SLICE_REQUIRED: 'BUILDABLE',
  THIN_SLICE_GREEN: 'CODE_PRESENT',
  DOMAIN_GREEN: 'DOMAIN_TESTED',
  PRODUCTION_GREEN: 'ACTIVATION_BLOCKERS_GREEN',
};

/** Rank on the ladder, or -1 for a value that is not a canonical state. */
export const gateIndex = (gate) => GATE_LADDER.indexOf(gate);

/** True when `gate` is at or above `floor` on the ladder. */
export function gateAtLeast(gate, floor) {
  const index = gateIndex(gate);
  return index >= 0 && index >= gateIndex(floor);
}
