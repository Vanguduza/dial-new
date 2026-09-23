#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const wrapper = process.env.DIAL_LOCAL_COMMANDER_WRAPPER || `${process.env.HOME}/.local/bin/dial-local-commander-mcp`;
const timeoutMs = Number(process.env.DIAL_COMMANDER_PROBE_TIMEOUT_MS || 20000);
const required = new Set([
  'start_process',
  'interact_with_process',
  'write_file',
  'edit_block',
  'move_file',
  'kill_process',
  'set_config_value',
  'read_file',
  'list_directory',
  'list_processes',
  'list_sessions',
  'get_config',
]);

const child = spawn(wrapper, [], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
let stderr = '';
let nextId = 1;
const pending = new Map();

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr += chunk;
  if (stderr.length > 8000) stderr = stderr.slice(-8000);
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}
function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: '2.0', id, method, params });
  });
}
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id == null || !pending.has(message.id)) return;
  const waiter = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message || 'Desktop Commander MCP error'));
  else waiter.resolve(message.result);
});
child.on('exit', (code, signal) => {
  const error = new Error(`Desktop Commander MCP exited early (code=${code}, signal=${signal})`);
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
});

const timer = setTimeout(() => {
  child.kill('SIGTERM');
}, timeoutMs);

try {
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'dial-hermes-full-commander-probe', version: '1.0.0' },
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const listed = await request('tools/list', {});
  const names = new Set((listed?.tools || []).map((tool) => tool.name));
  const missing = [...required].filter((name) => !names.has(name)).sort();
  const result = {
    status: missing.length ? 'RED' : 'GREEN',
    capability_surface: missing.length ? 'INCOMPLETE' : 'FULL',
    required_tools: [...required].sort(),
    missing_tools: missing,
    tool_count: names.size,
    tools: [...names].sort(),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (missing.length) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  if (stderr) process.stderr.write(`Commander stderr tail:\n${stderr}\n`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (!child.killed) child.kill('SIGTERM');
  lines.close();
}
