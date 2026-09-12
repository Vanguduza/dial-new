#!/usr/bin/env node
// Standalone deterministic scheduler for the Oracle resource fabric.
// It never executes arbitrary task commands. It evaluates placement, records immutable
// decisions, and emits per-host dispatch envelopes for an authorized executor.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { evaluatePlacement, loadJson, DEFAULT_HOSTS, DEFAULT_POLICY } from './placement.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const STATE_DIR = process.env.DIAL_FABRIC_STATE || '/var/lib/dial-fabric';
export const HOSTS = loadJson(DEFAULT_HOSTS);
export const POLICY = loadJson(DEFAULT_POLICY);

function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
}
function hash(v) { return crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex'); }
function atomicJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, target);
}
function readDirJson(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => [f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]);
  } catch { return []; }
}

export function loadTelemetry(stateDir = STATE_DIR) {
  return Object.fromEntries(readDirJson(path.join(stateDir, 'telemetry')).map(([, t]) => [t.host, t]));
}

export function validateTask(task) {
  if (!task || typeof task !== 'object') throw new Error('task object required');
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(task.task_id || '')) throw new Error('valid task_id required');
  if (!task.project || typeof task.project !== 'string') throw new Error('project required');
  if (task.command || task.shell || task.exec) throw new Error('scheduler refuses arbitrary command payloads');
  return task;
}

export function scheduleTask(task, { stateDir = STATE_DIR, telemetry = loadTelemetry(stateDir), nowMs = Date.now() } = {}) {
  validateTask(task);
  const placement = evaluatePlacement({ task, hosts: HOSTS, policy: POLICY, telemetry, nowMs });
  const record = {
    schema_version: 1,
    task_id: task.task_id,
    project: task.project,
    selected_host: placement.selected,
    placement,
    task_hash: hash(task),
    decided_at: new Date(nowMs).toISOString(),
  };
  record.decision_hash = hash({ ...record, decided_at: undefined });
  atomicJson(path.join(stateDir, 'decisions', `${task.task_id}.${record.decision_hash}.json`), record);

  if (!placement.selected) return record;
  const dispatch = {
    schema_version: 1,
    task,
    selected_host: placement.selected,
    placement_evidence_hash: placement.evidence_hash,
    decision_hash: record.decision_hash,
    created_at: record.decided_at,
  };
  atomicJson(path.join(stateDir, 'dispatch', placement.selected, `${task.task_id}.${record.decision_hash}.json`), dispatch);
  return record;
}

export function runOnce({ stateDir = STATE_DIR, nowMs = Date.now() } = {}) {
  const inbox = path.join(stateDir, 'inbox');
  const archive = path.join(stateDir, 'archive');
  const results = [];
  for (const [filename, task] of readDirJson(inbox)) {
    try {
      const result = scheduleTask(task, { stateDir, nowMs });
      fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
      fs.renameSync(path.join(inbox, filename), path.join(archive, filename));
      results.push(result);
    } catch (error) {
      atomicJson(path.join(stateDir, 'rejected', filename), { schema_version: 1, error: error.message, rejected_at: new Date(nowMs).toISOString() });
      fs.rmSync(path.join(inbox, filename), { force: true });
      results.push({ task_id: task?.task_id ?? null, error: error.message });
    }
  }
  return results;
}

export async function daemon({ stateDir = STATE_DIR, intervalMs = 5000 } = {}) {
  fs.mkdirSync(path.join(stateDir, 'inbox'), { recursive: true, mode: 0o700 });
  while (true) {
    runOnce({ stateDir });
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'once';
  if (mode === 'daemon') await daemon();
  else console.log(JSON.stringify(runOnce(), null, 2));
}
