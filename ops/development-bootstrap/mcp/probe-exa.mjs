#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const keyFile = process.env.DIAL_EXA_API_KEY_FILE || '/var/lib/dial-control/secrets/exa-api.key';
if (!process.env.EXA_API_KEY && !fs.existsSync(keyFile)) { console.log(JSON.stringify({ ok: false, error: 'credential_missing' })); process.exit(1); }
const runner = path.join(repoDir, 'deploy/oracle/hermes-codex/research-mcp-runtime/run-exa.sh');
const child = spawn('bash', [runner], { cwd: repoDir, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
let buf = ''; const answers = new Map(); let stderr = '';
child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(line); if (j.id !== undefined) answers.set(j.id, j); } catch {} } });
child.stderr.on('data', (d) => { stderr += d; });
function send(id, method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); }
function wait(id, ms = 20000) { return new Promise((res, rej) => { const t0 = Date.now(); (function poll() { if (answers.has(id)) return res(answers.get(id)); if (child.exitCode !== null) return rej(new Error(`exa exited ${child.exitCode}: ${stderr.slice(0, 160)}`)); if (Date.now() - t0 > ms) return rej(new Error(`timeout waiting for ${id}`)); setTimeout(poll, 25); })(); }); }
try {
  send(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dial-exa-bootstrap-probe', version: '1' } });
  await wait(1);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  send(2, 'tools/list');
  const tools = (await wait(2)).result?.tools || [];
  if (!tools.some((t) => t.name === 'web_search_exa')) throw new Error('web_search_exa not exposed');
  send(3, 'tools/call', { name: 'web_search_exa', arguments: { query: 'OpenAI API official documentation', numResults: 1 } });
  const call = await wait(3, 30000);
  const ok = !call.error && call.result?.isError !== true && Array.isArray(call.result?.content) && call.result.content.length > 0;
  console.log(JSON.stringify({ ok, tools: tools.map((t) => t.name).sort(), functional_canary: ok }));
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
} finally { child.kill(); }
