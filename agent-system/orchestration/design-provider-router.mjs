import { hashObject } from './knowledge-graph-core.mjs';

const DEFAULT_PREFERENCE = Object.freeze([
  'LOCKED_BASELINE_REPAIR',
  'DIRECT_DONOR_PORT_AND_TRANSFORM',
  'DIRECT_DIAL_IMPLEMENTATION',
  'STITCH_CODE_TO_DESIGN_THEN_BUILD',
  'STITCH_NEW_DESIGN_THEN_BUILD',
]);
const STITCH_PREFERENCE = Object.freeze([
  'STITCH_CODE_TO_DESIGN_THEN_BUILD',
  'STITCH_NEW_DESIGN_THEN_BUILD',
  'LOCKED_BASELINE_REPAIR',
  'DIRECT_DONOR_PORT_AND_TRANSFORM',
  'DIRECT_DIAL_IMPLEMENTATION',
]);

export function selectDesignStrategy({
  designMode,
  stitchEnabled = false,
  stitchEligible = false,
  directWorkerEligible = true,
  providerHealth = 'UNKNOWN',
  preference = 'DEFAULT',
} = {}) {
  const candidates = [];
  if (directWorkerEligible) candidates.push('DIRECT_DIAL_IMPLEMENTATION');
  if (['DONOR_ADAPT', 'DONOR_PRESERVE'].includes(designMode) && directWorkerEligible) candidates.push('DIRECT_DONOR_PORT_AND_TRANSFORM');
  if (stitchEnabled && stitchEligible && providerHealth === 'HEALTHY') {
    candidates.push(designMode === 'NEW_DIAL_DESIGN' ? 'STITCH_NEW_DESIGN_THEN_BUILD' : 'STITCH_CODE_TO_DESIGN_THEN_BUILD');
  }
  if (!candidates.length) return { ok: false, reason: 'NO_ELIGIBLE_DESIGN_STRATEGY' };
  const ordering = preference === 'STITCH' ? STITCH_PREFERENCE : DEFAULT_PREFERENCE;
  candidates.sort((a, b) => ordering.indexOf(a) - ordering.indexOf(b));
  const selected = candidates[0];
  return {
    ok: true,
    candidates,
    selected,
    preference,
    selection_hash: hashObject({ designMode, candidates, selected, providerHealth, preference }),
  };
}
