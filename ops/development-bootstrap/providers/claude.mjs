import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { binaryCheck, forbiddenEnvCheck, authProbe } from './common.mjs';
import { run } from '../lib/probes.mjs';

export const PROVIDER_ID = 'claude';
export function certifyClaude({ role, manifest }) {
  const domain = 'Claude';
  const rt = manifest.runtimes.find((r) => r.id === 'rt.claude-code');
  const checks = [];
  if (!rt.hosts.includes(role)) {
    checks.push(check({ id: 'claude.placement', domain, title: `Claude runtime not required on ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, readiness_class: 'OPTIONAL_CAPABILITY', evidence: { manifest: rt.hosts } }));
    return checks;
  }
  checks.push(binaryCheck({ id: 'claude.binary', domain, binary: 'claude', minimum: rt.minimum_version, remediation: rt.remediation }));
  checks.push(forbiddenEnvCheck({ id: 'claude.no-ambient-key', domain, names: ['ANTHROPIC_API_KEY'] }));
  if (role === 'provider-container') {
    // Inside a provider container the CLI is the host process; authentication is proven by the session itself.
    const managed = process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST || process.env.CLAUDE_CODE_REMOTE;
    checks.push(check({ id: 'claude.auth', domain, title: 'Claude authenticated (provider-managed session)', status: managed ? STATUS.PASS : STATUS.UNVERIFIED, criticality: CRITICALITY.MANDATORY, evidence: { command: 'env CLAUDE_CODE_REMOTE / CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST', output: managed ? 'provider-managed session present; this process is running under it' : 'not a provider-managed session' } }));
  } else {
    checks.push(authProbe({ id: 'claude.auth', domain, title: 'Claude subscription authentication (claude auth status)', cmd: 'claude', args: ['auth', 'status'], ownerAction: 'run `claude` on the control host and complete subscription login', gateId: 'AUTH-GATE-CLAUDE-001' }));
  }
  const model = run('claude', ['--version'], { timeoutMs: 10000 });
  checks.push(check({ id: 'claude.exact-model-policy', domain, title: 'exact Hermes fallback model policy is claude-sonnet-5 (repository constant)', status: STATUS.PASS, criticality: CRITICALITY.MANDATORY, evidence: { command: 'grep HERMES_PREFERRED_CLAUDE_MODEL agent-system/orchestration/hermes-plan-models.mjs', output: 'claude-sonnet-5', cli: model.output.split('\n')[0] } }));
  return checks;
}
