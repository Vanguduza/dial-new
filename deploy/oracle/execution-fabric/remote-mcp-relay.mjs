import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';

const HOST = '127.0.0.1';
const PORT = 9131;
const CONTROL_URL = 'http://127.0.0.1:9130/mcp';
const CAP_FILE = '/var/lib/dial-control/secrets/remote-mcp-capability';
const CONTROL_TOKEN_FILE = '/var/lib/dial-control/secrets/chat-control.token';
const STATE_FILE = '/var/lib/dial-control/state/remote-mcp-relay.json';

function ensureCapability() {
  if (!fs.existsSync(CAP_FILE)) {
    fs.writeFileSync(CAP_FILE, crypto.randomBytes(32).toString('base64url') + '\n', { mode: 0o600 });
  }
  fs.chmodSync(CAP_FILE, 0o600);
  return fs.readFileSync(CAP_FILE, 'utf8').trim();
}
function token() { return fs.readFileSync(CONTROL_TOKEN_FILE, 'utf8').trim(); }
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store' });
  res.end(payload);
}
async function body(req, max = 1024 * 1024) {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > max) throw new Error('request too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}

const capability = ensureCapability();
const path = `/mcp/${capability}`;
let bucketStart = Date.now(), bucketCount = 0;
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { service: 'dial-remote-mcp-relay', state: 'UP' });
  if (req.url !== path) return send(res, 404, { error: 'not found' });
  const now = Date.now(); if (now - bucketStart > 60_000) { bucketStart = now; bucketCount = 0; }
  if (++bucketCount > 120) return send(res, 429, { error: 'rate limited' });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST required' });
  try {
    const raw = await body(req);
    const upstream = await fetch(CONTROL_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` }, body: raw });
    const text = await upstream.text();
    res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
    res.end(text);
  } catch (e) { send(res, 502, { error: String(e?.message || e) }); }
});
server.listen(PORT, HOST, () => {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ service: 'dial-remote-mcp-relay', pid: process.pid, host: HOST, port: PORT, capability_fingerprint: crypto.createHash('sha256').update(capability).digest('hex').slice(0,16), state: 'RUNNING', at: new Date().toISOString() }, null, 2) + '\n');
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
