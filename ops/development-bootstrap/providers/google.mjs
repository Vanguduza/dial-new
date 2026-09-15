import fs from 'node:fs';
import path from 'node:path';
import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { versionProbe } from '../lib/probes.mjs';

// Google tooling classification (mission section 14). Nothing here authenticates: browser/OAuth flows are owner gates.
export function certifyGoogle({ role, repoDir }) {
  const domain = 'Google tools';
  const registry = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json'), 'utf8'));
  const caps = registry.capabilities || registry.entries || registry;
  const list = Array.isArray(caps) ? caps : Object.values(caps);
  const checks = [];
  const classify = { 'DEV-ANTIGRAVITY': 'HOST_SOFTWARE+CLI', 'DESIGN-STITCH': 'REMOTE_API', 'CREATIVE-POMELLI': 'WEB_APPLICATION' };
  for (const cap of list) {
    const id = cap.capability_id || cap.id;
    if (!id) continue;
    const enabled = cap.default_enabled === true;
    checks.push(check({ id: `google.${String(id).toLowerCase()}`, domain, title: `${id} (${classify[id] || 'REMOTE_API'}) maturity=${cap.maturity || cap.status || 'UNKNOWN'} default_enabled=${enabled}`, status: enabled ? STATUS.UNVERIFIED : STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.OPTIONAL, evidence: { registry: 'agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json', kill_switch: cap.kill_switch || cap.enable_env || null }, gate: `AUTH-GATE-GOOGLE-${String(id).replace(/^[A-Z]+-/, '')}-001`, remediation: 'owner authentication (browser/OAuth or human session) then node agent-system/orchestration/google-capability-cli.mjs qualify' }));
  }
  if (role === 'dial-hermes-control') {
    const agy = versionProbe('agy', ['--version'], { exact: '1.2.0' });
    checks.push(check({ id: 'google.antigravity.binary', domain, title: 'Antigravity agy 1.2.0 installed via SHA-256 pinned installer', status: agy.installed ? (agy.satisfies ? STATUS.PASS : STATUS.FAIL) : STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.OPTIONAL, evidence: { command: agy.command, output: agy.raw || 'not installed' }, remediation: 'bash deploy/oracle/hermes-codex/install-google-antigravity.sh' }));
  }
  checks.push(check({ id: 'google.gemini-cli', domain, title: 'Gemini / Gemini CLI / other Google AI tooling', status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { finding: 'not referenced by any canonical DIAL document or registry; not required' } }));
  return checks;
}
