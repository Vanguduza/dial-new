import { STATUS } from '../lib/result.mjs';

// Owner-interactive authentication gates (mission section 30). Derived from check results:
// any OWNER_ACTION_REQUIRED / EXTERNAL_GATE check with a gate id becomes an explicit gate record.
export function deriveAuthGates(checks, manifest) {
  const byGate = new Map();
  for (const c of checks) {
    if (![STATUS.OWNER_ACTION_REQUIRED, STATUS.EXTERNAL_GATE].includes(c.status) || !c.gate) continue;
    const cred = (manifest.credentials || []).find((x) => c.id.startsWith(x.id.replace(/^cred\./, '')) || (x.probe && c.evidence?.command && c.evidence.command.startsWith(x.probe.split(' ')[0])));
    byGate.set(c.gate, {
      gate_id: c.gate,
      status: 'OWNER_ACTION_REQUIRED',
      component: c.id,
      criticality: c.criticality,
      requirement: c.remediation || 'owner action',
      auth_type: cred?.auth_type || null,
      scopes: cred?.scopes || [],
      bootstrap_prerequisites: 'COMPLETE — machine-side prerequisites are installed/verified before this gate is raised',
      verification_command: c.evidence?.command || cred?.probe || null,
      expected_success_evidence: cred?.expected || `check ${c.id} returns PASS on re-run of bootstrap --verify`,
    });
  }
  return [...byGate.values()].sort((a, b) => a.gate_id.localeCompare(b.gate_id));
}
