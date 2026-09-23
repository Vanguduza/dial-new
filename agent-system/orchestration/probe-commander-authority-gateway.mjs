#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gateway = path.join(here, 'hermes-commander-gateway.mjs');
const commanderId = process.env.DIAL_COMMANDER_PROBE_COMMANDER_ID || 'dial_hermes_local_commander';
const wrapper = process.env.DIAL_LOCAL_COMMANDER_WRAPPER || `${process.env.HOME}/.local/bin/dial-local-commander-mcp`;

async function probe(authorityEnv) {
  const child = spawn(process.execPath, [gateway, '--commander-id', commanderId], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DIAL_LOCAL_COMMANDER_WRAPPER: wrapper, ...authorityEnv },
  });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 8000) stderr = stderr.slice(-8000); });

  function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
    });
  }
  rl.on('line', (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  });

  const timer = setTimeout(() => child.kill('SIGTERM'), 20000);
  try {
    const init = await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dial-commander-authority-probe', version: '1.0.0' },
    });
    if (init.error) throw new Error(init.error.message);
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const tools = await request('tools/list', {});
    if (tools.error) throw new Error(tools.error.message);
    const names = new Set((tools.result?.tools || []).map((tool) => tool.name));
    const call = await request('tools/call', { name: 'get_config', arguments: {} });
    return { names, call, stderr };
  } finally {
    clearTimeout(timer);
    child.kill('SIGTERM');
    rl.close();
  }
}

const required = ['start_process','interact_with_process','write_file','edit_block','kill_process','set_config_value','get_config'];

const denied = await probe({
  DIAL_COMMANDER_AUTHORITY_SOURCE: 'NONE',
  DIAL_COMMANDER_AUTOMATION_ID: '',
  DIAL_COMMANDER_OWNER_ATTESTED: '',
  DIAL_COMMANDER_OWNER_APPROVAL: '',
});
const missing = required.filter((name) => !denied.names.has(name));
if (missing.length) {
  console.error(`FULL_SURFACE_MISSING: ${missing.join(',')}`);
  process.exit(2);
}
if (denied.call?.error?.code !== -32003) {
  console.error('AUTHORITY_GATE_FAIL_OPEN: ungranted get_config was not refused');
  process.exit(3);
}

const automated = await probe({
  DIAL_COMMANDER_AUTHORITY_SOURCE: 'DESIGNED_AUTOMATION',
  DIAL_COMMANDER_AUTOMATION_ID: 'LOCAL_RUNTIME_RECOVERY',
  DIAL_COMMANDER_OWNER_ATTESTED: '',
  DIAL_COMMANDER_OWNER_APPROVAL: '',
});
if (automated.call?.error) {
  console.error(`REGISTERED_AUTOMATION_FAILED: ${automated.call.error.message}`);
  process.exit(4);
}

const owner = await probe({
  DIAL_COMMANDER_AUTHORITY_SOURCE: 'OWNER_EXPLICIT',
  DIAL_COMMANDER_AUTOMATION_ID: '',
  DIAL_COMMANDER_OWNER_ATTESTED: '1',
  DIAL_COMMANDER_OWNER_APPROVAL: '1',
});
if (owner.call?.error) {
  console.error(`OWNER_EXPLICIT_FAILED: ${owner.call.error.message}`);
  process.exit(5);
}

process.stdout.write(`${JSON.stringify({
  status: 'GREEN',
  commander_id: commanderId,
  capability_surface: 'FULL',
  ungranted_call: 'REFUSED',
  registered_automation_call: 'ALLOWED',
  owner_explicit_call: 'ALLOWED',
}, null, 2)}\n`);
