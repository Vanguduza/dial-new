// Result vocabulary for every bootstrap check, action and gate.
// A status is evidence-backed or it is UNVERIFIED. "Appears correct" is not a status.
export const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  UNVERIFIED: 'UNVERIFIED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  OWNER_ACTION_REQUIRED: 'OWNER_ACTION_REQUIRED',
  EXTERNAL_GATE: 'EXTERNAL_GATE',
});
export const SEVERITY = Object.freeze({ P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' });
export const CRITICALITY = Object.freeze({ MANDATORY: 'MANDATORY', REQUIRED: 'REQUIRED', OPTIONAL: 'OPTIONAL' });

export const READINESS_CLASSES = Object.freeze(['CORE_DEVELOPMENT_REQUIRED', 'OWNER_CONTROL_REQUIRED', 'RECOVERY_REQUIRED', 'OPTIONAL_CAPABILITY', 'REFERENCE_ONLY']);

export function check({ id, domain, title, status, criticality = CRITICALITY.REQUIRED, evidence = {}, remediation = null, severity = null, gate = null, detail = null, readiness_class = null }) {
  if (!id || !domain || !title) throw new Error('check requires id, domain and title');
  if (!Object.values(STATUS).includes(status)) throw new Error(`invalid status ${status} for ${id}`);
  if (readiness_class && !READINESS_CLASSES.includes(readiness_class)) throw new Error(`invalid readiness_class ${readiness_class} for ${id}`);
  const cls = readiness_class || (criticality === CRITICALITY.OPTIONAL ? 'OPTIONAL_CAPABILITY' : 'CORE_DEVELOPMENT_REQUIRED');
  return Object.freeze({ id, domain, title, status, criticality, evidence, remediation, severity, gate, detail, readiness_class: cls });
}

export function summarize(checks) {
  const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  for (const c of checks) counts[c.status] += 1;
  const mandatoryFailures = checks.filter((c) => c.criticality === CRITICALITY.MANDATORY && c.status !== STATUS.PASS && c.status !== STATUS.NOT_APPLICABLE);
  const requiredFailures = checks.filter((c) => c.criticality === CRITICALITY.REQUIRED && (c.status === STATUS.FAIL));
  return { total: checks.length, counts, mandatory_open: mandatoryFailures.map((c) => c.id), required_failed: requiredFailures.map((c) => c.id) };
}

// Verdict law (section 44 of the mission brief): GREEN only when every mandatory check passes and no P0 remains.
export function verdict(checks, { p0Open = [] } = {}) {
  const s = summarize(checks);
  if (p0Open.length > 0) return { verdict: 'RED', reason: `unresolved P0 findings: ${p0Open.join(', ')}` };
  if (s.mandatory_open.length > 0) {
    const failed = checks.filter((c) => s.mandatory_open.includes(c.id) && c.status === STATUS.FAIL);
    if (failed.length > 0) return { verdict: 'RED', reason: `mandatory checks failed: ${failed.map((c) => c.id).join(', ')}` };
    return { verdict: 'RED', reason: `mandatory checks not certified: ${s.mandatory_open.join(', ')}` };
  }
  if (s.required_failed.length > 0 || s.counts.OWNER_ACTION_REQUIRED > 0 || s.counts.EXTERNAL_GATE > 0 || s.counts.UNVERIFIED > 0) {
    return { verdict: 'AMBER', reason: 'required checks failed, unverified, or external/owner gates remain' };
  }
  return { verdict: 'GREEN', reason: 'every mandatory and required check passed with evidence' };
}
