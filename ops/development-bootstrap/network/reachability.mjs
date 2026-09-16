import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { httpsReach, tcpReach, run } from '../lib/probes.mjs';
import { itemsForRole } from '../lib/manifest.mjs';

export function evaluateTailscaleState(doc = {}) {
  const backend_state = doc?.BackendState || null;
  const online = doc?.Self?.Online === true;
  const rawIps = Array.isArray(doc?.TailscaleIPs) ? doc.TailscaleIPs : (Array.isArray(doc?.Self?.TailscaleIPs) ? doc.Self.TailscaleIPs : []);
  const ips = rawIps.filter(Boolean);
  return {
    ok: backend_state === 'Running' && online && ips.length > 0,
    needs_login: backend_state === 'NeedsLogin',
    backend_state,
    online,
    tailscale_ips: ips,
    dns_name: doc?.Self?.DNSName || null,
  };
}

export async function certifyNetwork({ role, manifest }) {
  const domain = 'Network';
  const deps = itemsForRole(manifest.network_dependencies, role);
  const checks = [];
  for (const dep of deps) {
    if (dep.probe === 'TAILSCALE') {
      const r = run('tailscale', ['status', '--json'], { timeoutMs: 10000 });
      let parsed = null;
      try { parsed = JSON.parse(r.output || '{}'); } catch {}
      const ev = evaluateTailscaleState(parsed || {});
      const status = ev.ok ? STATUS.PASS : ev.needs_login ? STATUS.OWNER_ACTION_REQUIRED : STATUS.FAIL;
      checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose}: ${ev.backend_state || 'UNAVAILABLE'}`, status, criticality: dep.criticality, readiness_class: dep.readiness_class, evidence: { command: r.command, exit: r.status, ...ev }, gate: ev.ok ? null : (dep.gate || 'EXTERNAL-GATE-SECONDARY-RECOVERY-OVERLAY-001'), remediation: dep.owner_action || 'authenticate Tailscale or configure the owner-approved equivalent secondary recovery overlay' }));
      continue;
    }
    const target = dep.resolve_via ? (process.env[dep.resolve_via] || dep.target || null) : dep.target;
    if (!target) {
      checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose}: endpoint not configured`, status: dep.configuration_required ? STATUS.OWNER_ACTION_REQUIRED : STATUS.NOT_APPLICABLE, criticality: dep.criticality, readiness_class: dep.readiness_class, evidence: { resolve_via: dep.resolve_via || null, configured: false, placeholder_used: false }, gate: dep.configuration_required ? (dep.gate || 'EXTERNAL-GATE-CLOUDFLARE-ACCESS-001') : null, remediation: dep.owner_action || null }));
      continue;
    }
    if (target.startsWith('ssh://')) {
      const host = process.env[dep.resolve_via] || null;
      if (!host) { checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose} (${dep.target})`, status: STATUS.OWNER_ACTION_REQUIRED, criticality: dep.criticality, evidence: { resolve_via: dep.resolve_via, present: false }, gate: 'AUTH-GATE-WORKER-SSH-001', remediation: `export ${dep.resolve_via}=<private ip> and install the worker forced-command key` })); continue; }
      const r = await tcpReach(host, 22);
      checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose}: tcp/22 ${host}`, status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: dep.criticality, evidence: r, remediation: 'check VCN security list / NSG for tcp/22 between control and worker' }));
      continue;
    }
    const r = await httpsReach(target);
    checks.push(check({ id: `net.${dep.id.replace(/^net\./, '')}`, domain, title: `${dep.purpose}: ${target}`, status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: dep.criticality, readiness_class: dep.readiness_class, evidence: r, remediation: 'check egress policy / proxy for this host' }));
  }
  checks.push(check({ id: 'net.loopback-only-services', domain, title: 'control-plane listeners bind 127.0.0.1 only (9130/9132/9119/3011/9141)', status: role === 'dial-hermes-control' ? STATUS.UNVERIFIED : STATUS.NOT_APPLICABLE, criticality: CRITICALITY.REQUIRED, evidence: { command: "ss -ltnp | grep -E ':(9130|9132|9119|3011|9141)\\b'" }, remediation: 'verified live via systemd/units check + ss on the control host' }));
  return checks;
}
