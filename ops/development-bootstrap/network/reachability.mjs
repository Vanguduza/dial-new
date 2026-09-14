import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { httpsReach, tcpReach } from '../lib/probes.mjs';
import { itemsForRole } from '../lib/manifest.mjs';

export async function certifyNetwork({ role, manifest }) {
  const domain = 'Network';
  const deps = itemsForRole(manifest.network_dependencies, role);
  const checks = [];
  for (const dep of deps) {
    if (dep.target.startsWith('ssh://')) {
      const host = process.env[dep.resolve_via] || null;
      if (!host) { checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose} (${dep.target})`, status: STATUS.OWNER_ACTION_REQUIRED, criticality: dep.criticality, evidence: { resolve_via: dep.resolve_via, present: false }, gate: 'AUTH-GATE-WORKER-SSH-001', remediation: `export ${dep.resolve_via}=<private ip> and install the worker forced-command key` })); continue; }
      const r = await tcpReach(host, 22);
      checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose}: tcp/22 ${host}`, status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: dep.criticality, evidence: r, remediation: 'check VCN security list / NSG for tcp/22 between control and worker' }));
      continue;
    }
    const r = await httpsReach(dep.target);
    checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose}: ${dep.target}`, status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: dep.criticality, evidence: r, remediation: 'check egress policy / proxy for this host' }));
  }
  checks.push(check({ id: 'net.loopback-only-services', domain, title: 'control-plane listeners bind 127.0.0.1 only (9130/9132/9119/3011/9141)', status: role === 'dial-hermes-control' ? STATUS.UNVERIFIED : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.REQUIRED, evidence: { command: "ss -ltnp | grep -E ':(9130|9132|9119|3011|9141)\\b'" }, remediation: 'verified live via systemd/units check + ss on the control host' }));
  return checks;
}
