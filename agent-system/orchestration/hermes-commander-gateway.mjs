#!/usr/bin/env node
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { decideHermesCommanderUse, recordHermesCommanderDecision } from './hermes-commander-authority.mjs';

const args = process.argv.slice(2);
const commanderIdIndex = args.indexOf('--commander-id');
const commanderId = commanderIdIndex >= 0 ? args[commanderIdIndex + 1] : 'dial_hermes_local_commander';
const childCommand = process.env.DIAL_LOCAL_COMMANDER_WRAPPER || `${process.env.HOME}/.local/bin/dial-local-commander-mcp`;
const root = process.env.DIAL_CONTROL_HOME;
const source = process.env.DIAL_COMMANDER_AUTHORITY_SOURCE || 'NONE';
const automationId = process.env.DIAL_COMMANDER_AUTOMATION_ID || null;
const ownerAttested = process.env.DIAL_COMMANDER_OWNER_ATTESTED === '1';
const ownerApproval = process.env.DIAL_COMMANDER_OWNER_APPROVAL === '1';

const child = spawn(childCommand, [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env },
});
const childLines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const parentLines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let nextChildId = 100000;
const pending = new Map();

function sendParent(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function sendChild(value) { child.stdin.write(`${JSON.stringify(value)}\n`); }

function childRequest(method, params = {}) {
  const id = nextChildId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    sendChild({ jsonrpc: '2.0', id, method, params });
  });
}

childLines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.id != null && pending.has(message.id)) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(Object.assign(new Error(message.error.message || 'Commander MCP error'), { rpc: message.error }));
    else waiter.resolve(message.result);
    return;
  }
  if (message.method) sendParent(message);
});

child.stderr.pipe(process.stderr);

async function handle(message) {
  const id = message.id;
  const method = message.method;
  try {
    if (method === 'initialize') {
      const result = await childRequest('initialize', message.params || {});
      return sendParent({ jsonrpc: '2.0', id, result: { ...result, serverInfo: { ...(result?.serverInfo || {}), name: 'dial-hermes-full-commander-gateway' } } });
    }

    if (method === 'notifications/initialized') {
      sendChild(message);
      return;
    }

    if (method === 'tools/list') {
      const result = await childRequest('tools/list', message.params || {});
      return sendParent({ jsonrpc: '2.0', id, result });
    }

    if (method === 'tools/call') {
      const toolName = String(message.params?.name || '').trim();
      const decision = decideHermesCommanderUse({
        source,
        commanderId,
        toolName,
        automationId,
        ownerAttested,
        ownerApproval,
      });
      recordHermesCommanderDecision(decision, root);
      if (decision.decision !== 'ALLOW') {
        return sendParent({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32003,
            message: `Hermes Commander authority refused: ${decision.reason}`,
            data: decision,
          },
        });
      }
      const result = await childRequest('tools/call', message.params || {});
      return sendParent({ jsonrpc: '2.0', id, result });
    }

    if (method === 'resources/list' || method === 'prompts/list') {
      const result = await childRequest(method, message.params || {});
      return sendParent({ jsonrpc: '2.0', id, result });
    }

    if (id != null) {
      const result = await childRequest(method, message.params || {});
      return sendParent({ jsonrpc: '2.0', id, result });
    }
    sendChild(message);
  } catch (error) {
    if (id != null) {
      sendParent({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: String(error?.message || error) },
      });
    }
  }
}

parentLines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  void handle(message);
});

function stop(signal = 'SIGTERM') {
  try { child.kill(signal); } catch {}
  parentLines.close();
  childLines.close();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
child.on('exit', (code, signal) => {
  for (const waiter of pending.values()) waiter.reject(new Error(`Commander child exited code=${code} signal=${signal}`));
  pending.clear();
  if (code && code !== 0) process.exitCode = code;
});
