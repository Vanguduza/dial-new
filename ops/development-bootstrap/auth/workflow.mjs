import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run, fileMode } from '../lib/probes.mjs';
import { redact } from '../lib/log.mjs';
import { itemsForRole } from '../lib/manifest.mjs';

// Owner-gated authentication workflow (closure item 2).
//   detect  -> run the credential's benign probe; PASS certifies non-interactive/existing auth automatically
//   initiate-> when a human login is necessary, display a SAFE instruction (never a secret, never a URL with a
//              token) and persist a resume token bound to the credential id
//   resume  -> re-run the probe for the credential named by the resume token
//   probe   -> benign functional probe (the manifest `probe`) with redacted, bounded output
//   evidence-> <control-home>/bootstrap/auth-evidence/<cred>.json: command, exit, redacted excerpt, decision
// Nothing here reads a secret value. File-backed credentials are checked for existence and mode only.

export const AUTH_STATES = Object.freeze({ CERTIFIED: 'CERTIFIED', HUMAN_LOGIN_REQUIRED: 'HUMAN_LOGIN_REQUIRED', FAILED: 'FAILED', NOT_APPLICABLE: 'NOT_APPLICABLE', PROBE_UNAVAILABLE: 'PROBE_UNAVAILABLE' });

const PROBES = {
  'codex login status': { cmd: 'codex', args: ['login', 'status'], expect: /Logged in using ChatGPT/ },
  'claude auth status': { cmd: 'claude', args: ['auth', 'status'], expect: null },
  'hermes auth list': { cmd: 'hermes', args: ['auth', 'list'], expect: /openai-codex/ },
  'git ls-remote origin HEAD': { cmd: 'git', args: ['ls-remote', '--heads', 'origin', 'master'], expect: null, cwd: 'repo' },
  'whatsapp-hermes-operator status': { cmd: 'node', args: ['agent-system/orchestration/whatsapp-hermes-operator.mjs', 'status'], expect: null, cwd: 'repo' },
  'whatsapp-operator-adapter status': { cmd: 'node', args: ['agent-system/orchestration/whatsapp-operator-adapter.mjs', 'status'], expect: null, cwd: 'repo' },
  'dial-commander-probe': { cmd: '/usr/local/bin/dial-commander-probe', args: [], expect: /SESSION_VALID/ },
  'install-bounded-recovery-identity.sh --verify; verify-two-way-recovery.sh': { cmd: 'bash', args: ['deploy/oracle/resource-fabric/install-bounded-recovery-identity.sh', '--verify'], expect: null, cwd: 'repo' },
};

function expandHome(p) { return String(p || '').replace(/^~(?=\/|$)/, process.env.HOME || ''); }

function fileBackedStatus(cred, controlHome) {
  const locations = String(cred.location || '').split(';').map((s) => s.trim()).filter((s) => s.startsWith('/') || s.startsWith('~'));
  const results = locations.map((loc) => {
    const file = expandHome(loc.split(' ')[0]).replace('/var/lib/dial-control', controlHome || '/var/lib/dial-control');
    const m = fileMode(file);
    return { file, exists: m.exists, mode: m.mode, mode_ok: !cred.required_mode || m.mode === cred.required_mode, value: 'never read' };
  });
  return { checked: results, ok: results.length > 0 && results.every((r) => r.exists && r.mode_ok) };
}

export function runProbe(cred, { repoDir, timeoutMs = 20000 } = {}) {
  const spec = PROBES[cred.probe];
  if (!spec) return { available: false, command: cred.probe || null, ok: false, output: null, reason: 'no benign probe registered for this credential' };
  const r = run(spec.cmd, spec.args, { timeoutMs, cwd: spec.cwd === 'repo' ? repoDir : undefined });
  if (r.error && /ENOENT/.test(r.error)) return { available: false, command: r.command, ok: false, output: 'binary missing', reason: 'probe binary absent' };
  const ok = r.ok && (!spec.expect || spec.expect.test(r.output));
  return { available: true, command: r.command, ok, exit: r.status, output: redact(r.output).slice(0, 300) };
}

function safeInstruction(cred) {
  // Instructions are static owner actions from the manifest; they never embed a token, a code or a URL with
  // credentials. Anything that looks like a secret is redacted defensively.
  return redact(String(cred.owner_action || `authenticate ${cred.id} on the host and re-run bootstrap --auth --resume <token>`));
}

export function evaluateCredential(cred, { repoDir, controlHome } = {}) {
  const started = new Date().toISOString();
  const fileState = cred.location && /^(\/|~)/.test(String(cred.location).trim()) ? fileBackedStatus(cred, controlHome) : null;
  const probe = runProbe(cred, { repoDir });
  let state;
  let reason;
  if (probe.available && probe.ok && (!fileState || fileState.ok)) { state = AUTH_STATES.CERTIFIED; reason = 'benign probe passed' + (fileState ? ' and credential files exist with the required mode' : ''); }
  else if (fileState && !fileState.ok && !cred.interactive) { state = AUTH_STATES.FAILED; reason = 'credential file missing or wrong mode (non-interactive credential; installer must regenerate it)'; }
  else if (!probe.available && fileState) { state = fileState.ok ? AUTH_STATES.PROBE_UNAVAILABLE : (cred.interactive ? AUTH_STATES.HUMAN_LOGIN_REQUIRED : AUTH_STATES.FAILED); reason = probe.reason; }
  else if (cred.interactive) { state = AUTH_STATES.HUMAN_LOGIN_REQUIRED; reason = 'probe did not certify an authenticated session; human login is necessary'; }
  else { state = AUTH_STATES.FAILED; reason = 'probe failed for a non-interactive credential'; }
  return {
    credential_id: cred.id, auth_type: cred.auth_type, readiness_class: cred.readiness_class, interactive: cred.interactive === true,
    state, reason, started_at: started, finished_at: new Date().toISOString(),
    probe: { command: probe.command, available: probe.available, ok: probe.ok, exit: probe.exit ?? null, output_excerpt: probe.output ?? null },
    files: fileState?.checked || [],
    instruction: state === AUTH_STATES.HUMAN_LOGIN_REQUIRED ? safeInstruction(cred) : null,
    secrets_policy: 'no secret values read or printed; file existence and mode only',
  };
}

export function evidenceDir(controlHome) { return path.join(controlHome, 'bootstrap', 'auth-evidence'); }

export function writeEvidence({ controlHome, record }) {
  const dir = evidenceDir(controlHome);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${record.credential_id}.json`);
  const body = { ...record, evidence_sha256: null };
  body.evidence_sha256 = crypto.createHash('sha256').update(JSON.stringify({ ...body, evidence_sha256: undefined })).digest('hex');
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  return file;
}

export function issueResumeToken({ controlHome, credentialIds }) {
  const token = `auth-${crypto.randomBytes(6).toString('hex')}`;
  const dir = evidenceDir(controlHome);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, `${token}.resume.json`), `${JSON.stringify({ token, credential_ids: credentialIds, issued_at: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  return token;
}

export function readResumeToken({ controlHome, token }) {
  if (!/^auth-[a-f0-9]{12}$/.test(String(token || ''))) throw new Error('invalid resume token');
  const file = path.join(evidenceDir(controlHome), `${token}.resume.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Run the workflow for every credential placed on the role. Returns the per-credential records, the list of
// credentials that need a human, and (when any do) a resume token. Never blocks waiting for a human.
export function runAuthWorkflow({ manifest, role, repoDir, controlHome, resumeToken = null, profileClasses = null } = {}) {
  let creds = itemsForRole(manifest.credentials, role);
  if (profileClasses) creds = creds.filter((c) => profileClasses.includes(c.readiness_class));
  if (resumeToken) { const r = readResumeToken({ controlHome, token: resumeToken }); creds = creds.filter((c) => r.credential_ids.includes(c.id)); }
  const records = creds.map((c) => evaluateCredential(c, { repoDir, controlHome }));
  for (const r of records) writeEvidence({ controlHome, record: r });
  const human = records.filter((r) => r.state === AUTH_STATES.HUMAN_LOGIN_REQUIRED);
  const token = human.length ? issueResumeToken({ controlHome, credentialIds: human.map((r) => r.credential_id) }) : null;
  return {
    role, evaluated: records.length,
    certified: records.filter((r) => r.state === AUTH_STATES.CERTIFIED).map((r) => r.credential_id),
    human_login_required: human.map((r) => ({ credential_id: r.credential_id, instruction: r.instruction })),
    failed: records.filter((r) => r.state === AUTH_STATES.FAILED).map((r) => r.credential_id),
    probe_unavailable: records.filter((r) => r.state === AUTH_STATES.PROBE_UNAVAILABLE).map((r) => r.credential_id),
    resume_token: token,
    resume_command: token ? `bootstrap.sh --auth --resume ${token} --role ${role}` : null,
    evidence_dir: evidenceDir(controlHome),
    records,
  };
}
