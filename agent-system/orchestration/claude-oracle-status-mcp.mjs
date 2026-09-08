#!/usr/bin/env node
import readline from 'node:readline';
import { readOracleOperatorStatus } from './operator-status.mjs';

const SERVER = { name: 'dial-oracle-status', version: '1.0.0' };
const TOOL = {
  name: 'dial_oracle_status',
  description: 'Read the authoritative Oracle DIAL autonomous-development mission, queue, gate, and runtime status. Use this for questions about whether DIAL development is running; never infer run state from local Claude sessions or the local worktree.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
};

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function result(id, value) {
  return { jsonrpc: '2.0', id, result: value };
}

function error(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function status() {
  return readOracleOperatorStatus({ repoDir: process.env.CLAUDE_PROJECT_DIR || process.cwd() });
}
async function handle(message) {
  const id = message?.id;
  if (message?.method === 'initialize') {
    return result(id, {
      protocolVersion: message?.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions: 'Read-only DIAL Oracle status mirror. Oracle, not this local Claude process, owns autonomous-development state.',
    });
  }
  if (message?.method === 'notifications/initialized') return null;
  if (message?.method === 'ping') return result(id, {});
  if (message?.method === 'tools/list') return result(id, { tools: [TOOL] });
  if (message?.method === 'tools/call') {
    if (message?.params?.name !== TOOL.name) {
      return result(id, { content: [{ type: 'text', text: `unknown tool: ${message?.params?.name}` }], isError: true });
    }
    const value = status();
    return result(id, {
      content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      structuredContent: value,
      isError: false,
    });
  }
  return error(id, -32601, `method not found: ${message?.method}`);
}
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { return send(error(null, -32700, 'parse error')); }
  try {
    const response = await handle(message);
    if (response) send(response);
  } catch (err) {
    send(error(message?.id, -32603, String(err?.message || err).slice(0, 3000)));
  }
});
