import { STATUS, CRITICALITY } from './result.mjs';

// Readiness classes (closure item 4). Every manifest item and every check carries exactly one class.
//   CORE_DEVELOPMENT_REQUIRED  the development system cannot run bounded development without it
//   OWNER_CONTROL_REQUIRED     the owner cannot steer/observe/approve without it
//   RECOVERY_REQUIRED          the estate cannot be recovered without it
//   OPTIONAL_CAPABILITY        may be absent; non-blocking only where canon says so (canon_non_blocking_ref)
//   REFERENCE_ONLY             human-operated / web application / documentation; never host software
export const READINESS = Object.freeze({
  CORE_DEVELOPMENT_REQUIRED: 'CORE_DEVELOPMENT_REQUIRED',
  OWNER_CONTROL_REQUIRED: 'OWNER_CONTROL_REQUIRED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  OPTIONAL_CAPABILITY: 'OPTIONAL_CAPABILITY',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
});
export const READINESS_VALUES = new Set(Object.values(READINESS));

// Profiles: which classes must be fully passed for the profile to be GREEN.
// A whole-system GREEN always includes owner control and recovery.
export const PROFILES = Object.freeze({
  WHOLE_SYSTEM_GREEN: [READINESS.CORE_DEVELOPMENT_REQUIRED, READINESS.OWNER_CONTROL_REQUIRED, READINESS.RECOVERY_REQUIRED],
  CORE_DEVELOPMENT: [READINESS.CORE_DEVELOPMENT_REQUIRED],
  OWNER_CONTROL: [READINESS.OWNER_CONTROL_REQUIRED],
  RECOVERY: [READINESS.RECOVERY_REQUIRED],
});
export const DEFAULT_PROFILE = 'WHOLE_SYSTEM_GREEN';

const BLOCKING_STATUSES = new Set([STATUS.FAIL]);
const OPEN_STATUSES = new Set([STATUS.UNVERIFIED, STATUS.OWNER_ACTION_REQUIRED, STATUS.EXTERNAL_GATE]);

// Class for a check that did not declare one: derived from criticality so nothing is silently optional.
export function defaultReadinessClass(check) {
  if (check.readiness_class && READINESS_VALUES.has(check.readiness_class)) return check.readiness_class;
  if (check.criticality === CRITICALITY.OPTIONAL) return READINESS.OPTIONAL_CAPABILITY;
  return READINESS.CORE_DEVELOPMENT_REQUIRED;
}

// Evaluate one profile. GREEN requires every check in a required class to be PASS or NOT_APPLICABLE, every
// required manifest item to have produced at least one check (coverage), and no blocking status anywhere in
// the required classes. Optional capabilities never block; reference-only items never count as host software.
export function evaluateProfile({ profile = DEFAULT_PROFILE, checks = [], requiredItems = [] } = {}) {
  const classes = PROFILES[profile];
  if (!classes) throw new Error(`unknown readiness profile ${profile}`);
  const required = new Set(classes);
  const inScope = checks.filter((c) => required.has(defaultReadinessClass(c)));
  const failed = inScope.filter((c) => BLOCKING_STATUSES.has(c.status)).map((c) => c.id);
  const open = inScope.filter((c) => OPEN_STATUSES.has(c.status)).map((c) => c.id);
  const coverage = requiredItems.filter((item) => required.has(item.readiness_class)).map((item) => {
    const produced = checks.some((c) => c.id === item.id || c.id.startsWith(`${item.id}.`) || (item.check_ids || []).some((id) => c.id === id));
    return { id: item.id, readiness_class: item.readiness_class, covered: produced };
  });
  const uncovered = coverage.filter((c) => !c.covered).map((c) => c.id);
  let status = 'GREEN';
  let reason = `every ${classes.join('+')} check passed with evidence`;
  if (failed.length) { status = 'RED'; reason = `blocking failures in required classes: ${failed.join(', ')}`; }
  else if (uncovered.length) { status = 'RED'; reason = `required items produced no check (coverage gap): ${uncovered.join(', ')}`; }
  else if (open.length) { status = 'AMBER'; reason = `required checks not yet certified (unverified/owner/external gates): ${open.join(', ')}`; }
  return { profile, required_classes: classes, status, reason, checks_in_scope: inScope.length, failed, open, uncovered, by_class: Object.fromEntries(classes.map((cls) => [cls, summarizeClass(checks.filter((c) => defaultReadinessClass(c) === cls))])) };
}

function summarizeClass(list) {
  const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  for (const c of list) counts[c.status] += 1;
  return { total: list.length, counts };
}

export function evaluateAllProfiles({ checks = [], requiredItems = [] } = {}) {
  return Object.fromEntries(Object.keys(PROFILES).map((p) => [p, evaluateProfile({ profile: p, checks, requiredItems })]));
}

// Required items for a role, drawn from the manifest so the green flag enumerates every mandatory item
// rather than a hand-picked few (closure item 3).
export function requiredItemsForRole(manifest, role) {
  const out = [];
  const lists = { packages: manifest.packages, runtimes: manifest.runtimes, services: manifest.services, mcp_servers: manifest.mcp_servers, providers: manifest.providers, plugins: manifest.plugins, credentials: manifest.credentials, network_dependencies: manifest.network_dependencies, health_checks: manifest.health_checks, certification_gates: manifest.certification_gates };
  for (const [kind, list] of Object.entries(lists)) {
    for (const item of list || []) {
      if (item.hosts && !item.hosts.includes(role)) continue;
      const cls = item.readiness_class || READINESS.OPTIONAL_CAPABILITY;
      if (cls === READINESS.OPTIONAL_CAPABILITY || cls === READINESS.REFERENCE_ONLY) continue;
      out.push({ id: item.id, kind, readiness_class: cls, check_ids: item.check_ids || [], name: item.name || item.unit || item.binary || item.id });
    }
  }
  return out;
}
