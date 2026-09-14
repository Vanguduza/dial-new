import fs from 'node:fs';
import { FORBIDDEN_LOCAL_BASIS, HOST_ROLES, ROUTER_ACTIONS, VENUE_BASES } from './constants.mjs';
import { compareEnvelope } from './envelope-check.mjs';
import { evaluateHostRole } from './host-role.mjs';
import { verifyVenueSignature } from './venue-decision.mjs';

export const DEFAULT_GUARD_HEARTBEAT = process.env.DIAL_VENUE_GUARD_HEARTBEAT
  || '/var/lib/dial-control/state/venue-guard.json';

export function readGuardHeartbeat(filePath = DEFAULT_GUARD_HEARTBEAT, nowMs = Date.now()) {
  try {
    const pulse = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const observed = Date.parse(pulse.observed_at || '');
    const maxAgeMs = Number(pulse.max_age_ms || 60_000);
    if (!Number.isFinite(observed) || nowMs - observed > maxAgeMs) {
      return { ok: false, reason: 'GUARD_HEARTBEAT_STALE', pulse };
    }
    if (pulse.state !== 'ACTIVE') return { ok: false, reason: 'GUARD_NOT_ACTIVE', pulse };
    return { ok: true, reason: null, pulse };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, reason: 'GUARD_STOPPED' };
    throw error;
  }
}

export function admitVenueDecision({
  decision,
  publicKey,
  hostRole,
  unit,
  heartbeatPath = DEFAULT_GUARD_HEARTBEAT,
  nowMs = Date.now(),
  requireHeartbeat = true,
} = {}) {
  if (requireHeartbeat) {
    const pulse = readGuardHeartbeat(heartbeatPath, nowMs);
    if (!pulse.ok) return { ok: false, reason: pulse.reason, action: ROUTER_ACTIONS.REJECT };
  }

  if (!decision) {
    return { ok: false, reason: 'UNSIGNED', action: ROUTER_ACTIONS.REJECT };
  }

  const signature = verifyVenueSignature(decision, publicKey);
  if (!signature.ok) {
    return { ok: false, reason: signature.reason, action: ROUTER_ACTIONS.REJECT };
  }

  if (decision.venue_basis === FORBIDDEN_LOCAL_BASIS || decision.action === ROUTER_ACTIONS.ORACLE_SANDBOX && decision.venue_basis == null) {
    return { ok: false, reason: 'PROVIDER_UNAVAILABLE_NOT_LOCALITY', action: ROUTER_ACTIONS.REJECT };
  }

  if (decision.forbid_oracle && String(decision.venue || '').includes('dial-hermes-control')) {
    return { ok: false, reason: 'PROVIDER_UNAVAILABLE_NOT_LOCALITY', action: ROUTER_ACTIONS.REJECT };
  }

  if (hostRole?.role === HOST_ROLES.CONTROL_AUTHORITY) {
    const local = String(decision.venue || '').startsWith('dial-hermes-control')
      || decision.action === ROUTER_ACTIONS.ORACLE_SANDBOX
      || decision.action === ROUTER_ACTIONS.ORACLE_PRIVILEGED;
    if (local) {
      const allowed = Object.values(VENUE_BASES).includes(decision.venue_basis);
      if (!allowed) {
        return { ok: false, reason: 'CONTROL_HOST_REQUIRES_VENUE_BASIS', action: ROUTER_ACTIONS.REJECT };
      }
    }
  }

  const roleGate = evaluateHostRole({
    hostRole,
    unit: unit || { work_class: 'PROJECT', control_plane_facts: {} },
    requestedVenue: decision.action === ROUTER_ACTIONS.ORACLE_SANDBOX ? 'ORACLE_SANDBOX' : decision.action,
  });
  if (!roleGate.ok) return { ok: false, reason: roleGate.reason, action: ROUTER_ACTIONS.REJECT };

  if (decision.venue_basis === VENUE_BASES.PROVIDER_ENVELOPE_EXCEEDED) {
    const requirement = decision.evidence?.requirement;
    const compared = decision.evidence?.envelopes_compared || [];
    if (!requirement || !compared.length) {
      return { ok: false, reason: 'ENVELOPE_EVIDENCE_MISSING', action: ROUTER_ACTIONS.REJECT };
    }
    const recomputed = compared.map((row) => ({
      ...row,
      recomputed: compareEnvelope(requirement, {
        status: row.envelope_status,
        limits: row.envelope,
      }),
    }));
    const supports = recomputed.length > 0
      && recomputed.every((row) => row.recomputed.fits === false);
    if (!supports) {
      return { ok: false, reason: 'ENVELOPE_COMPARISON_DOES_NOT_SUPPORT_BASIS', action: ROUTER_ACTIONS.REJECT, recomputed };
    }
  }

  if (decision.venue_basis === VENUE_BASES.HOST_SUBJECT) {
    const subject = decision.evidence?.host_subject;
    if (!subject) return { ok: false, reason: 'HOST_SUBJECT_EVIDENCE_MISSING', action: ROUTER_ACTIONS.REJECT };
    if (hostRole?.hostname && subject.hostname && subject.hostname !== hostRole.hostname) {
      return { ok: false, reason: 'HOST_SUBJECT_MISDIRECTED', action: ROUTER_ACTIONS.REJECT };
    }
  }

  if (decision.venue_basis === VENUE_BASES.PROVIDER_ATTEMPTED_INADEQUATE && !decision.evidence?.attempt_record) {
    return { ok: false, reason: 'ATTEMPT_EVIDENCE_MISSING', action: ROUTER_ACTIONS.REJECT };
  }

  return { ok: true, reason: null, action: decision.action, decision };
}
