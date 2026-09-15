import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { redact } from './log.mjs';

// Benign, read-only probes. None of these mutate host state.
// Each returns a plain object with `ok`, a bounded `output` excerpt and the exact `command` run,
// so a reader can re-derive the evidence.

export function run(cmd, args = [], { timeoutMs = 20000, env = process.env, cwd = undefined, input = undefined } = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs, env, cwd, input, maxBuffer: 4 * 1024 * 1024 });
  const output = redact(`${r.stdout || ''}${r.stderr || ''}`).trim().slice(0, 2000);
  return {
    command: [cmd, ...args].join(' '),
    ok: r.status === 0,
    status: r.status,
    signal: r.signal || null,
    error: r.error ? String(r.error.message || r.error) : null,
    output,
    duration_ms: Date.now() - started,
  };
}

export function which(binary) {
  const r = run('sh', ['-c', `command -v ${binary}`], { timeoutMs: 5000 });
  return r.ok ? r.output.split('\n')[0] : null;
}

export function parseSemver(text) {
  const m = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], text: `${m[1]}.${m[2]}.${m[3]}` } : null;
}

export function semverGte(a, b) {
  const x = typeof a === 'string' ? parseSemver(a) : a; const y = typeof b === 'string' ? parseSemver(b) : b;
  if (!x || !y) return false;
  if (x.major !== y.major) return x.major > y.major;
  if (x.minor !== y.minor) return x.minor > y.minor;
  return x.patch >= y.patch;
}

export function versionProbe(binary, args = ['--version'], { minimum = null, exact = null } = {}) {
  const location = which(binary);
  if (!location) return { installed: false, location: null, version: null, satisfies: false, command: `${binary} ${args.join(' ')}` };
  const r = run(binary, args, { timeoutMs: 15000 });
  const version = parseSemver(r.output);
  let satisfies = Boolean(version);
  if (exact) satisfies = Boolean(version) && version.text === exact;
  else if (minimum) satisfies = semverGte(version, minimum);
  return { installed: true, location, version: version?.text || null, raw: r.output.split('\n')[0], satisfies, command: r.command, ok: r.ok };
}

export function fileMode(file) {
  try { const st = fs.statSync(file); return { exists: true, mode: (st.mode & 0o777).toString(8).padStart(3, '0'), size: st.size, uid: st.uid, isDir: st.isDirectory() }; }
  catch { return { exists: false, mode: null, size: null, uid: null, isDir: false }; }
}

export function systemdAvailable() {
  const r = run('systemctl', ['--user', 'is-system-running'], { timeoutMs: 5000 });
  // "running" / "degraded" both mean the user manager answers; anything else is unavailable.
  return { available: r.ok || /running|degraded/.test(r.output), state: r.output.split('\n')[0] || null, command: r.command, error: r.error };
}

export function unitState(unit) {
  const active = run('systemctl', ['--user', 'is-active', unit], { timeoutMs: 5000 });
  const enabled = run('systemctl', ['--user', 'is-enabled', unit], { timeoutMs: 5000 });
  return { unit, active: active.output.split('\n')[0] || null, enabled: enabled.output.split('\n')[0] || null, command: active.command };
}

export function dockerProbe() {
  const bin = which('docker');
  if (!bin) return { installed: false };
  const r = run('docker', ['version', '--format', '{{.Server.Version}}'], { timeoutMs: 8000 });
  return { installed: true, daemon_reachable: r.ok, server_version: r.ok ? r.output : null, command: r.command };
}

export function tcpReach(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.createConnection({ host, port });
    const done = (ok, error = null) => { try { sock.destroy(); } catch {} resolve({ host, port, ok, error, duration_ms: Date.now() - started }); };
    sock.setTimeout(timeoutMs, () => done(false, 'timeout'));
    sock.once('connect', () => done(true));
    sock.once('error', (e) => done(false, e.code || e.message));
  });
}

export async function httpsReach(url, { timeoutMs = 8000, method = 'HEAD' } = {}) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method, redirect: 'manual', signal: controller.signal });
    clearTimeout(t);
    return { url, ok: res.status < 500, status: res.status, duration_ms: Date.now() - started };
  } catch (e) {
    return { url, ok: false, status: null, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message), duration_ms: Date.now() - started };
  }
}

export function git(repoDir, args, { timeoutMs = 20000 } = {}) {
  return run('git', args, { cwd: repoDir, timeoutMs });
}

export function hostFacts() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory_total_mb: Math.round(os.totalmem() / 1048576),
    memory_free_mb: Math.round(os.freemem() / 1048576),
    node: process.versions.node,
    user: os.userInfo().username,
    uid: os.userInfo().uid,
    load_average: os.loadavg().map((x) => Math.round(x * 100) / 100),
  };
}

export function diskFree(target) {
  const r = run('df', ['-Pk', target], { timeoutMs: 5000 });
  if (!r.ok) return { ok: false, command: r.command };
  const line = r.output.split('\n').pop().trim().split(/\s+/);
  return { ok: true, command: r.command, total_mb: Math.round(+line[1] / 1024), used_mb: Math.round(+line[2] / 1024), avail_mb: Math.round(+line[3] / 1024), use_pct: line[4] };
}

export function envPresent(names) {
  return Object.fromEntries(names.map((n) => [n, Boolean(process.env[n])]));
}

export function readJsonSafe(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function isRelativeInside(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export { execFileSync };
