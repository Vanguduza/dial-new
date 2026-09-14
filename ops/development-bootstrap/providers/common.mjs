import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { versionProbe, run, envPresent } from '../lib/probes.mjs';

// Shared provider certification shape. Every provider proves four things separately:
// binary present -> version satisfies -> authentication probe passes -> forbidden ambient keys absent.
// A token file existing is never "authenticated"; only a benign live probe is.
export function binaryCheck({ id, domain, binary, minimum = null, exact = null, args = ['--version'], criticality = CRITICALITY.MANDATORY, remediation }) {
  const p = versionProbe(binary, args, { minimum, exact });
  if (!p.installed) return check({ id, domain, title: `${binary} installed`, status: STATUS.FAIL, criticality, evidence: { command: p.command, output: 'not found on PATH' }, remediation });
  return check({ id, domain, title: `${binary} version ${minimum ? `>= ${minimum}` : exact ? `== ${exact}` : 'present'}`, status: p.satisfies ? STATUS.PASS : STATUS.FAIL, criticality, evidence: { command: p.command, output: p.raw, location: p.location, version: p.version }, remediation: p.satisfies ? null : remediation });
}

export function forbiddenEnvCheck({ id, domain, names, criticality = CRITICALITY.MANDATORY }) {
  const present = envPresent(names);
  const leaked = Object.entries(present).filter(([, v]) => v).map(([k]) => k);
  return check({ id, domain, title: `no ambient API keys (${names.join(', ')})`, status: leaked.length ? STATUS.FAIL : STATUS.PASS, criticality, evidence: { command: `env | grep -E '^(${names.join('|')})='`, present_names: leaked, values: 'never read' }, remediation: leaked.length ? `unset ${leaked.join(' ')}; subscription-only runtimes reject API-key billing paths` : null, severity: leaked.length ? 'P0' : null });
}

export function authProbe({ id, domain, title, cmd, args, expectPattern = null, criticality = CRITICALITY.MANDATORY, ownerAction, gateId, timeoutMs = 20000 }) {
  const r = run(cmd, args, { timeoutMs });
  if (r.error && /ENOENT/.test(r.error)) return check({ id, domain, title, status: STATUS.FAIL, criticality, evidence: { command: r.command, output: 'binary missing' }, remediation: ownerAction });
  const ok = r.ok && (!expectPattern || expectPattern.test(r.output));
  if (ok) return check({ id, domain, title, status: STATUS.PASS, criticality, evidence: { command: r.command, output: r.output.slice(0, 300), exit: r.status } });
  return check({ id, domain, title, status: STATUS.OWNER_ACTION_REQUIRED, criticality, evidence: { command: r.command, output: r.output.slice(0, 300), exit: r.status }, remediation: ownerAction, gate: gateId });
}
