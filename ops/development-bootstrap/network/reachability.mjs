import fs from 'node:fs';
import path from 'node:path';
import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { httpsReach, tcpReach, run } from '../lib/probes.mjs';
import { itemsForRole } from '../lib/manifest.mjs';

function configuredValue(controlHome, key) {
  const file = path.join(controlHome || '/var/lib/dial-control', 'config', 'development-network.env');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(\S+)$/);
    if (match && match[1] === key) return match[2];
  }
  return null;
}

export function resolveNetworkTarget(dep, { controlHome = null, env = process.env } = {}) {
  if (!dep?.resolve_via) return dep?.target || null;
  return env[dep.resolve_via] || configuredValue(controlHome, dep.resolve_via) || dep.target || null;
}

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

export async function certifyNetwork({ role, manifest, controlHome = null }) {
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
    const target = resolveNetworkTarget(dep, { controlHome });
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
  if (role === 'dial-hermes-control') {
    const listeners = run('ss', ['-ltnH'], { timeoutMs: 5000 });
    const ports = new Set(['9130', '9132', '9119', '3011', '9141']);
    const observed = [];
    const violations = [];
    if (listeners.ok) {
      for (const line of listeners.output.split(/\n+/).filter(Boolean)) {
        const parts = line.trim().split(/\s+/);
        const local = parts[3] || '';
        const match = local.match(/:(\d+)$/);
        if (!match || !ports.has(match[1])) continue;
        observed.push(local);
        if (!(local.startsWith('127.0.0.1:') || local.startsWith('[::1]:') || local.startsWith('::1:'))) violations.push(local);
      }
    }
    checks.push(check({ id: 'net.loopback-only-services', domain, title: 'control-plane listeners bind loopback only (9130/9132/9119/3011/9141)', status: listeners.ok && violations.length === 0 ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: listeners.command, listeners: observed, violations }, remediation: 'reconfigure any exposed control-plane listener to 127.0.0.1 and reinstall its unit' }));
  } else {
    checks.push(check({ id: 'net.loopback-only-services', domain, title: 'control-plane loopback-listener check belongs on dial-hermes-control', status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: {} }));
  }
  return checks;
}
