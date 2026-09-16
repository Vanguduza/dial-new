import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { systemdAvailable, unitState, run } from '../lib/probes.mjs';
import { itemsForRole } from '../lib/manifest.mjs';

const HARDENING_PROPS = ['NoNewPrivileges', 'ProtectSystem', 'ProtectHome', 'PrivateTmp', 'ReadWritePaths', 'ReadOnlyPaths', 'UnsetEnvironment', 'Environment', 'EnvironmentFiles', 'ConditionResult', 'ActiveState'];
const SECRET_ENV = ['OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY'];

function prop(output, name) { const m = output.match(new RegExp(`^${name}=(.*)$`, 'm')); return m ? m[1].trim() : ''; }

// Pure evaluator so tests can induce every failure without systemd (GAP-011).
export function evaluateUnitHardening({ show, repoDir = null, repoRwExpected = false, unit = '' } = {}) {
  const nnp = /^yes$/i.test(prop(show, 'NoNewPrivileges'));
  const protectSystem = prop(show, 'ProtectSystem');
  const ps = /^(strict|full|yes|true)$/i.test(protectSystem);
  const protectHome = prop(show, 'ProtectHome');
  const ph = /^(read-only|yes|true|tmpfs)$/i.test(protectHome);
  const privateTmp = /^yes$/i.test(prop(show, 'PrivateTmp'));
  const unset = prop(show, 'UnsetEnvironment').split(/\s+/).filter(Boolean);
  const unsetOk = SECRET_ENV.every((n) => unset.includes(n));
  const env = prop(show, 'Environment');
  const keyLeak = new RegExp(`(?:^|\\s)(${SECRET_ENV.join('|')})=[^\\s]+`).test(env);
  const rw = prop(show, 'ReadWritePaths').split(/\s+/).filter(Boolean).map((p) => p.replace(/^[-+]/, ''));
  const repoRw = repoDir ? rw.some((p) => p === repoDir || p.startsWith(`${repoDir}/`) && !p.startsWith(`${repoDir}/.git`)) : false;
  const envFileEntries = parseEnvironmentFileEntries(prop(show, 'EnvironmentFiles'));
  const envFiles = envFileEntries.map((entry) => entry.file);
  const failures = [];
  if (!nnp) failures.push('NoNewPrivileges!=yes');
  if (!ps) failures.push(`ProtectSystem=${protectSystem || '(unset)'}`);
  if (!ph) failures.push(`ProtectHome=${protectHome || '(unset)'}`);
  if (!privateTmp) failures.push('PrivateTmp!=yes');
  if (!unsetOk) failures.push('UnsetEnvironment missing a provider API key name');
  if (keyLeak) failures.push('API key value in Environment');
  if (repoRw && !repoRwExpected) failures.push('ReadWritePaths grants the repository checkout to a unit that does not need to write it');
  return { unit, no_new_privileges: nnp, protect_system: protectSystem || null, protect_home: protectHome || null, private_tmp: privateTmp, unset_environment_ok: unsetOk, api_key_in_environment: keyLeak, repo_read_write: repoRw, repo_rw_expected: repoRwExpected, environment_files: envFiles, environment_file_entries: envFileEntries, failures, ok: failures.length === 0, severity: keyLeak ? 'P0' : (repoRw && !repoRwExpected ? 'P1' : null) };
}

export function parseEnvironmentFileEntries(value) {
  const text = String(value || '').trim();
  if (!text || text === '[]') return [];
  const matches = [...text.matchAll(/(?:^|\s)(-?(?:"[^"]+"|'[^']+'|\/[^\s;]+))(?:\s*\(ignore_errors=(yes|no)\))?/g)];
  return matches.map((m) => {
    const raw = m[1];
    return { file: raw.replace(/^-/, '').replace(/^['"]|['"]$/g, ''), optional: raw.startsWith('-') || m[2] === 'yes' };
  }).filter((entry) => Boolean(entry.file));
}

export function parseEnvironmentFiles(value) {
  return parseEnvironmentFileEntries(value).map((entry) => entry.file);
}

export function environmentFileModes(files) {
  const out = [];
  for (const item of files) {
    const entry = typeof item === 'string' ? { file: item, optional: false } : item;
    const f = entry.file;
    const st = run('stat', ['-c', '%a %U', f], { timeoutMs: 5000 });
    if (!st.ok) { out.push({ file: f, exists: false, mode: null, optional: entry.optional === true, ok: entry.optional === true }); continue; }
    const [mode, owner] = st.output.split(/\s+/);
    out.push({ file: f, exists: true, mode, owner, optional: entry.optional === true, ok: mode === '600' || mode === '400' });
  }
  return out;
}

export function certifySystemd({ role, manifest, repoDir = null }) {
  const domain = 'Systemd';
  const services = itemsForRole(manifest.services, role);
  if (!services.length) return [check({ id: 'systemd.placement', domain, title: `no supervised services declared for ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: {}, readiness_class: 'OPTIONAL_CAPABILITY' })];
  const sd = systemdAvailable();
  if (!sd.available) return [check({ id: 'systemd.available', domain, title: 'systemd user manager reachable', status: role === 'provider-container' ? STATUS.NOT_APPLICABLE : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, evidence: { command: sd.command, output: sd.state || sd.error }, remediation: 'loginctl enable-linger <service user>; ensure XDG_RUNTIME_DIR', readiness_class: 'CORE_DEVELOPMENT_REQUIRED' })];
  const checks = [];
  for (const s of services) {
    const st = unitState(s.unit);
    const healthy = st.active === 'active' && (st.enabled === 'enabled' || st.enabled === 'static' || st.enabled === 'linked');
    const conditionGated = st.active === 'inactive' && s.inactive_means === 'OWNER_ACTION_REQUIRED (ConditionPathExists on the device credential until the owner pairs)';
    checks.push(check({ id: `systemd.${s.unit}`, domain, title: `${s.unit} enabled + active`, status: healthy ? STATUS.PASS : conditionGated ? STATUS.OWNER_ACTION_REQUIRED : STATUS.FAIL, criticality: s.criticality, readiness_class: s.readiness_class, evidence: { command: st.command, active: st.active, enabled: st.enabled }, remediation: `bash ${s.installer}`, gate: conditionGated ? 'AUTH-GATE-DESKTOP-COMMANDER-001' : null }));
    if (healthy && !s.unit.endsWith('.timer')) {
      const show = run('systemctl', ['--user', 'show', s.unit, ...HARDENING_PROPS.flatMap((p) => ['-p', p])], { timeoutMs: 5000 });
      const h = evaluateUnitHardening({ show: show.output, repoDir, repoRwExpected: s.repo_rw_expected === true, unit: s.unit });
      checks.push(check({ id: `systemd.${s.unit}.hardening`, domain, title: `${s.unit} sandboxed (NoNewPrivileges, ProtectSystem, ProtectHome, UnsetEnvironment, no repo RW unless declared, no API keys in Environment)`, status: h.ok ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.REQUIRED, readiness_class: s.readiness_class, evidence: { command: show.command, ...h }, remediation: 'reinstall the unit from its canonical installer (hardened templates)', severity: h.severity }));
      if (h.environment_files.length) {
        const modes = environmentFileModes(h.environment_file_entries || h.environment_files);
        checks.push(check({ id: `systemd.${s.unit}.environment-file-modes`, domain, title: `${s.unit} required EnvironmentFile(s) exist with mode 600/400; optional missing files are allowed (values never read)`, status: modes.every((m) => m.ok) ? STATUS.PASS : STATUS.FAIL, criticality: CRITICALITY.MANDATORY, readiness_class: s.readiness_class, evidence: { files: modes }, remediation: 'chmod 600 the credential environment file; reinstall from the canonical installer', severity: modes.some((m) => m.exists && !m.ok) ? 'P1' : null }));
      }
    }
  }
  // Unmanaged long-running processes (nohup/screen/tmux) are a finding, not a supervision path.
  const ps = run('sh', ['-c', "ps -eo pid=,comm=,args= | awk '$2 == \"tmux\" || $2 == \"screen\" || $2 == \"nohup\" { print; if (++n >= 5) exit }'"], { timeoutMs: 5000 });
  checks.push(check({ id: 'systemd.unmanaged-processes', domain, title: 'no tmux/screen/nohup-hosted DIAL processes', status: ps.output.trim() ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.REQUIRED, readiness_class: 'CORE_DEVELOPMENT_REQUIRED', evidence: { command: ps.command, output: ps.output.slice(0, 300) || 'none' }, remediation: 'move any persistent process into a systemd user unit' }));
  return checks;
}
