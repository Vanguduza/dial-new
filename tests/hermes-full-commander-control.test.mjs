import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  decideHermesCommanderUse,
  loadHermesCommanderRegistry,
} from '../agent-system/orchestration/hermes-commander-authority.mjs';
import {
  registerChatGptSession,
  checkpointChatGptSession,
  selectReusableChatGptSession,
  markStaleChatGptSessions,
  loadChatGptSessionRegistry,
} from '../agent-system/orchestration/chatgpt-session-registry.mjs';
import {
  runningUnderOwnerCommander,
  buildDesktopCommanderOwnerProvenance,
} from '../agent-system/orchestration/desktop-commander-owner-dispatch.mjs';

const repo = process.cwd();

describe('Hermes full Commander control architecture', () => {
  it('declares both working Commanders as full and excludes recovery hosts', () => {
    const registry = loadHermesCommanderRegistry(repo);
    expect(registry.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ commander_id: 'dial_hermes_local_commander', host: 'dial-hermes-control', capability_surface: 'FULL' }),
      expect.objectContaining({ commander_id: 'van_trading_local_commander', host: 'van-trading-core', capability_surface: 'FULL' }),
    ]));
    expect(registry.normal_control_exclusions).toContain('oracle-admin');
    expect(registry.normal_control_exclusions).toContain('vekl-worker');
  });

  it('allows the complete tool surface for an authenticated owner instruction', () => {
    const decision = decideHermesCommanderUse({
      source: 'OWNER_EXPLICIT',
      commanderId: 'dial_hermes_local_commander',
      toolName: 'shutdown',
      ownerAttested: true,
      ownerApproval: true,
      repoDir: repo,
    });
    expect(decision.decision).toBe('ALLOW');
  });

  it('fails closed without owner attestation', () => {
    const decision = decideHermesCommanderUse({
      source: 'OWNER_EXPLICIT',
      commanderId: 'dial_hermes_local_commander',
      toolName: 'start_process',
      ownerAttested: false,
      repoDir: repo,
    });
    expect(decision).toMatchObject({ decision: 'REFUSE', reason: 'OWNER_ATTESTATION_REQUIRED' });
  });

  it('limits unattended use to registered automation capabilities', () => {
    expect(decideHermesCommanderUse({
      source: 'DESIGNED_AUTOMATION',
      automationId: 'CHATGPT_SESSION_LIFECYCLE',
      commanderId: 'van_trading_local_commander',
      toolName: 'start_process',
      repoDir: repo,
    }).decision).toBe('ALLOW');

    expect(decideHermesCommanderUse({
      source: 'DESIGNED_AUTOMATION',
      automationId: 'CHATGPT_SESSION_LIFECYCLE',
      commanderId: 'van_trading_local_commander',
      toolName: 'set_config_value',
      repoDir: repo,
    })).toMatchObject({ decision: 'REFUSE', reason: 'AUTOMATION_TOOL_NOT_AUTHORIZED' });
  });

  it('requires approval for Commander configuration automation', () => {
    const waiting = decideHermesCommanderUse({
      source: 'DESIGNED_AUTOMATION',
      automationId: 'COMMANDER_CONFIGURATION_CHANGE',
      commanderId: 'dial_hermes_local_commander',
      toolName: 'set_config_value',
      repoDir: repo,
    });
    expect(waiting.decision).toBe('OWNER_APPROVAL_REQUIRED');
    const approved = decideHermesCommanderUse({
      source: 'DESIGNED_AUTOMATION',
      automationId: 'COMMANDER_CONFIGURATION_CHANGE',
      commanderId: 'dial_hermes_local_commander',
      toolName: 'set_config_value',
      ownerApproval: true,
      repoDir: repo,
    });
    expect(approved.decision).toBe('ALLOW');
  });

  it('does not expose oracle-admin as a normal Hermes Commander target', () => {
    expect(decideHermesCommanderUse({
      source: 'OWNER_EXPLICIT',
      commanderId: 'oracle_admin_commander',
      toolName: 'start_process',
      ownerAttested: true,
      repoDir: repo,
    }).decision).toBe('REFUSE');
  });

  it('persists, reuses, checkpoints and degrades ChatGPT sessions deterministically', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-chatgpt-sessions-'));
    try {
      const session = registerChatGptSession({
        root,
        sessionRef: 'session-1',
        commanderId: 'dial_hermes_local_commander',
        host: 'dial-hermes-control',
        project: 'dial',
        workspace: '/srv/dial/workspaces/demo',
        state: 'READY',
        metadata: { context_fingerprint: 'ctx-1' },
      });
      expect(session.state).toBe('READY');
      expect(selectReusableChatGptSession({
        root,
        project: 'dial',
        commanderId: 'dial_hermes_local_commander',
        workspace: '/srv/dial/workspaces/demo',
        contextFingerprint: 'ctx-1',
      })?.session_ref).toBe('session-1');

      checkpointChatGptSession('session-1', {
        summary: 'checkpoint',
        taskId: 'task-1',
        state: 'BUSY',
        repositoryHead: 'abc123',
      }, root);
      expect(loadChatGptSessionRegistry(root).sessions['session-1']).toMatchObject({
        task_id: 'task-1',
        state: 'BUSY',
        repository_head: 'abc123',
      });

      const degraded = markStaleChatGptSessions({
        root,
        nowMs: Date.now() + 11 * 60 * 1000,
        maxHeartbeatAgeMs: 10 * 60 * 1000,
      });
      expect(degraded).toContain('session-1');
      expect(loadChatGptSessionRegistry(root).sessions['session-1'].state).toBe('DEGRADED');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds the outer owner dispatch to the owner Commander service cgroup', () => {
    expect(runningUnderOwnerCommander({ cgroupText: '0::/user.slice/dial-owner-commander-remote.service' })).toBe(true);
    expect(runningUnderOwnerCommander({ cgroupText: '0::/user.slice/other.service' })).toBe(false);
    const p = buildDesktopCommanderOwnerProvenance({ instruction: 'Resume VAN', requestId: 'req-1' });
    expect(p).toMatchObject({ authority: 'OWNER_EXPLICIT', channel: 'desktop_commander', owner_attested: true });
    expect(p.instruction_sha256).toHaveLength(64);
  });

  it('configures Hermes through the authority gateway with no tool filter', () => {
    const installer = fs.readFileSync(path.join(repo, 'deploy/oracle/hermes-codex/install-hermes-local-mcp-plane.sh'), 'utf8');
    expect(installer).toContain('hermes-commander-gateway.mjs');
    expect(installer).toContain("'--commander-id', 'dial_hermes_local_commander'");
    expect(installer).not.toContain("'tools': {\n        'include'");
    const qualifier = fs.readFileSync(path.join(repo, 'deploy/oracle/hermes-codex/qualify-hermes-local-mcp-plane.sh'), 'utf8');
    expect(qualifier).toContain('Commander authority gateway');
    expect(qualifier).toContain('probe-full-local-commander.mjs');
  });

  it('keeps GitHub recovery bounded and out-of-band', () => {
    const workflow = fs.readFileSync(path.join(repo, '.github/workflows/oracle-recovery.yml'), 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: oracle-recovery');
    expect(workflow).toContain('instance-agent command create');
    expect(workflow).toContain('dial-github-recovery');
    expect(workflow).not.toMatch(/shell_command|free.?form/i);
    expect(workflow).not.toContain('runs-on: self-hosted');
    expect(workflow).toContain('oracle-actions/run-oci-cli-command@368cc7991534d1b8074846d10e1d84ac4c0d1a28');
  });
});
