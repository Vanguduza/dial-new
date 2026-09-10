import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { callChatControlTool, CHAT_CONTROL_TOOLS, ensureChatControlToken } from '../agent-system/orchestration/chat-control-bridge.mjs';
import { processNextExternalWork } from '../agent-system/orchestration/external-orchestrator.mjs';
import { ensureProjectRegistry } from '../agent-system/orchestration/project-registry.mjs';
import { ensureDialMission, missionExecutionAllowed, missionStatus, pauseDialMission, resumeDialMission } from '../agent-system/orchestration/mission-control.mjs';
import { missionControllerTick } from '../agent-system/orchestration/mission-controller.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function makeRepo() {
  const repo = temp('dial-chat-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), '[]\n');
  writeFileSync(path.join(repo, 'package.json'), '{}\n');
  execFileSync('git', ['init'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo });
  return repo;
}
function executorSuccess({ instruction }) {
  return Promise.resolve({
    event: 'HERMES_OPERATIONAL_TURN_COMPLETED', policy: 'LOCKED_SOL_THEN_SONNET',
    runtime: 'codex_app_server', requested_model: 'gpt-5.6-sol', resolved_model: 'gpt-5.6-sol',
    fallback_used: false, response: instruction,
  });
}

describe('DIAL Claude chat control surface', () => {
  it('exposes only typed DIAL tools and no shell primitive', () => {
    const names = CHAT_CONTROL_TOOLS.map((tool) => tool.name);
    expect(names).toContain('dial_mission_status');
    expect(names).toContain('dial_resume_mission');
    expect(names).toContain('dial_progress_since');
    expect(names).toContain('dial_runtime_capacity_status');
    expect(names.some((name) => /shell|exec|filesystem/i.test(name))).toBe(false);
  });

  it('creates a persistent token without exposing token material', () => {
    const root = temp('dial-chat-control');
    const token = ensureChatControlToken(root);
    expect(token.created).toBe(true);
    expect(token.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(token).not.toHaveProperty('token');
    const again = ensureChatControlToken(root);
    expect(again.created).toBe(false);
    expect(again.fingerprint).toBe(token.fingerprint);
  });

  it('keeps a paused mission from being claimed, then executes after resume', async () => {
    const repo = makeRepo(), root = temp('dial-chat-control');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    ensureDialMission({ root, repoDir: repo });
    const queued = await callChatControlTool('dial_submit_instruction', { instruction: 'Inspect the next safe DIAL packet.', request_id: 'req-submit-0001' }, root);
    expect(missionExecutionAllowed(queued, root)).toBe(false);
    const paused = await processNextExternalWork({ repoDir: repo, root, executor: executorSuccess, developmentGate: () => ({ unblocked: true }) });
    expect(paused).toBe(null);
    resumeDialMission({ root });
    const processed = await processNextExternalWork({ repoDir: repo, root, executor: executorSuccess, developmentGate: () => ({ unblocked: true }) });
    expect(processed.state).toBe('COMPLETED');
  });

  it('persists owner instruction provenance without converting read-only work into authority', async () => {
    const repo = makeRepo(), root = temp('dial-chat-control');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    ensureDialMission({ root, repoDir: repo });
    const readOnly = await callChatControlTool('dial_submit_instruction', { instruction: 'Audit the current state and report back.', request_id: 'req-authority-read-0001' }, root, { channel: 'codex', actor: 'owner', transport: 'test' });
    expect(readOnly.metadata.owner_instruction_provenance.authority).toBe('NO_AUTHORITY');
    expect(missionStatus(root).owner_authority_roots).toHaveLength(0);
    const derived = await callChatControlTool('dial_submit_instruction', { instruction: 'Fix the remaining blockers using your recommended solution.', request_id: 'req-authority-fix-0001' }, root, { channel: 'codex', actor: 'owner', transport: 'test' });
    expect(derived.metadata.owner_instruction_provenance.authority).toBe('OWNER_DERIVED');
    expect(missionStatus(root).owner_authority_roots.at(-1).authority).toBe('OWNER_DERIVED');
  });

  it('mission controller dispatches a fresh manager packet only when the mission is running and idle', () => {
    const repo = makeRepo(), root = temp('dial-chat-control');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    ensureDialMission({ root, repoDir: repo });
    expect(missionControllerTick({ root }).action).toBe('NOOP');
    resumeDialMission({ root });
    const greenGate = () => ({ unblocked: true, checks: {} });
    const dispatched = missionControllerTick({ root, developmentGate: greenGate });
    expect(dispatched.action).toBe('ENQUEUED');
    expect(missionControllerTick({ root, developmentGate: greenGate }).action).toBe('NOOP');
    expect(missionStatus(root).packet_counts.queued).toBe(1);
  });

  it('supports owner priority, approval and cursor-based progress without replay loss', async () => {
    const repo = makeRepo(), root = temp('dial-chat-control');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    ensureDialMission({ root, repoDir: repo });
    await callChatControlTool('dial_reprioritize', { directive: 'Close canonical GMPC verification first.', request_id: 'req-priority-0001' }, root);
    await callChatControlTool('dial_approve_gate', { gate_id: 'GMPC-CANON-CLOSURE', rationale: 'Owner approved canonical closure.', request_id: 'req-approve-0001' }, root);
    const first = await callChatControlTool('dial_progress_since', { limit: 1 }, root);
    expect(first.events).toHaveLength(1);
    expect(first.next_cursor).toBeTruthy();
    const second = await callChatControlTool('dial_progress_since', { cursor: first.next_cursor, limit: 100 }, root);
    expect(second.events.length).toBeGreaterThan(0);
    const seen = [...first.events, ...second.events].map((event) => event.event);
    expect(seen).toContain('MISSION_PRIORITY_UPDATED');
    expect(seen).toContain('GATE_APPROVED');
  });


  it('deduplicates retried write controls by request_id', async () => {
    const repo = makeRepo(), root = temp('dial-chat-control');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    ensureDialMission({ root, repoDir: repo });
    const args = { instruction: 'Inspect one safe DIAL packet.', request_id: 'req-dedupe-0001' };
    const first = await callChatControlTool('dial_submit_instruction', args, root);
    const second = await callChatControlTool('dial_submit_instruction', args, root);
    expect(second.job_id).toBe(first.job_id);
    const listed = await callChatControlTool('dial_list_packets', { limit: 50 }, root);
    expect(listed.packets.filter((p) => p.packet_id === first.job_id)).toHaveLength(1);
  });

  it('pause and resume are durable operator controls rather than chat-local state', async () => {
    const repo = makeRepo(), root = temp('dial-chat-control');
    ensureProjectRegistry(root, { dialRepoDir: repo });
    ensureDialMission({ root, repoDir: repo });
    await callChatControlTool('dial_resume_mission', { reason: 'owner says resume', request_id: 'req-resume-0001' }, root);
    expect(missionStatus(root).state).toBe('RUNNING');
    await callChatControlTool('dial_pause_mission', { reason: 'owner requests pause', request_id: 'req-pause-0001' }, root);
    expect(missionStatus(root).state).toBe('PAUSED');
  });
});
