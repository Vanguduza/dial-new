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
});
