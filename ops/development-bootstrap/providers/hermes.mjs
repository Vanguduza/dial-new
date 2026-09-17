import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { binaryCheck } from './common.mjs';
import { fileMode, run } from '../lib/probes.mjs';
import os from 'node:os';
import path from 'node:path';

export function certifyHermes({ role, manifest }) {
  const domain = 'Hermes';
  const rt = manifest.runtimes.find((r) => r.id === 'rt.hermes');
  const checks = [];
  if (!rt.hosts.includes(role)) {
    checks.push(check({ id: 'hermes.placement', domain, title: `Hermes runtime not required on ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { manifest: rt.hosts } }));
    return checks;
  }
  checks.push(binaryCheck({ id: 'hermes.binary', domain, binary: 'hermes', remediation: rt.remediation }));
  // Provider binding is proven by the auth registry, but raw credential material is never emitted.
  const auth = run('hermes', ['auth', 'list'], { timeoutMs: 10000 });
  const openaiCodexPresent = auth.ok && /(?:^|\n)openai-codex\s*\(/m.test(auth.output);
  checks.push(check({ id: 'hermes.auth', domain, title: 'Hermes openai-codex OAuth binding present', status: openaiCodexPresent ? STATUS.PASS : STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: 'hermes auth list', provider: 'openai-codex', present: openaiCodexPresent, credential_values: 'never recorded' }, gate: openaiCodexPresent ? null : 'AUTH-GATE-HERMES-001', remediation: 'hermes auth add openai-codex' }));
  const home = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
  const cfg = path.join(home, 'config.yaml');
  const st = fileMode(cfg);
  if (!st.exists) {
    checks.push(check({ id: 'hermes.config', domain, title: 'Hermes config locked to openai-codex / gpt-5.6-sol / no fallback providers', status: STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { file: cfg, exists: false }, remediation: 'bash deploy/oracle/hermes-codex/install-control-plane.sh' }));
  } else {
    const py = run('python3', ['-c', `import sys,yaml;c=yaml.safe_load(open(sys.argv[1]))or{};m=c.get('model')or{};print('OK' if m.get('provider')=='openai-codex' and m.get('default')=='gpt-5.6-sol' and m.get('openai_runtime')=='codex_app_server' and c.get('fallback_providers')==[] and 'fallback_model' not in c else 'MISMATCH '+str({k:m.get(k) for k in ('provider','default','openai_runtime')}))`, cfg], { timeoutMs: 10000 });
    checks.push(check({ id: 'hermes.config', domain, title: 'Hermes config locked to openai-codex / gpt-5.6-sol / no fallback providers', status: /^OK/.test(py.output) && st.mode === '600' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: 'python3 yaml.safe_load(~/.hermes/config.yaml)', output: py.output, mode: st.mode }, remediation: 'bash deploy/oracle/hermes-codex/install-control-plane.sh' }));
  }
  for (const hook of ['dial-pre-turn-context.sh', 'dial-post-turn-checkpoint.sh']) {
    const h = fileMode(path.join(home, 'agent-hooks', hook));
    checks.push(check({ id: `hermes.hook.${hook.replace(/\.sh$/, '')}`, domain, title: `Hermes hook ${hook} installed mode 700`, status: h.exists && h.mode === '700' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { file: path.join(home, 'agent-hooks', hook), exists: h.exists, mode: h.mode }, remediation: 'bash deploy/oracle/hermes-codex/install-control-plane.sh' }));
  }
  return checks;
}
