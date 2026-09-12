import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { permittedServices, isRecoveryCapable, repairTarget }
  from '../deploy/oracle/resource-fabric/recovery-agent.mjs';

/**
 * Rev 3 section 5: recovery is bidirectional in capability and asymmetric in privilege.
 *
 * Before Rev 3, `dial-hermes-control` had `recovers: []`, so if both E2 admin hosts were
 * down at once nothing in the estate could recover them — which on 2026-09-12 was not a
 * thought experiment. Opening the second direction is only safe if it stays bounded, so
 * these tests are as much about what Hermes may NOT do as what it now can.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FABRIC = path.join(here, '..', 'deploy', 'oracle', 'resource-fabric');
const HOSTS = JSON.parse(fs.readFileSync(path.join(FABRIC, 'hosts.json'), 'utf8'));
const FORCED_CMD = path.join(FABRIC, 'bounded-recovery-command.sh');
const INSTALLER = path.join(FABRIC, 'install-bounded-recovery-identity.sh');

const host = (id) => HOSTS.hosts.find((h) => h.host_id === id);
const HERMES = host('dial-hermes-control');

describe('every host can be recovered, and by more than one peer', () => {
  it('no host is left with nobody able to recover it', () => {
    for (const h of HOSTS.hosts) {
      const recoverers = HOSTS.hosts.filter((o) => o.recovers.includes(h.host_id));
      expect(recoverers.length, `${h.host_id} has no recoverer`).toBeGreaterThan(0);
    }
  });

  it('each host has at least two independent recoverers, so one peer loss is survivable', () => {
    for (const h of HOSTS.hosts) {
      const recoverers = HOSTS.hosts.filter((o) => o.recovers.includes(h.host_id));
      expect(recoverers.length, `${h.host_id} depends on a single recoverer`).toBeGreaterThanOrEqual(2);
    }
  });

  it('recovery is two-way: the control host now recovers both E2 admin hosts', () => {
    expect(HERMES.recovers).toEqual(expect.arrayContaining(['oracle-admin', 'oracle-admin-v2']));
  });

  it('no host is listed as its own recoverer', () => {
    for (const h of HOSTS.hosts) expect(h.recovers).not.toContain(h.host_id);
  });

  it('every recovery target is a host that actually exists', () => {
    const ids = new Set(HOSTS.hosts.map((h) => h.host_id));
    for (const h of HOSTS.hosts) for (const t of h.recovers) expect(ids.has(t)).toBe(true);
  });
});

describe('the second direction stays asymmetric in privilege', () => {
  it('the control host is capped at R1 while the recovery pair may reach R3', () => {
    expect(HERMES.recovery_authority_max).toBe('R1');
    for (const id of ['oracle-admin', 'oracle-admin-v2']) {
      expect(host(id).recovery_authority_max).toBe('R3');
    }
  });

  it('the control host is a BOUNDED_RECOVERY host, never a full RECOVERY peer', () => {
    expect(HERMES.roles).toContain('BOUNDED_RECOVERY');
    expect(HERMES.roles).not.toContain('RECOVERY');
  });

  it('the control host may restart only named recovery units, never the wildcard', () => {
    expect(HERMES.recovery_service_allowlist).not.toContain('*');
    expect(HERMES.recovery_service_allowlist.length).toBeGreaterThan(0);
  });

  it('a wildcard allowlist grants nothing without the full RECOVERY role', () => {
    // Fail closed: if someone ever pastes "*" into the control host's entry, it must not
    // quietly promote it to a full recovery peer.
    expect(permittedServices({ roles: ['BOUNDED_RECOVERY'], recovery_service_allowlist: ['*'] }).size).toBe(0);
    expect(permittedServices({ roles: ['RECOVERY'], recovery_service_allowlist: ['*'] }).size).toBeGreaterThan(0);
  });

  it('drops an allowlisted unit that is not also in APPROVED_SERVICES', () => {
    const s = permittedServices({
      roles: ['BOUNDED_RECOVERY'],
      recovery_service_allowlist: ['dial-recovery-agent.service', 'sshd.service', 'anything.service'],
    });
    expect([...s]).toEqual(['dial-recovery-agent.service']);
  });

  it('grants nothing to a host with no allowlist, or an unknown host', () => {
    expect(permittedServices({ roles: ['RECOVERY'] }).size).toBe(0);
    expect(permittedServices(null).size).toBe(0);
  });

  it('treats both full and bounded peers as recovery-capable, and nobody else', () => {
    expect(isRecoveryCapable(HERMES)).toBe(true);
    expect(isRecoveryCapable(host('oracle-admin'))).toBe(true);
    expect(isRecoveryCapable({ roles: ['LIGHT_X86'] })).toBe(false);
    expect(isRecoveryCapable(null)).toBe(false);
  });

  it('refuses, without touching SSH, when the control host asks for a unit it may not restart', () => {
    const r = repairTarget('oracle-admin',
      { hostId: 'dial-hermes-control', service: 'dial-hermes-runtime.service' });
    expect(r.action).toBe('REFUSED_SERVICE_NOT_PERMITTED_FOR_HOST');
  });

  it('refuses for an unknown host rather than defaulting to the recovery agent', () => {
    expect(repairTarget('oracle-admin', { hostId: 'not-in-the-fabric' }).action)
      .toBe('REFUSED_SERVICE_NOT_PERMITTED_FOR_HOST');
  });
});

describe('the forced command is the whole of what the Hermes key can do', () => {
  let logFile;

  const run = (cmd) => {
    const env = {
      ...process.env,
      SSH_ORIGINAL_COMMAND: cmd,
      SSH_CONNECTION: '10.0.0.184 40000 10.0.0.123 22',
      DIAL_BOUNDED_RECOVERY_LOG: logFile,
    };
    try {
      execFileSync('bash', [FORCED_CMD], { env, encoding: 'utf8', stdio: 'pipe' });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  const verdict = () => (fs.readFileSync(logFile, 'utf8').trim().split('\n').pop() ?? '')
    .match(/verdict=(\S+)/)?.[1];

  beforeEach(() => {
    logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'brc-')), 'audit.log');
  });

  it('answers a liveness probe', () => {
    expect(run('true')).toBe(0);
    expect(verdict()).toBe('ALLOW_R0');
  });

  it('permits restarting the target host\'s own recovery agent — the point of the exercise', () => {
    run('systemctl --user restart dial-recovery-agent.service');
    expect(verdict()).toBe('ALLOW_R1');
  });

  for (const [cmd, why] of [
    ['systemctl --user restart dial-hermes-runtime.service', 'a non-recovery unit'],
    ['systemctl --user restart sshd', 'the thing that would lock the owner out'],
    ['sudo reboot', 'a reboot is R3'],
    ['cat /home/ubuntu/.ssh/id_ed25519', 'no credential loop back into Hermes'],
    ['cat /etc/dial-recovery/rclone.conf', 'no reading the offsite token'],
    ['bash -i', 'no interactive shell'],
    ['/bin/sh', 'no shell by another name'],
    ['oci compute instance action --action RESET', 'no OCI control plane'],
    ['apt-get install anything', 'no package changes'],
    ['iptables -F', 'no firewall changes'],
    ['systemctl --user restart dial-recovery-agent.service; rm -rf /', 'no command chaining'],
    ['systemctl --user restart dial-recovery-agent.service && id', 'no operator chaining'],
    ['systemctl --user restart $(echo dial-recovery-agent.service)', 'no substitution'],
  ]) {
    it(`refuses: ${cmd} — ${why}`, () => {
      expect(run(cmd)).toBe(3);
      expect(verdict()).toMatch(/^REFUSED_/);
    });
  }

  it('refuses an empty command instead of dropping to a shell', () => {
    expect(run('')).toBe(4);
    expect(verdict()).toBe('REFUSED_NO_COMMAND');
  });

  it('records every attempt, permitted or refused', () => {
    run('true');
    run('sudo reboot');
    expect(fs.readFileSync(logFile, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('never names a shell interpreter as a permitted verb', () => {
    const body = fs.readFileSync(FORCED_CMD, 'utf8');
    expect(body).not.toMatch(/\beval\b/);
    expect(body).not.toMatch(/exec\s+(bash|sh|\$)/);
  });

  it('restarts a strict subset of what it may read, and of what hosts.json grants', () => {
    const body = fs.readFileSync(FORCED_CMD, 'utf8');
    const list = (name) => body.match(new RegExp(`${name}=\\(([^)]*)\\)`, 's'))[1]
      .match(/"[^"]+"/g).map((s) => s.replaceAll('"', ''));
    const restartable = list('RESTARTABLE');
    const readable = list('READABLE');
    for (const u of restartable) expect(readable).toContain(u);
    // The two ends of the same bound must agree, or the scheduler and the SSH channel
    // would disagree about what Hermes is allowed to do.
    expect([...restartable].sort()).toEqual([...HERMES.recovery_service_allowlist].sort());
  });
});

describe('the inbound half refuses to be installed unsafely', () => {
  const install = (args, env = {}) => {
    try {
      const out = execFileSync('bash', [INSTALLER, ...args],
        { env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe' });
      return { status: 0, out };
    } catch (e) {
      return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };

  it('refuses to run on the control host — that would rebuild the symmetric mesh', () => {
    const r = install(['--verify'], { DIAL_FABRIC_HOST_ID: 'dial-hermes-control' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/not a RECOVERY host/);
  });

  it('refuses on a host the bounded recoverer does not list as a target', () => {
    const r = install(['--verify'], { DIAL_FABRIC_HOST_ID: 'some-other-box' });
    expect(r.status).not.toBe(0);
  });

  it('reports ABSENT rather than success when no entry is installed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brid-'));
    const r = install(['--verify'], {
      DIAL_FABRIC_HOST_ID: 'oracle-admin',
      DIAL_AUTHORIZED_KEYS: path.join(dir, 'authorized_keys'),
    });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/ABSENT/);
  });
});
