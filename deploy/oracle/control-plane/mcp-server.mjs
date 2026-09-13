#!/usr/bin/env node
import os from 'node:os';
import readline from 'node:readline';
import { route } from './hybrid-router.mjs';
import { admit } from './guarded-command.mjs';
import { executeSemanticOperation, planSemanticOperation } from './ssh-semantic-executor.mjs';
import registry from './CONTROL_PLANE_REGISTRY.json' with { type: 'json' };

const tools = [
  { name: 'dial_route_workload', description: 'Select an eligible DIAL host and transport for a classified workload.', inputSchema: { type: 'object', required: ['workload_class'], properties: { workload_class: { type: 'string' }, target_host: { type: 'string' } } } },
  { name: 'dial_host_policy', description: 'Read immutable host role and workload permissions.', inputSchema: { type: 'object', required: ['host_id'], properties: { host_id: { type: 'string' } } } },
  { name: 'dial_admit_command', description: 'Classify and policy-check a command without executing it.', inputSchema: { type: 'object', required: ['command', 'source'], properties: { command: { type: 'string' }, source: { type: 'string' }, host_id: { type: 'string' }, workload_class: { type: 'string' } } } },
  { name: 'dial_plan_semantic_operation', description: 'Plan a bounded diagnostic/control operation and its target transport without execution.', inputSchema: { type: 'object', required: ['operation','target_host'], properties: { operation: { type: 'string' }, target_host: { type: 'string' }, args: { type: 'object' } } } },
  { name: 'dial_run_semantic_operation', description: 'Run one allowlisted semantic operation over local or direct SSH transport. No raw shell is exposed.', inputSchema: { type: 'object', required: ['operation','target_host'], properties: { operation: { type: 'string' }, target_host: { type: 'string' }, args: { type: 'object' } } } },
  { name: 'dial_control_status', description: 'Return local control-plane identity and policy version.', inputSchema: { type: 'object', properties: {} } }
];

function result(value) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], isError: value?.decision === 'REFUSE' || (value?.exit_code !== undefined && value.exit_code !== 0) }; }
function callTool(name, args = {}) {
  if (name === 'dial_route_workload') return result(route(args, { localHost: os.hostname() }));
  if (name === 'dial_host_policy') return result(registry.hosts?.[args.host_id] ?? { decision: 'REFUSE', reason: 'UNKNOWN_HOST' });
  if (name === 'dial_admit_command') return result(admit({ command: args.command, source: args.source, host: args.host_id || os.hostname(), declaredWorkload: args.workload_class || null }));
  if (name === 'dial_plan_semantic_operation') return result(planSemanticOperation(args));
  if (name === 'dial_run_semantic_operation') return result(executeSemanticOperation(args));
  if (name === 'dial_control_status') return result({ host: os.hostname(), policy_id: registry.policy_id, schema_version: registry.schema_version, fail_closed: registry.fail_closed });
  return result({ decision: 'REFUSE', reason: 'UNKNOWN_TOOL' });
}

function response(id, payload) { process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, ...payload })}\n`); }
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'initialize') return response(msg.id, { result: { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'dial-control-mcp', version: '1.0.0' } } });
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') return response(msg.id, { result: { tools } });
  if (msg.method === 'tools/call') return response(msg.id, { result: callTool(msg.params?.name, msg.params?.arguments || {}) });
  if (msg.id !== undefined) response(msg.id, { error: { code: -32601, message: 'Method not found' } });
});
