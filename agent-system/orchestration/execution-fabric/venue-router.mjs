import { FORBIDDEN_LOCAL_BASIS, PROVIDER_OUTCOMES, ROUTER_ACTIONS, VENUE_BASES } from './constants.mjs';
import { envelopeCheck } from './envelope-check.mjs';
import { eligibleProviders, providerById } from './provider-registry.mjs';
import { resolveAttemptBudget, budgetState } from './attempt-budget.mjs';
import { evaluateHostRole } from './host-role.mjs';

export function controlPlaneHostSubject(unit) {
  const subject = unit?.control_plane_facts?.host_subject;
  if (!subject || typeof subject !== 'object') return null;
  if (!subject.hostname && !subject.node_id) return null;
  return subject;
}

export function routeWorkUnit({
  unit,
  registry,
  hostRole,
  attempts = [],
  nowMs = Date.now(),
  startedAtMs = null,
} = {}) {
  const roleGate = evaluateHostRole({ hostRole, unit });
  if (!roleGate.ok) {
    return reject(roleGate.reason, unit);
  }

  const hostSubject = controlPlaneHostSubject(unit);
  if (hostSubject) {
    return decision({
      action: ROUTER_ACTIONS.ORACLE_PRIVILEGED,
      venue: `${hostSubject.hostname || hostSubject.node_id}/privileged`,
      venue_basis: VENUE_BASES.HOST_SUBJECT,
      attempt_first: false,
      evidence: { host_subject: hostSubject },
      unit,
    });
  }

  const envelope = envelopeCheck({ unit, registry });
  if (envelope.exceeded) {
    return decision({
      action: ROUTER_ACTIONS.ORACLE_SANDBOX,
      venue: 'dial-hermes-control/sandbox',
      venue_basis: VENUE_BASES.PROVIDER_ENVELOPE_EXCEEDED,
      attempt_first: false,
      evidence: {
        requirement: envelope.requirement,
        envelopes_compared: envelope.compared,
        exceeded_dimension: envelope.exceeded_dimension,
      },
      unit,
    });
  }

  const providers = eligibleProviders(registry);
  const budget = resolveAttemptBudget({ registry, unit });
  const budgetNow = budgetState({ attempts, budget, nowMs, startedAtMs });
  const last = attempts[attempts.length - 1];
  const lastClass = last?.outcome || last?.class;

  if (lastClass === PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE) {
    return decision({
      action: ROUTER_ACTIONS.ORACLE_SANDBOX,
      venue: 'dial-hermes-control/sandbox',
      venue_basis: VENUE_BASES.PROVIDER_ATTEMPTED_INADEQUATE,
      attempt_first: false,
      evidence: {
        attempt_record: last,
        observed_reason: last.observed_reason || last.reason || null,
      },
      unit,
    });
  }

  if (lastClass === PROVIDER_OUTCOMES.SUCCESS) {
    return decision({
      action: ROUTER_ACTIONS.DISPATCH_PROVIDER,
      venue: `provider/${last.provider_id}`,
      venue_basis: null,
      attempt_first: false,
      evidence: { attempt_record: last },
      unit,
      complete: true,
    });
  }

  if (budgetNow.exhausted && lastClass !== PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE) {
    return decision({
      action: ROUTER_ACTIONS.FAIL,
      venue: null,
      venue_basis: null,
      attempt_first: false,
      evidence: { budget: budgetNow, attempts },
      unit,
      visible_failure: 'ATTEMPT_BUDGET_EXHAUSTED',
    });
  }

  const nextProvider = selectNextProvider({ providers, attempts, preferred: unit?.control_plane_facts?.preferred_provider_id });
  if (!nextProvider) {
    if (attempts.length && attempts.every((row) => (row.outcome || row.class) === PROVIDER_OUTCOMES.UNAVAILABLE)) {
      return decision({
        action: attempts.length ? ROUTER_ACTIONS.QUEUE : ROUTER_ACTIONS.FAIL,
        venue: null,
        venue_basis: FORBIDDEN_LOCAL_BASIS,
        forbid_oracle: true,
        attempt_first: false,
        evidence: { attempts, reason: 'all eligible providers unavailable' },
        unit,
        visible_failure: attempts.length ? 'PROVIDER_UNAVAILABLE_QUEUED' : 'NO_ELIGIBLE_PROVIDER',
      });
    }
    return decision({
      action: ROUTER_ACTIONS.FAIL,
      venue: null,
      venue_basis: null,
      attempt_first: false,
      evidence: { attempts },
      unit,
      visible_failure: 'NO_ELIGIBLE_PROVIDER',
    });
  }

  const action = lastClass === PROVIDER_OUTCOMES.UNAVAILABLE
    ? (providerById(registry, last.provider_id)?.provider_id === nextProvider.provider_id
      ? ROUTER_ACTIONS.RETRY_PROVIDER
      : ROUTER_ACTIONS.SWITCH_PROVIDER)
    : ROUTER_ACTIONS.DISPATCH_PROVIDER;

  return decision({
    action,
    venue: `provider/${nextProvider.provider_id}`,
    venue_basis: null,
    attempt_first: true,
    evidence: {
      selected_provider_id: nextProvider.provider_id,
      envelope_check: envelope,
      budget: budgetNow,
    },
    unit,
  });
}

function selectNextProvider({ providers, attempts, preferred }) {
  const used = new Set(attempts.map((row) => row.provider_id));
  const unused = providers.filter((entry) => !used.has(entry.provider_id));
  if (preferred) {
    const hit = unused.find((entry) => entry.provider_id === preferred);
    if (hit) return hit;
  }
  if (unused.length) return unused[0];
  const last = attempts[attempts.length - 1];
  if (last?.outcome === 'UNAVAILABLE' || last?.class === 'UNAVAILABLE') return null;
  return providers[0] || null;
}

function decision({
  action,
  venue,
  venue_basis,
  attempt_first,
  evidence,
  unit,
  forbid_oracle = false,
  visible_failure = null,
  complete = false,
}) {
  return {
    action,
    venue,
    venue_basis,
    attempt_first,
    forbid_oracle: forbid_oracle || venue_basis === FORBIDDEN_LOCAL_BASIS,
    evidence,
    unit_id: unit?.unit_id || unit?.job_id || null,
    requested_by: unit?.requested_by || null,
    visible_failure,
    complete,
    model_selection: 'UNCHANGED',
  };
}

function reject(reason, unit) {
  return {
    action: ROUTER_ACTIONS.REJECT,
    venue: null,
    venue_basis: null,
    attempt_first: false,
    forbid_oracle: true,
    evidence: { reason },
    unit_id: unit?.unit_id || unit?.job_id || null,
    requested_by: unit?.requested_by || null,
    visible_failure: reason,
    complete: false,
    model_selection: 'UNCHANGED',
  };
}
