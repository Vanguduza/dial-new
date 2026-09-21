import { spawn } from 'node:child_process';
import readline from 'node:readline';

function extractText(result) {
  return (result?.content || []).filter((item) => item?.type === 'text').map((item) => item.text || '').join('\n');
}

export async function withCommanderAutomation({
  commanderId,
  wrapper,
  repoDir,
  automationId,
  timeoutMs = 30000,
  run,
} = {}) {
  if (!commanderId || !wrapper || !repoDir || !automationId || typeof run !== 'function') {
    throw new Error('commanderId, wrapper, repoDir, automationId and run are required');
  }
  const gateway = `${repoDir}/agent-system/orchestration/hermes-commander-gateway.mjs`;
  const child = spawn(process.execPath, [gateway, '--commander-id', commanderId], {
    cwd: repoDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DIAL_LOCAL_COMMANDER_WRAPPER: wrapper,
      DIAL_COMMANDER_AUTHORITY_SOURCE: 'DESIGNED_AUTOMATION',
      DIAL_COMMANDER_AUTOMATION_ID: automationId,
      DIAL_COMMANDER_OWNER_ATTESTED: '',
      DIAL_COMMANDER_OWNER_APPROVAL: '',
    },
  });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let nextId = 1;
  const pending = new Map();
  let stderr = '';

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });
  child.on('error', (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  child.on('exit', (code, signal) => {
    if (pending.size) {
      const error = new Error(`Commander automation gateway exited code=${code} signal=${signal}: ${stderr.slice(-2000)}`);
      for (const waiter of pending.values()) waiter.reject(error);
      pending.clear();
    }
  });

  function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ jsonrpc: '2.0', id, method, params });
    });
  }
  rl.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id == null || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(Object.assign(new Error(message.error.message || 'Commander MCP error'), { rpc: message.error }));
    else waiter.resolve(message.result);
  });

  const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  try {
    await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dial-commander-automation-client', version: '1.0.0' },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    const listed = await request('tools/list', {});
    const schemas = new Map((listed?.tools || []).map((tool) => [tool.name, tool.inputSchema || {}]));
    const callTool = async (name, args = {}) => {
      if (!schemas.has(name)) throw new Error(`Commander tool unavailable: ${name}`);
      const result = await request('tools/call', { name, arguments: args });
      if (result?.isError) throw new Error(`Commander ${name} failed: ${extractText(result)}`);
      return { result, text: extractText(result), schema: schemas.get(name) };
    };
    return await run({ callTool, schemas });
  } finally {
    clearTimeout(timer);
    if (!child.killed) child.kill('SIGTERM');
    rl.close();
  }
}

export function commanderProcessPid(text) {
  const match = String(text || '').match(/Process started with PID\s+(-?\d+)/i)
    || String(text || '').match(/\bPID\s*[:=]\s*(-?\d+)/i);
  return match ? Number(match[1]) : null;
}
