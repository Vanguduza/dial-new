import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * The offsite backup exists because a terminated host takes its audit history with it.
 * But these hosts hold live credentials — the Desktop Commander device credential, SSH
 * private material, Codex and Claude OAuth sessions, an API key under ~/.dde-control —
 * so a backup job that copies "the host" to the owner's Drive exfiltrates all of it.
 *
 * The control is an allowlist plus a content scan. A scanner that has only ever run on a
 * clean host proves nothing, so every test here plants credential-shaped content in a
 * place a bundle could plausibly pick it up, and asserts the bundle is refused.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PROV = path.join(here, '..', 'deploy', 'oracle', 'provisioning');
const BUNDLE = path.join(PROV, 'evidence-bundle.sh');

let home;
const env = () => ({
  ...process.env,
  DIAL_FABRIC_HOST_ID: 'oracle-admin',
  DIAL_RECOVERY_STATE: path.join(home, 'var'),
  DIAL_RECOVERY_LOG_DIR: path.join(home, 'log'),
  DIAL_RECOVERY_ETC: path.join(home, 'etc'),
  DIAL_EVIDENCE_OUT: path.join(home, 'out'),
});

const run = (args = []) => {
  try {
    return { status: 0, out: execFileSync('bash', [BUNDLE, ...args], { env: env(), encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const write = (rel, body) => {
  const f = path.join(home, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
  return f;
};

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'evb-'));
  // A normal, clean host: certification, bootstrap facts, recovery evidence.
  write('var/bootstrap-state.json', '{"phase":7,"ssh_ok":true}\n');
  write('log/host-certification.json', '{"certification":{"state":"AMBER"}}\n');
  write('var/fabric/recovery-evidence/oracle-admin-v2.1757000000.json',
    '{"target":"oracle-admin-v2","action":"RESTART_SERVICE"}\n');
  write('etc/fabric.env', 'DIAL_FABRIC_HOST_ID=oracle-admin\nDIAL_FABRIC_SSH_USER=ubuntu\n');
});

describe('a clean host bundles', () => {
  it('verifies without writing anything', () => {
    const r = run(['--verify']);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/VERIFY OK/);
    expect(fs.existsSync(path.join(home, 'out'))).toBe(false);
  });

  it('writes one owner-only tarball and prints its path', () => {
    const r = run();
    expect(r.status).toBe(0);
    const bundle = r.out.trim();
    expect(fs.existsSync(bundle)).toBe(true);
    expect(fs.statSync(bundle).mode & 0o777).toBe(0o600);
  });

  it('refuses rather than shipping an empty bundle when nothing exists', () => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.mkdirSync(home);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/Nothing to bundle/);
  });
});

describe('credential-shaped content is refused, not shipped', () => {
  // Each planted value is the shape of a real credential this estate actually holds.
  const planted = {
    'an OpenSSH private key': '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk\n-----END OPENSSH PRIVATE KEY-----\n',
    'an RSA private key': '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\n',
    'a Commander device refresh token': '{"refresh_token": "1//0gV3RyLongLookingValue1234567890"}\n',
    'an OAuth access token': '{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop"}\n',
    'a bearer header captured into a log': 'GET /v1/thing\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz0123\n',
    'an OpenAI-style key': 'XKIRO_API_KEY=sk-abcdefghijklmnopqrstuvwxyz012345\n',
    'a GitHub token': 'token: ghp_abcdefghijklmnopqrstuvwxyz01234567\n',
    'a Google API key': 'key=AIzaSyA1234567890abcdefghijklmnopqrstuvw\n',
    'a Google OAuth token': 'ya29.a0AfH6SMBabcdefghijklmnopqrstuvwxyz\n',
  };

  for (const [what, body] of Object.entries(planted)) {
    it(`refuses when ${what} lands in an allowlisted directory`, () => {
      write('var/fabric/telemetry/leaked.json', body);
      const r = run();
      expect(r.status).toBe(3);
      expect(r.out).toMatch(/REFUSED: credential-shaped content/);
    });

    it(`refuses ${what} on --verify too, so the daily job fails before it uploads`, () => {
      write('var/fabric/decisions/leaked.json', body);
      expect(run(['--verify']).status).toBe(3);
    });
  }

  it('writes no bundle at all when it refuses — a refused build must leave nothing behind', () => {
    write('var/fabric/telemetry/leaked.json', '-----BEGIN OPENSSH PRIVATE KEY-----\nx\n-----END OPENSSH PRIVATE KEY-----\n');
    expect(run().status).toBe(3);
    const out = path.join(home, 'out');
    expect(fs.existsSync(out) ? fs.readdirSync(out) : []).toEqual([]);
  });

  it('names the offending file so an operator can fix the cause, not just retry', () => {
    write('var/fabric/telemetry/leaked.json', 'access_token: eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop\n');
    expect(run().out).toMatch(/leaked\.json/);
  });
});

describe('the bundle cannot be widened by a path trick', () => {
  it('drops a file whose path matches a deny pattern even inside an allowed directory', () => {
    write('var/fabric/telemetry/.ssh/id_ed25519', 'not-actually-a-key\n');
    const r = run();
    expect(r.status).toBe(0);
    // Assert on the artifact, not the log line: what matters is that the key is not in
    // the tarball that gets uploaded.
    const listing = execFileSync('tar', ['-tzf', r.out.trim()], { encoding: 'utf8' });
    expect(listing).not.toMatch(/id_ed25519/);
    expect(listing).toMatch(/telemetry/);
  });

  it('refuses a bundle containing a symlink, which would resolve on the far side', () => {
    const secret = write('secret-material', 'whatever\n');
    fs.mkdirSync(path.join(home, 'var/fabric/telemetry'), { recursive: true });
    fs.symlinkSync(secret, path.join(home, 'var/fabric/telemetry/link.json'));
    const r = run();
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/symlink/);
  });

  it('does not follow a symlink out of the bundle while staging', () => {
    // cp -a --no-dereference: the link is copied as a link, which the symlink check then
    // refuses. The failure mode it prevents is copying the target's bytes silently.
    const secret = write('elsewhere/id_ed25519', '-----BEGIN OPENSSH PRIVATE KEY-----\nz\n-----END OPENSSH PRIVATE KEY-----\n');
    fs.mkdirSync(path.join(home, 'var/fabric/decisions'), { recursive: true });
    fs.symlinkSync(secret, path.join(home, 'var/fabric/decisions/d.json'));
    const r = run();
    expect(r.status).toBe(3);
    const out = path.join(home, 'out');
    expect(fs.existsSync(out) ? fs.readdirSync(out) : []).toEqual([]);
  });
});

describe('the push refuses before it can leak', () => {
  const PUSH = path.join(PROV, 'offsite-push.sh');
  const push = (extra = {}) => {
    try {
      return { status: 0, out: execFileSync('bash', [PUSH], { env: { ...env(), ...extra }, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) {
      return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  it('refuses a world-readable rclone config — it holds an OAuth refresh token', () => {
    const conf = write('rclone.conf', '[dialdrive]\ntype = drive\nscope = drive.file\n');
    fs.chmodSync(conf, 0o644);
    // Put a stub dial-evidence-bundle and rclone on PATH so the config check is reached.
    const bin = path.join(home, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['dial-evidence-bundle', 'rclone']) {
      const f = path.join(bin, name);
      fs.writeFileSync(f, '#!/bin/sh\nexit 0\n'); fs.chmodSync(f, 0o755);
    }
    const r = push({ DIAL_RCLONE_CONF: conf, PATH: `${bin}:${process.env.PATH}` });
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/mode 644/);
  });

  it('says what the owner must do rather than failing silently when Drive is unauthorized', () => {
    const bin = path.join(home, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['dial-evidence-bundle', 'rclone']) {
      const f = path.join(bin, name);
      fs.writeFileSync(f, '#!/bin/sh\nexit 0\n'); fs.chmodSync(f, 0o755);
    }
    const r = push({ DIAL_RCLONE_CONF: path.join(home, 'absent.conf'), PATH: `${bin}:${process.env.PATH}` });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/authorize Drive once/);
  });
});

describe('the timer stays inert until the owner has authorized Drive', () => {
  it('the unit is conditioned on the config existing, so it does not fail noisily every day', () => {
    const unit = fs.readFileSync(path.join(PROV, 'systemd', 'dial-offsite-backup.service'), 'utf8');
    expect(unit).toMatch(/ConditionPathExists=\/etc\/dial-recovery\/rclone\.conf/);
  });

  it('is capped so it can never compete with the recovery plane on a 1 GB host', () => {
    const unit = fs.readFileSync(path.join(PROV, 'systemd', 'dial-offsite-backup.service'), 'utf8');
    expect(unit).toMatch(/MemoryMax=\d+M/);
    expect(unit).toMatch(/Slice=dial-recovery\.slice/);
    expect(unit).toMatch(/NoNewPrivileges=true/);
  });

  it('spreads the three hosts across the hour rather than uploading all at once', () => {
    const timer = fs.readFileSync(path.join(PROV, 'systemd', 'dial-offsite-backup.timer'), 'utf8');
    expect(timer).toMatch(/RandomizedDelaySec=/);
    expect(timer).toMatch(/Persistent=true/);
  });
});
