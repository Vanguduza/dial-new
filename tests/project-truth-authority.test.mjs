import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  authorizationFromOwnerJob,
  classifyOwnerInstruction,
  ownerInstructionProvenance,
} from '../agent-system/orchestration/project-truth-authority.mjs';

describe('owner-originated Project Truth authority', () => {
  it('does not turn read-only owner requests into write authority', () => {
    expect(classifyOwnerInstruction('Audit the current DIAL repository and tell me what is wrong.')).toBe('NO_AUTHORITY');
    expect(classifyOwnerInstruction('Research the best database options and report back.')).toBe('NO_AUTHORITY');
  });

  it('recognises recommended blocker recovery as derived owner authority', () => {
    expect(classifyOwnerInstruction('Fix the remaining blockers using your best recommended solution.')).toBe('OWNER_DERIVED');
    expect(classifyOwnerInstruction('Resolve this issue using the appropriate workaround and update the implementation.')).toBe('OWNER_DERIVED');
  });

  it('recognises explicit autonomous continuation as delegated authority', () => {
    expect(classifyOwnerInstruction('Continue autonomously until project green; do not stop for ordinary blockers.')).toBe('OWNER_DELEGATED_AUTONOMY');
    expect(classifyOwnerInstruction('Resume until green and finish all remaining work.')).toBe('OWNER_DELEGATED_AUTONOMY');
  });
});

describe('bounded authorization receipts', () => {
  const base = '5c1156eecc0b88228ec133fbc1676fa47327cc58';
  it('builds an appendable receipt only from owner-originated Oracle work', () => {
    const instruction = 'Fix the remaining blocker using your recommended solution.';
    const provenance = ownerInstructionProvenance({ instruction, requestId: 'owner-req-0001', channel: 'whatsapp', actor: 'owner' });
    const job = { job_id: 'job-1', requested_by: 'whatsapp:owner', instruction, metadata: { request_id: 'owner-req-0001', owner_instruction_provenance: provenance } };
    const record = authorizationFromOwnerJob(job, { baseSha: base, branchScope: 'fix/blocker-*', authorizedPaths: ['agent-system/**', 'PROJECT_TRUTH_PROTOCOL.md'], changeClasses: ['blocker_recovery'] });
    expect(record.authority).toBe('OWNER_DERIVED');
    expect(record.material_scope_expansion).toBe(false);
    expect(record.authorized_paths).toContain('PROJECT_TRUTH_PROTOCOL.md');
    expect(record.source.kind).toBe('oracle_owner_instruction');
  });

  it('refuses an ordinary agent/manager job with no inherited owner root', () => {
    expect(() => authorizationFromOwnerJob(
      { job_id: 'job-agent', requested_by: 'mission_controller', instruction: 'Change Project Truth.', metadata: {} },
      { baseSha: base, branchScope: '*', authorizedPaths: ['**'] },
    )).toThrow(/owner authority root/);
  });

  it('allows manager continuation only when a valid derived/delegated owner root is inherited', () => {
    const root = ownerInstructionProvenance({ instruction: 'Continue autonomously until green.', requestId: 'owner-req-0002', channel: 'codex', actor: 'owner' });
    const job = { job_id: 'job-manager', requested_by: 'mission_controller', instruction: 'bounded manager packet', metadata: { owner_authority_root: root } };
    const record = authorizationFromOwnerJob(job, { baseSha: base, branchScope: 'work/*', authorizedPaths: ['**'] });
    expect(record.authority).toBe('OWNER_DELEGATED_AUTONOMY');
    expect(record.reusable).toBe(true);
  });
});


describe('protected-master Project Truth workflow', () => {
  it('is read-only after merge and verifies authority on the PR branch', () => {
    const workflow = readFileSync('.github/workflows/project-truth-autolog.yml', 'utf8');
    expect(workflow).toMatch(/contents: read/);
    expect(workflow).toMatch(/verify-pr/);
    expect(workflow).toMatch(/verify-merge/);
    expect(workflow).not.toMatch(/git push/);
    expect(workflow).not.toMatch(/git commit/);
  });
});
