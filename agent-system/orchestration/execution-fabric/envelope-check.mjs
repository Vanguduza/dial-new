import { ENVELOPE_DIMENSIONS } from './constants.mjs';
import { eligibleProviders } from './provider-registry.mjs';

export function controlPlaneRequirement(unit) {
  const facts = unit?.control_plane_facts;
  if (!facts || typeof facts !== 'object') return null;
  const requirement = facts.requirement;
  if (!requirement || typeof requirement !== 'object') return null;
  const cleaned = {};
  for (const dim of ENVELOPE_DIMENSIONS) {
    if (requirement[dim] == null || requirement[dim] === '') continue;
    const value = Number(requirement[dim]);
    if (!Number.isFinite(value)) continue;
    cleaned[dim] = value;
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

export function compareEnvelope(requirement, envelope) {
  if (!requirement) return { fits: null, exceeded_dimension: null };
  if (!envelope || envelope.status === 'UNVERIFIED' || envelope.envelope_status === 'UNVERIFIED') {
    return { fits: null, exceeded_dimension: null };
  }
  const limits = envelope.limits || envelope;
  for (const dim of ENVELOPE_DIMENSIONS) {
    if (requirement[dim] == null || limits[dim] == null) continue;
    if (Number(requirement[dim]) > Number(limits[dim])) {
      return { fits: false, exceeded_dimension: dim };
    }
  }
  return { fits: true, exceeded_dimension: null };
}

export function envelopeCheck({ unit, registry }) {
  const requirement = controlPlaneRequirement(unit);
  if (!requirement) {
    return {
      in_hand: false,
      exceeded: false,
      investigated: false,
      compared: [],
      requirement: null,
    };
  }

  const compared = [];
  let anyUnknown = false;
  let anyFits = false;
  const exceededAllKnown = [];

  for (const provider of eligibleProviders(registry)) {
    const comparison = compareEnvelope(requirement, {
      status: provider.envelope_status,
      limits: provider.envelope,
    });
    compared.push({
      provider_id: provider.provider_id,
      envelope_status: provider.envelope_status,
      envelope: provider.envelope,
      fits: comparison.fits,
      exceeded_dimension: comparison.exceeded_dimension,
    });
    if (comparison.fits === null) anyUnknown = true;
    if (comparison.fits === true) anyFits = true;
    if (comparison.fits === false) exceededAllKnown.push(comparison);
  }

  const knownProviders = compared.filter((row) => row.fits !== null);
  const exceeded = knownProviders.length > 0
    && knownProviders.every((row) => row.fits === false)
    && !anyFits
    && !anyUnknown;

  return {
    in_hand: true,
    exceeded,
    investigated: false,
    compared,
    requirement,
    exceeded_dimension: exceeded
      ? compared.find((row) => row.exceeded_dimension)?.exceeded_dimension ?? null
      : null,
  };
}
