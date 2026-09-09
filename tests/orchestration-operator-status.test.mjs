import fs from 'node:fs';
import fs, { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  OPERATOR_STATUS_AUTHORITY,
  operatorStatusSemanticHash,
  readOracleOperatorStatus,
} from '../agent-system/orchestration/operator-status.mjs';
import {
  ORACLE_STATUS_PROMPT,
  formatOracleStatusContext,
} from '../agent-system/hooks/oracle-status-context.mjs';
import { createStatusCommit } from '../agent-system/orchestration/operator-status-publisher.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function snapshot(observedAt = new Date().toISOString()) {
  return {
    schema_version: 1,
    authority: OPERATOR_STATUS_AUTHORITY,
    project: 'dial',
    observed_at: observedAt,
    repository: { head: 'abc123', branch: 'master' },
    mission: { mission_id: 'dial-development-root', state: 'RUNNING', turn_number: 12, last_packet_id: 'p-12', last_packet_state: 'PROCESSING', packet_counts: { queued: 0, processing: 1, completed: 11, failed: 0 }, active_packets: [{ packet_id: 'p-12', state: 'PROCESSING' }], owner_blocker: null },
    orchestration: { queue_state: 'BUSY', active_job_id: 'p-12', queued: 0, heartbeat_observed_at: observedAt, execution_origin: 'EXTERNAL_ORACLE_ORCHESTRATOR' },
    development: { unblocked: true, state: 'DEVELOPMENT_RESUMABLE_THROUGH_EXTERNAL_HERMES', gate_status: 'PRODUCTION_GREEN', failed_checks: [] },
    runtime: { primary: { state: 'HEALTHY' }, fallback: { state: 'HEALTHY' } },
    research: { state: 'READY', resolved_model: 'gpt-5.6-sol' },
  };
}
describe('Oracle operator status mirror', () => {
  it('reads a fresh authoritative status snapshot without consulting local Claude state', () => {
    const dir = temp('dial-oracle-status');
    const file = path.join(dir, 'status.json');
    fs.writeFileSync(file, `${JSON.stringify(snapshot())}\n`);
    const result = readOracleOperatorStatus({ statusFile: file, nowMs: Date.now() });
    expect(result.available).toBe(true);
    expect(result.fresh).toBe(true);
    expect(result.status.mission.state).toBe('RUNNING');
    expect(result.status.orchestration.active_job_id).toBe('p-12');
  });

  it('marks a stale mirror stale rather than inventing an idle state', () => {
    const dir = temp('dial-oracle-status');
    const file = path.join(dir, 'status.json');
    fs.writeFileSync(file, `${JSON.stringify(snapshot('2026-09-08T08:00:00Z'))}\n`);
    const result = readOracleOperatorStatus({
      statusFile: file,
      nowMs: Date.parse('2026-09-08T10:00:00Z'),
      maxAgeMs: 60_000,
    });
    expect(result.available).toBe(true);
    expect(result.fresh).toBe(false);
    expect(result.status.mission.state).toBe('RUNNING');
  });

  it('parents sanitized status-only commits to canonical HEAD so Project Truth ancestry is preserved', () => {
    const repo = temp('dial-status-parent');
    const run = (args, input) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', input }).trim();
    run(['init', '-q']);
    run(['config', 'user.name', 'Test']);
    run(['config', 'user.email', 'test@example.invalid']);
    fs.writeFileSync(path.join(repo, 'baseline.txt'), 'canonical\n');
    run(['add', 'baseline.txt']);
    run(['commit', '-qm', 'canonical baseline']);
    const parent = run(['rev-parse', 'HEAD']);
    const blob = run(['hash-object', '-w', '--stdin'], '{"authority":"ORACLE_DIAL_RUNTIME_STATUS"}\n');
    const tree = run(['mktree'], `100644 blob ${blob}\toracle-runtime-status.json\n`);
    const observedAt = '2026-09-09T04:00:00Z';
    const commit = createStatusCommit(repo, { tree, parent, observedAt });
    expect(run(['rev-parse', `${commit}^`])).toBe(parent);
    expect(run(['ls-tree', '--name-only', commit])).toBe('oracle-runtime-status.json');
  });

  it('keeps semantic status stable when only publication timestamps advance', () => {
    const first = snapshot('2026-09-08T10:00:00Z');
    const second = snapshot('2026-09-08T10:05:00Z');
    expect(operatorStatusSemanticHash(first)).toBe(operatorStatusSemanticHash(second));
  });
  it('injects an explicit no-local-idle rule for Claude status prompts', () => {
    const result = {
      available: true,
      fresh: true,
      source: 'PRIVATE_GIT_STATUS_BRANCH',
      age_ms: 5000,
      status: snapshot(),
    };
    const context = formatOracleStatusContext(result);
    expect(context).toContain('Local Claude-session counts');
    expect(context).toContain('never evidence that autonomous DIAL development is idle');
    expect(context).toContain('state=RUNNING');
    expect(context).toContain('active_packets=p-12:PROCESSING');
  });

  it('recognises run-state and steering prompts but ignores unrelated coding prompts', () => {
    expect(ORACLE_STATUS_PROMPT.test('is anything running now')).toBe(true);
    expect(ORACLE_STATUS_PROMPT.test('what changed since last night?')).toBe(true);
    expect(ORACLE_STATUS_PROMPT.test('resume')).toBe(true);
    expect(ORACLE_STATUS_PROMPT.test('refactor this parser')).toBe(false);
  });
});
