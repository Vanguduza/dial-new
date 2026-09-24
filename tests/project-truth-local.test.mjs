import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dial-truth-auth-'));
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/project-state/authorizations'), { recursive: true });
  copyFileSync('scripts/project_truth_local.py', path.join(dir, 'scripts/project_truth_local.py'));
  copyFileSync('docs/project-state/OWNER_AUTHORITY_POLICY.json', path.join(dir, 'docs/project-state/OWNER_AUTHORITY_POLICY.json'));
  git(dir, 'init'); git(dir, 'config', 'user.email', 'test@example.com'); git(dir, 'config', 'user.name', 'Test');
  writeFileSync(path.join(dir, 'README.md'), 'baseline\n'); git(dir, 'add', '.'); git(dir, 'commit', '-m', 'baseline');
  return dir;
}
function runRecord(dir) { return spawnSync('python3', ['scripts/project_truth_local.py', 'record'], { cwd: dir, encoding: 'utf8' }); }
function digest(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

describe('local Project Truth owner-authority guard', () => {
  it('blocks a substantive staged change with no owner authorization', () => {
    const dir = setup();
    writeFileSync(path.join(dir, 'PROJECT_TRUTH_PROTOCOL.md'), 'changed\n'); git(dir, 'add', 'PROJECT_TRUTH_PROTOCOL.md');
    const result = runRecord(dir);
    expect(result.status).toBe(43);
    expect(result.stderr).toMatch(/lack owner-derived Project Truth authority/);
  });

  it('records evidence only after a bounded owner authorization covers the staged change', () => {
    const dir = setup(); const base = git(dir, 'rev-parse', 'HEAD');
    const instruction = 'Implement the owner-authorized Project Truth governance change.';
    const auth = {
      schema_version: 1, authorization_id: 'auth-test-owner-0001', project: 'dial', authority: 'OWNER_EXPLICIT',
      owner_instruction_sha256: digest(instruction),
      source: { kind: 'owner_session_instruction', channel: 'chatgpt', request_id: 'test-owner-req', owner_attested: true },
      issued_at_utc: new Date().toISOString(), base_sha: base, branch_scope: 'master',
      authorized_paths: ['PROJECT_TRUTH_PROTOCOL.md'], change_classes: ['project_truth_governance'],
      material_scope_expansion: false, feature_removal: false, business_model_change: false,
      security_authority_change: false, owner_control_boundary_change: false, legal_position_change: false,
      money_or_custody_model_change: false, locked_provider_change: false, reusable: false, revoked: false,
    };
    writeFileSync(path.join(dir, 'docs/project-state/authorizations/auth-test-owner-0001.json'), `${JSON.stringify(auth, null, 2)}\n`);
    writeFileSync(path.join(dir, 'PROJECT_TRUTH_PROTOCOL.md'), 'authorized change\n');
    git(dir, 'add', 'PROJECT_TRUTH_PROTOCOL.md', 'docs/project-state/authorizations/auth-test-owner-0001.json');
    const result = runRecord(dir);
    expect(result.status).toBe(0);
    const ledger = readFileSync(path.join(dir, 'docs/project-state/CHANGE_LEDGER.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    expect(ledger.at(-1).owner_authorized).toBe(true);
    expect(ledger.at(-1).authorization_ids).toContain('auth-test-owner-0001');
    expect(git(dir, 'diff', '--cached', '--name-only')).toMatch(/CURRENT_STATE\.json/);
  });

  it('needs no ledger row for a commit that only adds owner authorization records', () => {
    // The owner commits records through GitHub, where no hook runs (594c5fc). Modifying a record, or adding
    // one alongside a substantive change, still requires the ledger row.
    const dir = setup();
    const addOnly = (name, extra) => {
      writeFileSync(path.join(dir, 'docs/project-state/authorizations', name), '{"authorization_id":"x"}\n');
      if (extra) writeFileSync(path.join(dir, extra), 'substantive\n');
      git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', name);
      return git(dir, 'rev-parse', 'HEAD');
    };
    const py = (s) => spawnSync('python3', ['-c', `import sys;sys.path.insert(0,'scripts');import project_truth_local as p;print(p.adds_only_authorizations('${s}'), p.verify_authorized_commit('${s}'))`], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    expect(py(addOnly('auth-owner-a.json'))).toBe('True []');
    writeFileSync(path.join(dir, 'docs/project-state/authorizations/auth-owner-a.json'), '{"authorization_id":"changed"}\n');
    git(dir, 'add', '.'); git(dir, 'commit', '-q', '-m', 'modify record');
    expect(py(git(dir, 'rev-parse', 'HEAD'))).toMatch(/^False \[.*no matching Project Truth ledger row/);
    expect(py(addOnly('auth-owner-b.json', 'PROJECT_TRUTH_PROTOCOL.md'))).toMatch(/^False \[.*no matching Project Truth ledger row/);
  });

  it('matches a ledger row in any clone, whatever abbreviation length git picks there', () => {
    // Netcup's clone printed 8-character blob ids where the recording clone printed 7, so the same
    // commit hashed differently and verify failed there (migration run 20260924T170601Z).
    const dir = setup(); const base = git(dir, 'rev-parse', 'HEAD');
    const auth = {
      schema_version: 1, authorization_id: 'auth-test-owner-0002', project: 'dial', authority: 'OWNER_EXPLICIT',
      owner_instruction_sha256: digest('abbreviation-independent ledger rows'),
      source: { kind: 'owner_session_instruction', channel: 'chatgpt', request_id: 'test-owner-req-2', owner_attested: true },
      issued_at_utc: new Date().toISOString(), base_sha: base, branch_scope: 'master',
      authorized_paths: ['PROJECT_TRUTH_PROTOCOL.md'], change_classes: ['project_truth_governance'],
      material_scope_expansion: false, feature_removal: false, business_model_change: false,
      security_authority_change: false, owner_control_boundary_change: false, legal_position_change: false,
      money_or_custody_model_change: false, locked_provider_change: false, reusable: false, revoked: false,
    };
    writeFileSync(path.join(dir, 'docs/project-state/authorizations/auth-test-owner-0002.json'), `${JSON.stringify(auth, null, 2)}\n`);
    writeFileSync(path.join(dir, 'PROJECT_TRUTH_PROTOCOL.md'), 'authorized change\n');
    git(dir, 'add', '.');
    expect(runRecord(dir).status).toBe(0);
    git(dir, 'commit', '-q', '-m', 'authorized change');
    const s = git(dir, 'rev-parse', 'HEAD');
    const row = JSON.parse(readFileSync(path.join(dir, 'docs/project-state/CHANGE_LEDGER.jsonl'), 'utf8').trim().split('\n').at(-1));
    expect(row.diff_format).toBe('full-index');
    const py = (code, abbrev) => spawnSync('python3', ['-c', `import sys,json;sys.path.insert(0,'scripts');import project_truth_local as p;${code}`], { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.abbrev', GIT_CONFIG_VALUE_0: String(abbrev) } }).stdout.trim();
    // The new-format row matches under every abbreviation length.
    for (const n of [7, 8, 12]) expect(py(`print(bool(p.matching_row('${s}')))`, n)).toBe('True');
    // A legacy row (no diff_format) hashed where git printed 7 characters still matches in a clone printing 8 ...
    const legacy = py(`print(p.cdig('${s}',()))`, 7);
    expect(py(`print(p.cdig('${s}',()))`, 8)).not.toBe(legacy);
    expect(py(`print(p.row_digest_matches({'diff_sha256':'${legacy}'},'${s}'))`, 8)).toBe('True');
    // ... and a digest that matches no abbreviation is still refused.
    expect(py(`print(p.row_digest_matches({'diff_sha256':'${'0'.repeat(64)}'},'${s}'))`, 8)).toBe('False');
    expect(py(`print(p.row_digest_matches({'diff_sha256':'${legacy}','diff_format':'full-index'},'${s}'))`, 8)).toBe('False');
  });
});
