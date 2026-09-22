import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { classifyShellEffect, isConsequentialToolUse } from '../agent-system/orchestration/shell-effect-classifier.mjs';

describe('FFDRM cross-harness material tool guard', () => {
  it('treats governed delegation as consequential while preserving its distinct effect', () => {
    const command='node agent-system/bin/adaptive-execution-delegate.mjs --project dial --packet PKT-1 --instruction "work"';
    expect(classifyShellEffect(command).effect).toBe('GOVERNED_DELEGATION');
    expect(isConsequentialToolUse('Bash',{command})).toBe(true);
  });

  it('reads Hermes pre_tool_call args and fails closed without packet authority', () => {
    const root=mkdtempSync(path.join(tmpdir(),'dial-guard-'));
    const guard=path.join(process.cwd(),'agent-system/hooks/pre-tool-guard.mjs');
    const result=spawnSync(process.execPath,[guard],{
      input:JSON.stringify({event:'pre_tool_call',tool_name:'terminal',args:{command:'printf x > guarded.txt'}}),
      encoding:'utf8',
      env:{...process.env,DIAL_GOVERNED_SESSION:'1',DIAL_CONTROL_HOME:root,DIAL_REPO_DIR:process.cwd()},
    });
    expect(result.status).toBe(0);
    const decision=JSON.parse(result.stdout.trim());
    expect(decision.action).toBe('block');
    expect(decision.reason).toMatch(/DIAL_PACKET_ID/);
  });

  it('installs and allowlists the Hermes pre_tool_call guard', () => {
    const installer=readFileSync(path.join(process.cwd(),'deploy/oracle/hermes-codex/install-control-plane.sh'),'utf8');
    expect(installer).toContain('dial-pre-tool-guard.sh');
    expect(installer).toContain("'pre_tool_call',tool");
    expect(installer).toContain("'pre_tool_call',tool)");
  });
});
