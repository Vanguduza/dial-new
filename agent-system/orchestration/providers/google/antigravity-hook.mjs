#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let event = {};
try { event = JSON.parse(raw || '{}'); } catch { event = {}; }

const mode = process.argv[2] || 'pretool';
const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';

function mappedTool(call = {}) {
  const name = String(call.name || '');
  const args = call.args || {};
  if (/^(run_command|shell|terminal)/i.test(name)) return { tool_name: 'Bash', tool_input: { command: args.CommandLine || args.command || args.cmd || '' } };
  if (/^(write_file|create_file)/i.test(name)) return { tool_name: 'Write', tool_input: { file_path: args.path || args.file_path || '' } };
  if (/^(edit|replace|patch)/i.test(name)) return { tool_name: 'Edit', tool_input: { file_path: args.path || args.file_path || '' } };
  return { tool_name: name, tool_input: args };
}

if (mode === 'pretool') {
  const guard = path.join(repoDir, 'agent-system/hooks/pre-tool-guard.mjs');
  const input = JSON.stringify(mappedTool(event.toolCall));
  const result = spawnSync(process.execPath, [guard], { input, encoding: 'utf8', env: process.env });
  if (result.error) {
    console.log(JSON.stringify({ decision: 'deny', reason: `DIAL Antigravity guard failed closed: ${result.error.message}` }));
    process.exit(0);
  }
  const text = String(result.stdout || '').trim();
  if (!text) {
    console.log(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }
  try {
    const parsed = JSON.parse(text);
    const out = parsed?.hookSpecificOutput || {};
    console.log(JSON.stringify({ decision: out.permissionDecision || 'deny', reason: out.permissionDecisionReason || 'DIAL guard decision' }));
  } catch {
    console.log(JSON.stringify({ decision: 'deny', reason: 'DIAL Antigravity guard returned invalid output' }));
  }
  process.exit(0);
}
function appendAudit(kind) {
  const dir = path.join(root, 'operations', 'external-capabilities', 'dev-antigravity');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const row = {
    schema_version: 1,
    kind,
    observed_at: new Date().toISOString(),
    conversation_id: event.conversationId || null,
    step_idx: Number.isInteger(event.stepIdx) ? event.stepIdx : null,
    tool_name: event.toolCall?.name || null,
    failed: Boolean(event.error),
    model_name: event.modelName || null,
    packet_id: process.env.DIAL_PACKET_ID || null,
    task_id: process.env.DIAL_TASK_ID || null,
    worker_id: process.env.DIAL_WORKER_ID || null,
  };
  fs.appendFileSync(path.join(dir, 'hook-events.jsonl'), `${JSON.stringify(row)}\n`, { mode: 0o600 });
}

if (mode === 'posttool') {
  appendAudit('ANTIGRAVITY_POST_TOOL');
  console.log('{}');
  process.exit(0);
}

if (mode === 'stop') {
  appendAudit('ANTIGRAVITY_STOP');
  console.log('{}');
  process.exit(0);
}

console.log('{}');
