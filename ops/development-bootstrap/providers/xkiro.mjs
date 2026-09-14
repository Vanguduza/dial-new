import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { fileMode } from '../lib/probes.mjs';
import path from 'node:path';

export function certifyXkiro({ role, controlHome }) {
  const domain = 'Xkiro';
  if (role !== 'dial-hermes-control') return [check({ id: 'xkiro.placement', domain, title: `HAIF not placed on ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: {} })];
  const key = fileMode(path.join(controlHome, 'secrets', 'xkiro-api.key'));
  if (!key.exists) return [check({ id: 'xkiro.credential', domain, title: 'xKiro API key present (optional auxiliary)', status: STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.OPTIONAL, evidence: { file: 'secrets/xkiro-api.key', exists: false, value: 'never read' }, gate: 'AUTH-GATE-XKIRO-001', remediation: 'bash deploy/oracle/hermes-codex/install-haif.sh with a DIAL-only account key on stdin; then npm run agent:haif:qualify' })];
  return [
    check({ id: 'xkiro.credential-mode', domain, title: 'xKiro API key mode 600', status: key.mode === '600' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { file: 'secrets/xkiro-api.key', mode: key.mode, value: 'never read' }, remediation: 'chmod 600' }),
    check({ id: 'xkiro.live-qualification', domain, title: 'HAIF live qualification evidence (usage endpoint + elite free route canary)', status: STATUS.UNVERIFIED, criticality: CRITICALITY.OPTIONAL, evidence: { command: 'npm run agent:haif:qualify' }, remediation: 'run the HAIF qualification on the control host; bootstrap never spends provider quota on its own' }),
  ];
}
