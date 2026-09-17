import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { fileMode } from '../lib/probes.mjs';
import path from 'node:path';
import fs from 'node:fs';

export function certifyXkiro({ role, controlHome }) {
  const domain = 'Xkiro';
  if (role !== 'dial-hermes-control') return [check({ id: 'xkiro.placement', domain, title: `HAIF not placed on ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: {} })];
  const key = fileMode(path.join(controlHome, 'secrets', 'xkiro-api.key'));
  if (!key.exists) return [check({ id: 'xkiro.credential', domain, title: 'xKiro API key present (required admitted auxiliary)', status: STATUS.OWNER_ACTION_REQUIRED, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: 'secrets/xkiro-api.key', exists: false, value: 'never read' }, gate: 'AUTH-GATE-XKIRO-001', remediation: 'bash deploy/oracle/hermes-codex/install-haif.sh with a DIAL-only account key on stdin; then npm run agent:haif:qualify' })];
  const evidenceFile = path.join(controlHome, 'operations', 'auxiliary', 'qualification', 'xkiro-dial-latest.json');
  let artifact = null;
  try { artifact = JSON.parse(fs.readFileSync(evidenceFile, 'utf8')); } catch {}
  const qualified = artifact?.status === 'PUBLIC_ONLY_TRANSPORT_QUALIFIED'
    && artifact?.authentication?.verified === true
    && artifact?.secret?.secure === true
    && artifact?.canary?.completed === true
    && artifact?.billing_guard?.client_free_only === true;
  return [
    check({ id: 'xkiro.credential-mode', domain, title: 'xKiro API key mode 600', status: key.mode === '600' ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: 'secrets/xkiro-api.key', mode: key.mode, value: 'never read' }, remediation: 'chmod 600' }),
    check({ id: 'xkiro.live-qualification', domain, title: `HAIF live qualification evidence: ${artifact?.status || 'ABSENT'}`, status: qualified ? STATUS.PASS : STATUS.UNVERIFIED, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { file: 'operations/auxiliary/qualification/xkiro-dial-latest.json', observed_at: artifact?.observed_at || artifact?.completed_at || null, authentication_verified: artifact?.authentication?.verified === true, canary_completed: artifact?.canary?.completed === true, client_free_only: artifact?.billing_guard?.client_free_only === true, provider_zero_spend_console: artifact?.billing_guard?.provider_side_zero_spend || null }, remediation: qualified ? null : 'run the HAIF qualification on the control host; bootstrap never spends provider quota on its own' }),
  ];
}
