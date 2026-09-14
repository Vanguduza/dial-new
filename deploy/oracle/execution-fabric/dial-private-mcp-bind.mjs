#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';

const BIND = process.env.DIAL_PRIVATE_MCP_BIND || '10.0.0.184';
const PORT = Number(process.env.DIAL_PRIVATE_MCP_PORT || 9133);
const UPSTREAM = process.env.DIAL_PRIVATE_MCP_UPSTREAM || 'http://127.0.0.1:9131';
const CAP_FILE = process.env.DIAL_REMOTE_MCP_CAPABILITY_FILE || '/var/lib/dial-control/secrets/remote-mcp-capability';
const STATE_FILE = process.env.DIAL_PRIVATE_MCP_STATE || '/var/lib/dial-control/state/private-mcp-bind.json';
const QUEUE_ROOT = process.env.DIAL_WORK_QUEUE || '/var/lib/dial-control/work-queue';

function readCapability() {
  return fs.readFileSync(CAP_FILE, 'utf8').trim();
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function countQueue(state) {
  try {
    return fs.readdirSync(`${QUEUE_ROOT}/${state}`).filter((name) => name.endsWith('.json')).length;
  } catch {
    return null;
  }
}

function writeState(extra = {}) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({
    service: 'dial-private-mcp-bind',
    pid: process.pid,
    bind: BIND,
    port: PORT,
    upstream: UPSTREAM,
    fabric: 'PROVIDER_FIRST_EXECUTION_FABRIC',
    revision: '2.0',
    at: new Date().toISOString(),
    ...extra,
  }, null, 2)}\n`, { mode: 0o600 });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${BIND}:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, {
      service: 'dial-private-mcp-bind',
      state: 'UP',
      bind: BIND,
      port: PORT,
      fabric: 'PROVIDER_FIRST_EXECUTION_FABRIC',
    });
  }
  if (req.method === 'GET' && url.pathname === '/fabric/health') {
    return send(res, 200, {
      service: 'dial-private-mcp-bind',
      state: 'UP',
      control_role: 'CONTROL_AUTHORITY',
    });
  }
  if (req.method === 'GET' && url.pathname === '/fabric/queue-status') {
    return send(res, 200, {
      inbox: countQueue('inbox'),
      processing: countQueue('processing'),
      completed: countQueue('completed'),
      failed: countQueue('failed'),
      coordination: 'BACKGROUND_OBSERVE_ONLY',
    });
  }

  let capability;
  try {
    capability = readCapability();
  } catch {
    return send(res, 503, { error: 'capability unavailable' });
  }
  const allowed = `/mcp/${capability}`;
  if (url.pathname !== allowed) return send(res, 404, { error: 'not found' });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });

  try {
    const chunks = [];
    let n = 0;
    for await (const chunk of req) {
      n += chunk.length;
      if (n > 1024 * 1024) return send(res, 413, { error: 'request too large' });
      chunks.push(chunk);
    }
    const upstream = await fetch(`${UPSTREAM}${allowed}`, {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      body: Buffer.concat(chunks),
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    });
    res.end(text);
  } catch (error) {
    send(res, 502, { error: String(error?.message || error) });
  }
});

server.listen(PORT, BIND, () => {
  writeState({ state: 'RUNNING' });
});
