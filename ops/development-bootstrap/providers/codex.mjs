import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { binaryCheck, forbiddenEnvCheck, authProbe } from './common.mjs';
import { fileMode } from '../lib/probes.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function certifyCodex({ role, manifest }) {
  const domain = 'Codex';
  const rt = manifest.runtimes.find((r) => r.id === 'rt.codex');
  const required = rt.hosts.includes(role);
  const checks = [];
  if (!required) {
    checks.push(check({ id: 'codex.placement', domain, title: `Codex runtime not required on ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { manifest: rt.hosts } }));
    return checks;
  }
  checks.push(binaryCheck({ id: 'codex.binary', domain, binary: 'codex', minimum: rt.minimum_version, remediation: rt.remediation }));
  checks.push(forbiddenEnvCheck({ id: 'codex.no-ambient-key', domain, names: ['OPENAI_API_KEY', 'CODEX_API_KEY'] }));
  checks.push(authProbe({ id: 'codex.auth', domain, title: 'Codex ChatGPT subscription OAuth (codex login status)', cmd: 'codex', args: ['login', 'status'], expectPattern: /Logged in using ChatGPT/, ownerAction: 'run `codex login` on the control host (browser OAuth)', gateId: 'AUTH-GATE-CODEX-001' }));
  const cfg = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
  const st = fileMode(cfg);
  let pinned = false;
  if (st.exists) { try { pinned = /^model\s*=\s*"gpt-5\.6-sol"/m.test(fs.readFileSync(cfg, 'utf8')); } catch {} }
  checks.push(check({ id: 'codex.config-pinned', domain, title: 'codex config.toml pins model gpt-5.6-sol with mode 600', status: st.exists ? (pinned && st.mode === '600' ? STATUS.PASS : STATUS.FAIL) : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { file: cfg, exists: st.exists, mode: st.mode, model_pinned: pinned }, remediation: 'bash deploy/oracle/hermes-codex/install-control-plane.sh' }));
  return checks;
}
