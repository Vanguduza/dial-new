import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { systemdAvailable, unitState, run } from '../lib/probes.mjs';
import { itemsForRole } from '../lib/manifest.mjs';

export function certifySystemd({ role, manifest }) {
  const domain = 'Systemd';
  const services = itemsForRole(manifest.services, role);
  if (!services.length) return [check({ id: 'systemd.placement', domain, title: `no supervised services declared for ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: {} })];
  const sd = systemdAvailable();
  if (!sd.available) return [check({ id: 'systemd.available', domain, title: 'systemd user manager reachable', status: role === 'provider-container' ? STATUS.NOT_APPLICABLE : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: sd.command, output: sd.state || sd.error }, remediation: 'loginctl enable-linger <service user>; ensure XDG_RUNTIME_DIR' })];
  const checks = [];
  for (const s of services) {
    const st = unitState(s.unit);
    const healthy = st.active === 'active' && (st.enabled === 'enabled' || st.enabled === 'static' || st.enabled === 'linked');
    checks.push(check({ id: `systemd.${s.unit}`, domain, title: `${s.unit} enabled + active`, status: healthy ? STATUS.PASS : STATUS.FAIL, criticality: s.criticality, evidence: { command: st.command, active: st.active, enabled: st.enabled }, remediation: `bash ${s.installer}` }));
    if (healthy) {
      const show = run('systemctl', ['--user', 'show', s.unit, '-p', 'NoNewPrivileges', '-p', 'ProtectSystem', '-p', 'Environment'], { timeoutMs: 5000 });
      const nnp = /NoNewPrivileges=yes/.test(show.output); const ps = /ProtectSystem=(strict|full|yes)/.test(show.output);
      const keyLeak = /(OPENAI_API_KEY|CODEX_API_KEY|ANTHROPIC_API_KEY)=[^\s]+/.test(show.output);
      checks.push(check({ id: `systemd.${s.unit}.hardening`, domain, title: `${s.unit} sandboxed (NoNewPrivileges, ProtectSystem) and no API keys in Environment`, status: nnp && !keyLeak ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, evidence: { command: show.command, no_new_privileges: nnp, protect_system: ps, api_key_in_environment: keyLeak }, remediation: 'reinstall the unit from its canonical installer', severity: keyLeak ? 'P0' : null }));
    }
  }
  // Unmanaged long-running processes (nohup/screen/tmux) are a finding, not a supervision path.
  const ps = run('sh', ['-c', "ps -eo pid,comm,args | grep -E 'tmux|screen|nohup' | grep -v grep | head -5"], { timeoutMs: 5000 });
  checks.push(check({ id: 'systemd.unmanaged-processes', domain, title: 'no tmux/screen/nohup-hosted DIAL processes', status: ps.output.trim() ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.REQUIRED, evidence: { command: ps.command, output: ps.output.slice(0, 300) || 'none' }, remediation: 'move any persistent process into a systemd user unit' }));
  return checks;
}
