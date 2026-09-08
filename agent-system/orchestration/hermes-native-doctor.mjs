import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeJsonAtomic } from './state-store.mjs';

export const HERMES_NATIVE_DOCTOR_EVIDENCE = 'evidence-cache/diagnostics/hermes-native-doctor.json';
export const DEFAULT_HERMES_DOCTOR_TIMEOUT_MS = 90_000;

const ANSI_ESCAPE = new RegExp(String.raw`\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))`, 'gu');
const SECRET_VALUE = /\b(api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*([^\s]+)/giu;

function normalizedReport(text) {
  return String(text || '')
    .replace(ANSI_ESCAPE, '')
    .replace(/\r/g, '')
    .replace(SECRET_VALUE, '$1=<redacted>')
    .trim();
}

function countLines(text, marker) {
  return text.split('\n').filter((line) => marker.test(line)).length;
}

function extractIssues(text, limit = 12) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /Found\s+\d+\s+issue\(s\)\s+to address/i.test(line));
  if (start < 0) return [];
  const issues = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s*\d+\.\s+(.+)$/u);
    if (match) issues.push(match[1].trim().slice(0, 500));
    else if (issues.length && line.trim() && !/^\s+/u.test(line)) break;
    if (issues.length >= limit) break;
  }
  return issues;
}

export function summarizeHermesDoctorOutput(
  text,
  { exitCode = 0, timedOut = false, unavailable = false, durationMs = 0 } = {},
) {
  const report = normalizedReport(text);
  const issueMatch = report.match(/Found\s+(\d+)\s+issue\(s\)\s+to address/i);
  const issueCount = issueMatch ? Number(issueMatch[1]) : 0;
  const passCount = countLines(report, /^\s*✓/u);
  const warningCount = countLines(report, /^\s*⚠/u);
  const failureCount = countLines(report, /^\s*(?:✗|✘|❌)/u);
  const versionMatch = report.match(/Version files consistent \(([^)]+)\)/i);
  const securityAdvisoryState = /No active security advisories/i.test(report)
    ? 'CLEAR'
    : /Security Advisories/i.test(report)
      ? 'ACTIVE_OR_UNKNOWN'
      : 'NOT_OBSERVED';

  let status = 'PASS';
  if (unavailable) status = 'UNAVAILABLE';
  else if (timedOut) status = 'TIMEOUT';
  else if (exitCode !== 0 || failureCount > 0) status = 'FAIL';
  else if (issueCount > 0) status = 'DEGRADED';

  return {
    schema_version: 1,
    kind: 'DIAL_SUBORDINATE_HERMES_DOCTOR',
    authority: 'DIAGNOSTIC_EVIDENCE_ONLY',
    command: ['hermes', 'doctor'],
    mutating_mode_requested: false,
    live_probe_requested: false,
    status,
    usable_for_dial_qualification: status === 'PASS' || status === 'DEGRADED',
    exit_code: Number.isInteger(exitCode) ? exitCode : null,
    timed_out: timedOut,
    unavailable,
    duration_ms: Math.max(0, Math.round(Number(durationMs) || 0)),
    issue_count: issueCount,
    pass_count: passCount,
    warning_count: warningCount,
    failure_count: failureCount,
    security_advisory_state: securityAdvisoryState,
    hermes_version: versionMatch?.[1]?.trim() || null,
    issues: extractIssues(report),
    report_sha256: createHash('sha256').update(report).digest('hex'),
    report_bytes: Buffer.byteLength(report, 'utf8'),
    raw_report_persisted: false,
    observed_at: new Date().toISOString(),
  };
}

export function runNativeHermesDoctor({
  command = 'hermes',
  timeoutMs = Number(process.env.DIAL_HERMES_DOCTOR_TIMEOUT_MS || DEFAULT_HERMES_DOCTOR_TIMEOUT_MS),
  runner = spawnSync,
} = {}) {
  const requestedTimeout = Number(timeoutMs);
  const boundedTimeout = Number.isFinite(requestedTimeout)
    ? Math.min(300_000, Math.max(5_000, requestedTimeout))
    : DEFAULT_HERMES_DOCTOR_TIMEOUT_MS;
  const startedAt = Date.now();
  let result;
  try {
    result = runner(command, ['doctor'], {
      encoding: 'utf8',
      timeout: boundedTimeout,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const code = error?.code ?? null;
    return summarizeHermesDoctorOutput(String(error?.message || error), {
      exitCode: null,
      timedOut: code === 'ETIMEDOUT',
      unavailable: code === 'ENOENT',
      durationMs: Date.now() - startedAt,
    });
  }

  const errorCode = result?.error?.code ?? null;
  const combined = [result?.stdout, result?.stderr].filter(Boolean).join('\n');
  return summarizeHermesDoctorOutput(combined || String(result?.error?.message || ''), {
    exitCode: result?.status,
    timedOut: errorCode === 'ETIMEDOUT',
    unavailable: errorCode === 'ENOENT',
    durationMs: Date.now() - startedAt,
  });
}

export function persistNativeHermesDoctorEvidence(report, { root } = {}) {
  const persisted = { ...report, evidence_relative_path: HERMES_NATIVE_DOCTOR_EVIDENCE };
  writeJsonAtomic(HERMES_NATIVE_DOCTOR_EVIDENCE, persisted, root);
  return persisted;
}
