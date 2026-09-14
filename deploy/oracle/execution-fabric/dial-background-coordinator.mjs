#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { evaluateHostRole, parseHostRoleText } from '../../../agent-system/orchestration/execution-fabric/host-role.mjs';
import { HOST_ROLES } from '../../../agent-system/orchestration/execution-fabric/constants.mjs';

const root = process.env.DIAL_WORKER_HOME || '/var/lib/dial-worker';
const roleFile = process.env.DIAL_HOST_ROLE_FILE || '/etc/dial/host-role';
const mcpUrlFile = process.env.DIAL_PRIVATE_MCP_URL_FILE || path.join(root, 'secrets/private-mcp-url');
const stateFile = path.join(root, 'state/background-coordinator.json');
const intervalMs = Number(process.env.DIAL_COORDINATOR_INTERVAL_MS || 30000);

function readRole() {
  return parseHostRoleText(fs.readFileSync(roleFile, 'utf8'));
}

function rejectIfHeavy() {
  const hostRole = readRole();
  const gate = evaluateHostRole({
    hostRole,
    unit: { work_class: 'PROJECT', control_plane_facts: { heavy_local: true } },
    requestedVenue: 'ORACLE_SANDBOX',
  });
  if (gate.ok) throw new Error('WORKER_GUARD_FAILED_TO_REJECT_HEAVY');
  return gate;
}

async function mcpCall(method, params = {}) {
  const target = fs.readFileSync(mcpUrlFile, 'utf8').trim();
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params });
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
  return { status: res.status, parsed };
}

async function observe() {
  const hostRole = readRole();
  if (hostRole.role !== HOST_ROLES.BACKGROUND_COORDINATOR) {
    throw new Error(`unexpected role ${hostRole.role}`);
  }
  const heavy = rejectIfHeavy();
  let queue = null;
  let mcp = { ok: false };
  try {
    const healthBase = process.env.DIAL_PRIVATE_MCP_HEALTH || '';
    if (healthBase) {
      const health = await fetch(healthBase, { method: 'GET' });
      queue = await (await fetch(new URL('/fabric/queue-status', healthBase), { method: 'GET' })).json();
      mcp.health_status = health.status;
    }
    const listed = await mcpCall('tools/list');
    const status = await mcpCall('tools/call', { name: 'dial_project_status', arguments: {} });
    mcp = {
      ok: listed.status === 200 && status.status === 200,
      tools_list_status: listed.status,
      project_status_status: status.status,
      tool_names: listed.parsed?.result?.tools?.map((tool) => tool.name) || [],
    };
    if (!queue && status.parsed?.result?.queue) queue = status.parsed.result.queue;
  } catch (error) {
    mcp = { ok: false, error: String(error?.message || error) };
  }
  const body = {
    service: 'dial-background-coordinator',
    role: hostRole.role,
    hostname: hostRole.hostname,
    fabric: 'PROVIDER_FIRST_EXECUTION_FABRIC',
    revision: '2.0',
    heavy_local_rejected: heavy.reason,
    mcp,
    queue,
    coordination: 'OBSERVE_AND_DISPATCH_OUTWARD',
    local_heavy_compute: false,
    at: new Date().toISOString(),
    pid: process.pid,
  };
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  const tmp = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, stateFile);
  return body;
}

await observe();
setInterval(() => {
  observe().catch((error) => {
    fs.writeFileSync(stateFile, `${JSON.stringify({
      service: 'dial-background-coordinator',
      state: 'ERROR',
      error: String(error?.message || error),
      at: new Date().toISOString(),
    }, null, 2)}\n`, { mode: 0o600 });
  });
}, intervalMs);
setInterval(() => {}, 1 << 30);
