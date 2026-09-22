import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CHATGPT_MCP_PATH,
  OPERATOR_CHANNELS,
  callChatControlTool,
  createChatControlServer,
} from '../agent-system/orchestration/chat-control-bridge.mjs';
import { ensureProjectRegistry } from '../agent-system/orchestration/project-registry.mjs';

function temp(name) {
  return mkdtempSync(path.join(tmpdir(), `${name}-`));
}

function makeRepo() {
  const repo = temp('dial-chatgpt-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), '[]\n');
  writeFileSync(path.join(repo, 'package.json'), '{}\n');
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo, stdio: 'ignore' });
  return repo;
}

function rootWithRepo() {
  const root = temp('dial-chatgpt-control');
  const repo = makeRepo();
  ensureProjectRegistry(root, { dialRepoDir: repo });
  return { root, repo };
}

describe('ChatGPT DIAL operator MCP', () => {
  it('is a first-class authenticated owner channel', async () => {
    expect(OPERATOR_CHANNELS).toContain('chatgpt');
    const { root } = rootWithRepo();
    const steer = await callChatControlTool(
      'dial_owner_steer',
      { instruction: 'Apply this owner direction after the current safe boundary.', request_id: 'chatgpt-owner-steer-0001' },
      root,
      { channel: 'chatgpt', actor: 'owner', transport: 'chatgpt_http_mcp' },
    );
    expect(steer.owner_instruction_provenance).toMatchObject({
      authority: 'OWNER_EXPLICIT',
      channel: 'chatgpt',
      request_id: 'chatgpt-owner-steer-0001',
    });
  });

  it('binds /mcp/chatgpt to chatgpt provenance without a custom channel header', async () => {
    const { root } = rootWithRepo();
    const server = createChatControlServer({ root, host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    try {
      const port = server.address().port;
      const token = readFileSync(path.join(root, 'secrets/chat-control.token'), 'utf8').trim();
      const response = await fetch(`http://127.0.0.1:${port}${CHATGPT_MCP_PATH}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'chatgpt-http-1',
          method: 'tools/call',
          params: {
            name: 'dial_owner_steer',
            arguments: {
              instruction: 'Make this the next owner-directed change.',
              request_id: 'chatgpt-http-steer-0001',
            },
          },
        }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.result.isError).toBe(false);
      expect(body.result.structuredContent.owner_instruction_provenance).toMatchObject({
        authority: 'OWNER_EXPLICIT',
        channel: 'chatgpt',
        transport: 'chatgpt_http_mcp',
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
