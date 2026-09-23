import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURE = path.join(ROOT, 'deploy/netcup/hermes-control/oci-edge-capture.py');
const FAKE_CLI = path.join(ROOT, 'tests/fixtures/fake-oci-cli-listener.py');
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJ0ZW5hbnQiOiJ4In0.c2ln';
const AUTH = 'https://login.af-johannesburg-1.oraclecloud.com/v1/oauth2/authorize?action=login&x="<y>';

const freePort = () => new Promise((res) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
async function waitUp(port) {
  for (let i = 0; i < 100; i += 1) {
    const ok = await new Promise((res) => {
      const c = net.connect(port, '127.0.0.1', () => { c.end(); res(true); }).on('error', () => res(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`port ${port} never came up`);
}

let dir; let procs;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-cap-')); procs = []; });
afterEach(() => { for (const p of procs) p.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

async function start({ cli = true, persist = true } = {}) {
  const tokenFile = path.join(dir, 'session/DIAL_EDGE_SESSION/token');
  const seen = path.join(dir, 'seen.log');
  const cliPort = await freePort();
  const capPort = await freePort();
  if (cli) {
    procs.push(spawn('python3', [FAKE_CLI, String(cliPort), tokenFile, seen],
      { env: { ...process.env, FAKE_PERSIST: persist ? '1' : '0' }, stdio: 'ignore' }));
    await waitUp(cliPort);
  }
  procs.push(spawn('python3', [CAPTURE], {
    env: { ...process.env, DIAL_OCI_CAPTURE_PORT: String(capPort), DIAL_OCI_CLI_CALLBACK: `http://127.0.0.1:${cliPort}`,
      DIAL_OCI_SESSION_TOKEN_FILE: tokenFile, DIAL_OCI_AUTH_URL: AUTH, DIAL_OCI_CAPTURE_WAIT: '1.5' },
    stdio: 'ignore',
  }));
  await waitUp(capPort);
  const base = `http://127.0.0.1:${capPort}`;
  const capture = async (url) => {
    const r = await fetch(`${base}/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
    return { status: r.status, body: await r.json() };
  };
  const seenQueries = () => (fs.existsSync(seen) ? fs.readFileSync(seen, 'utf8').trim().split('\n').filter(Boolean) : []);
  return { base, capture, tokenFile, seenQueries };
}

describe('OCI sign-in capture page', () => {
  it('accepts the pasted localhost address and reports success only once the session is saved', async () => {
    const t = await start();
    const frag = `access_token=a&security_token=${TOKEN}&expires_in=3600`;
    const r = await t.capture(`http://localhost:8181/#${frag}`);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.message).toMatch(/^Captured/);
    expect(fs.readFileSync(t.tokenFile, 'utf8')).toBe(TOKEN);
    // Forwarded exactly as the CLI's own page would send it: GET /token?<fragment>.
    expect(t.seenQueries()).toEqual([frag]);
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    expect((await (await fetch(`${t.base}/status`)).json()).captured).toBe(true);
  });

  it('refuses an address whose #fragment was lost, without contacting the CLI listener', async () => {
    const t = await start();
    for (const url of ['http://localhost:8181/', 'http://localhost:8181/#access_token=a', '']) {
      const r = await t.capture(url);
      expect(r.status).toBe(400);
      expect(r.body.ok).toBe(false);
    }
    expect(t.seenQueries()).toEqual([]);
    expect(fs.existsSync(t.tokenFile)).toBe(false);
  });

  it('does not report success when the listener answers but saves no session (the false "completed" case)', async () => {
    const t = await start({ persist: false });
    const r = await t.capture(`#security_token=${TOKEN}`);
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
    expect(r.body.message).toMatch(/did not save a session/);
  });

  it('says the window expired when the CLI listener is gone', async () => {
    const t = await start({ cli: false });
    const r = await t.capture(`http://localhost:8181/#security_token=${TOKEN}`);
    expect(r.status).toBe(502);
    expect(r.body.message).toMatch(/expired/);
  });

  it('serves the sign-in link HTML-escaped, auto-captures a present fragment, and offers the paste box', async () => {
    const t = await start();
    const page = await (await fetch(`${t.base}/`)).text();
    expect(page).toContain('href="https://login.af-johannesburg-1.oraclecloud.com/v1/oauth2/authorize?action=login&amp;x=&quot;&lt;y&gt;"');
    expect(page).toContain("location.hash.indexOf('security_token=')");
    expect(page).toContain('<textarea id="u"');
  });

  it('rejects oversized bodies', async () => {
    const t = await start();
    const r = await t.capture(`#security_token=${'a'.repeat(70000)}.b.c`);
    expect(r.status).toBe(400);
  });
});
