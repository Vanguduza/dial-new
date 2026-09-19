#!/usr/bin/env node
// Minimal MCP stdio client used as a harmless capability probe: initialize -> tools/list -> tools/call dial_oracle_status.
import { spawn } from 'node:child_process';
const script = process.argv[2];
const child = spawn('node', [script], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = ''; const answers = new Map();
child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(line); if (j.id !== undefined) answers.set(j.id, j); } catch {} } });
function send(id, method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); }
function wait(id, ms = 15000) { return new Promise((res, rej) => { const t0 = Date.now(); (function poll() { if (answers.has(id)) return res(answers.get(id)); if (Date.now() - t0 > ms) return rej(new Error(`timeout waiting for ${id}`)); setTimeout(poll, 25); })(); }); }
try {
  send(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'dial-bootstrap-probe', version: '1' } });
  await wait(1);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  send(2, 'tools/list'); const tools = (await wait(2)).result?.tools?.map((t) => t.name) || [];
  send(3, 'tools/call', { name: 'dial_oracle_status', arguments: {} }); const call = await wait(3, 30000);
  let payload = null; try { payload = JSON.parse(call.result?.content?.[0]?.text || 'null'); } catch {}
  console.log(JSON.stringify({ ok: tools.includes('dial_oracle_status') && payload !== null, tools, available: payload?.available ?? null, fresh: payload?.fresh ?? null, source: payload?.source ?? null }));
} catch (e) { console.log(JSON.stringify({ ok: false, error: e.message })); }
finally { child.kill(); }
