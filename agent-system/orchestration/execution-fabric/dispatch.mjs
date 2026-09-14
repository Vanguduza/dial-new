import { ROUTER_ACTIONS } from './constants.mjs';
import { routeWorkUnit } from './venue-router.mjs';
import { signVenueDecision } from './venue-decision.mjs';
import { admitVenueDecision } from './venue-guard.mjs';
import { appendAuditRecord, auditRecord } from './audit-append.mjs';
import { classifyPressure } from './pressure-policy.mjs';

export function admitAndSign({
  unit,
  registry,
  hostRole,
  attempts,
  privateKey,
  publicKey,
  heartbeatPath,
  requireHeartbeat = true,
  pressure,
  nowMs,
  startedAtMs,
}) {
  const route = routeWorkUnit({ unit, registry, hostRole, attempts, nowMs, startedAtMs });
  if (route.action === ROUTER_ACTIONS.REJECT || route.action === ROUTER_ACTIONS.FAIL || route.action === ROUTER_ACTIONS.QUEUE) {
    return { route, decision: null, admission: { ok: false, reason: route.visible_failure || route.action } };
  }

  if (route.action === ROUTER_ACTIONS.ORACLE_SANDBOX) {
    const pressureNow = pressure || classifyPressure({});
    if (!pressureNow.admit_local_sandbox) {
      return {
        route,
        decision: null,
        admission: { ok: false, reason: `LOCAL_SANDBOX_NOT_ADMITTED_${pressureNow.level}` },
      };
    }
  }

  if (route.action === ROUTER_ACTIONS.DISPATCH_PROVIDER
    || route.action === ROUTER_ACTIONS.RETRY_PROVIDER
    || route.action === ROUTER_ACTIONS.SWITCH_PROVIDER) {
    return { route, decision: null, admission: { ok: true, reason: route.action } };
  }

  const decision = signVenueDecision({ route, privateKey });
  const admission = admitVenueDecision({
    decision,
    publicKey,
    hostRole,
    unit,
    heartbeatPath,
    requireHeartbeat,
    nowMs,
  });
  return { route, decision, admission };
}

export function recordFabricAudit({ auditPath, unit, route, decision, result, limits }) {
  if (!auditPath) return null;
  return appendAuditRecord(auditPath, auditRecord({ unit, route, decision, result, limits }));
}
