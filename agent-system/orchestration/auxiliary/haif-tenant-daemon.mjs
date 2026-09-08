#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { submitAuxiliaryTask, runOneAuxiliaryTask, haifTenantStatus, haifTaskProjection } from './tenant-service.mjs';
import { qualifyXKiroTenant } from '../providers/xkiro/xkiro-qualification.mjs';
import { benchmarkEliteModels } from '../providers/xkiro/elite-benchmark.mjs';

const PROJECT = process.env.HAIF_PROJECT || 'dial';
const ROOT = process.env.HAIF_CONTROL_ROOT || (PROJECT === 'dial' ? '/var/lib/dial-control' : '/home/ubuntu/.dde-control');
const PROVIDER_ROOT = process.env.HAIF_PROVIDER_ROOT || path.join(ROOT, 'operations', 'auxiliary', 'provider');
const KEY_FILE = process.env.HAIF_KEY_FILE || path.join(ROOT, 'secrets', 'xkiro-api.key');
const PORT = Number(process.env.HAIF_PORT || (PROJECT === 'dial' ? 9141 : 9142));
const TOKEN_FILE = path.join(ROOT, 'secrets', 'haif-control.token');

function ensureToken() {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, `${crypto.randomBytes(32).toString('base64url')}\n`, { mode: 0o600 });
  fs.chmodSync(TOKEN_FILE, 0o600);
  return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
}

async function readBody(req, max = 1_000_000) {
  const chunks = []; let total = 0;
  for await (const chunk of req) { total += chunk.length; if (total > max) throw new Error('request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store' });
  res.end(payload);
}

function taskIdFromUrl(url = '') {
  const match = String(url).match(/^\/v1\/tasks\/([0-9a-f-]{20,})$/i);
  return match?.[1] ?? null;
}

export function createHaifHttpServer({ project = PROJECT, root = ROOT, providerRoot = PROVIDER_ROOT, keyFile = KEY_FILE, token = ensureToken() } = {}) {
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { service: 'hermes-haif-tenant', project, state: 'UP' });
    if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'unauthorized' });
    try {
      if (req.method === 'GET' && req.url === '/v1/status') return send(res, 200, haifTenantStatus({ project, root, providerRoot, keyFile }));
      const taskId = req.method === 'GET' ? taskIdFromUrl(req.url) : null;
      if (taskId) {
        const projection = haifTaskProjection(taskId, root);
        return projection ? send(res, 200, projection) : send(res, 404, { error: 'task not found' });
      }
      if (req.method === 'POST' && req.url === '/v1/tasks') {
        const body = await readBody(req);
        const result = submitAuxiliaryTask({ ...body, project }, { root, expectedProject: project });
        return send(res, 202, { task_id: result.task.task_id, state: result.task.state, reused: result.reused, authority: result.task.authority });
      }
      if (req.method === 'POST' && req.url === '/v1/run-once') {
        const result = await runOneAuxiliaryTask({ project, root, providerRoot, keyFile });
        return send(res, 200, result);
      }
      return send(res, 404, { error: 'not found' });
    } catch (error) {
      return send(res, 400, { error: String(error?.message || error).slice(0, 1000) });
    }
  });
}

async function daemon() {
  const token = ensureToken();
  const server = createHaifHttpServer({ token });
  server.listen(PORT, '127.0.0.1');
  let stopping = false;
  const stop = () => { stopping = true; server.close(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  while (!stopping) {
    await runOneAuxiliaryTask({ project: PROJECT, root: ROOT, providerRoot: PROVIDER_ROOT, keyFile: KEY_FILE });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'status') return console.log(JSON.stringify(haifTenantStatus({ project: PROJECT, root: ROOT, providerRoot: PROVIDER_ROOT, keyFile: KEY_FILE }), null, 2));
  if (command === 'qualify') return console.log(JSON.stringify(await qualifyXKiroTenant({ project: PROJECT, root: ROOT, providerRoot: PROVIDER_ROOT, keyFile: KEY_FILE }), null, 2));
  if (command === 'benchmark') {
    const archetype = process.argv[3] || process.env.HAIF_BENCHMARK_ARCHETYPE;
    return console.log(JSON.stringify(await benchmarkEliteModels({ project: PROJECT, root: ROOT, providerRoot: PROVIDER_ROOT, keyFile: KEY_FILE, archetype }), null, 2));
  }
  if (command === 'run-once') return console.log(JSON.stringify(await runOneAuxiliaryTask({ project: PROJECT, root: ROOT, providerRoot: PROVIDER_ROOT, keyFile: KEY_FILE }), null, 2));
  if (command === 'daemon') return daemon();
  if (command === 'submit') {
    const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    const result = submitAuxiliaryTask({ ...payload, project: PROJECT }, { root: ROOT, expectedProject: PROJECT });
    return console.log(JSON.stringify({ task_id: result.task.task_id, state: result.task.state, reused: result.reused }, null, 2));
  }
  throw new Error(`unknown HAIF tenant command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
