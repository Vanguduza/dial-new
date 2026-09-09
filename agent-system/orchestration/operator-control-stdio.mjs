#!/usr/bin/env node
import readline from 'node:readline';
import { CHAT_CONTROL_TOOLS, OPERATOR_CHANNELS, callChatControlTool } from './chat-control-bridge.mjs';

const requestedChannel = String(process.env.DIAL_OPERATOR_CHANNEL || 'codex').trim().toLowerCase();
const channel = OPERATOR_CHANNELS.includes(requestedChannel) ? requestedChannel : 'unknown';
const actor = String(process.env.DIAL_OPERATOR_ACTOR || process.env.USER || 'owner').trim().slice(0, 120) || 'owner';
const transport = 'stdio_mcp';
const SERVER = { name: `dial-oracle-control-${channel}`, version: '1.1.0' };

function send(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function result(id, value) { return { jsonrpc: '2.0', id, result: value }; }
function error(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function clean(value, max = 3000) { return String(value ?? '').trim().slice(0, max); }

async function handle(message) {
  const id = message?.id;
  if (message?.method === 'initialize') {
    return result(id, {
      protocolVersion: message?.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER,
      instructions: `DIAL-only ${channel} operator surface. Use typed dial_* controls only. Oracle owns persistence, dispatch and execution; this MCP server exposes no shell or arbitrary filesystem access.`,
    });
  }
  if (message?.method === 'notifications/initialized') return null;
  if (message?.method === 'ping') return result(id, {});
  if (message?.method === 'tools/list') return result(id, { tools: CHAT_CONTROL_TOOLS });
  if (message?.method === 'tools/call') {
    const name = message?.params?.name;
    const args = message?.params?.arguments || {};
    try {
      const value = await callChatControlTool(name, args, undefined, { channel, actor, transport });
      return result(id, {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
        isError: false,
      });
    } catch (err) {
      return result(id, { content: [{ type: 'text', text: clean(err?.message || err) }], isError: true });
    }
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
    send(error(message?.id, -32603, clean(err?.message || err)));
  }
});
