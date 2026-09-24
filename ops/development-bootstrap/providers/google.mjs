import fs from 'node:fs';
import path from 'node:path';
import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { versionProbe } from '../lib/probes.mjs';
import { integrationClaimAllowed, readCapabilityEvidence } from '../../../agent-system/orchestration/providers/google/external-capability-core.mjs';

// Google / external tooling classification. Browser/OAuth flows remain owner gates. DEC-033 makes every
// non-human capability retained in the active development registry readiness-required; kill switches are safety controls, not setup optionality:
//   WEB_APPLICATION / human-operated  -> REFERENCE_ONLY, never "missing host software"
//   active development capabilities admitted by DEC-033 -> CORE_DEVELOPMENT_REQUIRED and must be live-qualified
//   human-operated GMPC/reference-only capabilities remain REFERENCE_ONLY and are not host software
export function classifyExternalCapability(cap) {
  const mode = String(cap.supported_mode || '');
  const transport = String(cap.transport || '');
  const humanOperated = /human-operated|MANUAL_WEB/i.test(`${mode} ${transport}`) || cap.role === 'GMPC_EXTERNAL_CREATIVE_PROVIDER';
  if (humanOperated) return { tooling_kind: 'WEB_APPLICATION', readiness_class: 'REFERENCE_ONLY', operation_mode: 'HUMAN_OPERATED' };
  return { tooling_kind: /CLI/i.test(mode) ? 'CLI' : 'REMOTE_API', readiness_class: 'CORE_DEVELOPMENT_REQUIRED', operation_mode: cap.default_enabled === false ? 'KILL_SWITCH_DEFAULT_OFF_LEGACY_SUPERSEDED_BY_DEC033' : 'ENABLED' };
}

export function certifyGoogle({ role, repoDir, controlHome }) {
  const domain = 'Google tools';
  const registry = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json'), 'utf8'));
  const caps = registry.capabilities || registry.entries || registry;
  const list = Array.isArray(caps) ? caps : Object.values(caps);
  const checks = [];
  for (const cap of list) {
    const id = cap.capability_id || cap.id;
    if (!id) continue;
    const cls = classifyExternalCapability(cap);
    const base = { registry: 'agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json', kill_switch: cap.kill_switch || cap.enable_env || null, default_enabled: cap.default_enabled === true, ...cls };
    if (cls.readiness_class === 'REFERENCE_ONLY') {
      checks.push(check({ id: `google.${String(id).toLowerCase()}`, domain, title: `${id}: human-operated web application (REFERENCE_ONLY); not host software, not a development harness; governed by ${cap.functional_owner || 'its canon owner'}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, readiness_class: 'REFERENCE_ONLY', evidence: base }));
      continue;
    }
    const artifact = role === 'dial-hermes-control' && controlHome ? readCapabilityEvidence(controlHome, id) : null;
    const integrated = integrationClaimAllowed(artifact);
    const authRequired = artifact?.status === 'AUTH_REQUIRED' || artifact?.authentication?.verified === false;
    const status = integrated ? STATUS.PASS : authRequired ? STATUS.OWNER_ACTION_REQUIRED : STATUS.UNVERIFIED;
    checks.push(check({
      id: `google.${String(id).toLowerCase()}`,
      domain,
      title: `${id} (${cls.tooling_kind}) readiness evidence: ${artifact?.status || 'NO_EVIDENCE'}`,
      status,
      criticality: CRITICALITY.MANDATORY,
      readiness_class: 'CORE_DEVELOPMENT_REQUIRED',
      evidence: { ...base, owner_required_ref: 'DEC-033', evidence_status: artifact?.status || null, observed_at: artifact?.observed_at || artifact?.completed_at || null, authentication_verified: artifact?.authentication?.verified === true, definition_of_done: artifact?.definition_of_done?.passed === true, live_qualification: artifact?.live_qualification?.passed === true, orchestrated_use: artifact?.orchestrated_use?.passed === true, integration_claim_allowed: integrated },
      gate: integrated ? null : `AUTH-GATE-GOOGLE-${String(id).replace(/^[A-Z]+-/, '')}-001`,
      remediation: integrated ? null : 'complete required provider authentication/configuration and run node agent-system/orchestration/google-capability-cli.mjs qualify <provider>',
    }));
  }
  if (role === 'dial-hermes-control') {
    const agy = versionProbe('agy', ['--version'], { exact: '1.2.9' });
    checks.push(check({ id: 'google.antigravity.binary', domain, title: 'Antigravity agy 1.2.9 installed via SHA-256 pinned release (required worker harness)', status: agy.installed ? (agy.satisfies ? STATUS.PASS : STATUS.FAIL) : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: agy.command, output: agy.raw || 'not installed', owner_required_ref: 'DEC-033' }, remediation: 'bash deploy/oracle/hermes-codex/install-google-antigravity.sh' }));
  }
  checks.push(check({ id: 'google.gemini-cli', domain, title: 'Gemini / Gemini CLI / other Google AI tooling: not referenced by any canonical DIAL document or registry (REFERENCE_ONLY)', status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, readiness_class: 'REFERENCE_ONLY', evidence: { finding: 'not required' } }));
  return checks;
}
