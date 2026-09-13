import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Rev 3 section 3 requires every host to be reachable by paths that share no dependency on
 * any other host. Nothing enforced it: every tool in deploy/oracle/provisioning was scoped
 * to oracle-admin, and the only place the other two hosts appeared was in guards saying
 * "do not touch this". The estate had a rule about three hosts and evidence about one.
 *
 * These cover the two tools that close that: a read-only checker safe to point at the
 * protected hosts, and the disruption test that proves no host is a mandatory hop.
 *
 * Most of what matters here is refusal behaviour. A checker that reports healthy when it
 * cannot see, or a disruption test that removes the only way into a host, would each be
 * worse than not having the tool.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const PROV = path.join(ROOT, 'deploy/oracle/provisioning');
const ACCESS = path.join(PROV, '60-estate-access-check.sh');
const INDEP = path.join(PROV, '61-independence-test.sh');
const HOSTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/oracle/resource-fabric/hosts.json'), 'utf8'));

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'access-')); });

const run = (script, args = [], env = {}) => {
  try {
    return {
      status: 0,
      out: execFileSync('bash', ['-c', 'bash "$0" "$@" 2>&1', script, ...args],
        { env: { ...process.env, DIAL_ACCESS_SSH_TIMEOUT: '1', ...env }, encoding: 'utf8', stdio: 'pipe' }),
    };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const json = (args = [], env = {}) => {
  const r = (() => {
    try {
      return execFileSync('bash', [ACCESS, ...args, '--json'],
        { env: { ...process.env, DIAL_ACCESS_SSH_TIMEOUT: '1', ...env }, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) { return e.stdout ?? ''; }
  })();
  return JSON.parse(r);
};

describe('the access check covers the whole estate, not just oracle-admin', () => {
  it('reports on every host in the fabric', () => {
    const rep = json();
    expect(rep.hosts.map((h) => h.host).sort())
      .toEqual(HOSTS.hosts.map((h) => h.host_id).sort());
  });

  it('includes the protected hosts, which is the point of it existing', () => {
    const names = json().hosts.map((h) => h.host);
    expect(names).toContain('dial-hermes-control');
    expect(names).toContain('oracle-admin-v2');
  });

  it('declares itself read-only, and contains no mutating OCI verb', () => {
    const rep = json();
    expect(rep.read_only).toBe(true);
    // The reason it is safe to aim at a protected host is that it cannot change one.
    const code = fs.readFileSync(ACCESS, 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    for (const verb of ['instance action', 'rules add', 'rules remove', 'rules update',
                        'instance terminate', 'instance update', 'run-command']) {
      expect(code, `must not contain "${verb}"`).not.toContain(verb);
    }
  });

  it('checks each of the three paths named in the architecture', () => {
    const paths = json().hosts[0].checks.map((c) => c.path);
    expect(paths).toContain('direct_ssh');
    expect(paths).toContain('oci_run_command');
    expect(paths).toContain('desktop_commander');
  });
});

describe('what it cannot see, it does not call healthy', () => {
  it('reports UNVERIFIED rather than PROVEN with no OCI and no addresses', () => {
    const rep = json();
    const outcomes = rep.hosts.flatMap((h) => h.checks.map((c) => c.outcome));
    expect(outcomes).not.toContain('PROVEN');
    expect(new Set(outcomes)).toContain('UNVERIFIED');
    expect(rep.verdict).not.toBe('PASS');
  });

  it('never lets an unverified path count toward independence', () => {
    for (const h of json().hosts) {
      const proven = h.checks.filter((c) => c.outcome === 'PROVEN').length;
      expect(h.paths_proven).toBe(proven);
      if (proven < 2) expect(h.verdict).not.toBe('INDEPENDENT');
    }
  });

  it('refuses to probe Commander over SSH, which would couple the two paths', () => {
    const dc = json().hosts[0].checks.find((c) => c.path === 'desktop_commander');
    expect(dc.outcome).toBe('UNVERIFIED');
    expect(dc.detail).toMatch(/couple|only on the host/i);
  });
});

describe('it can tell a down host from a blind prober', () => {
  // The failure this prevents: during an outage, a laptop behind a proxy reports every
  // host BROKEN, and someone starts rebuilding machines that were never down.
  it('downgrades every SSH failure to UNVERIFIED when it reached nothing at all', () => {
    const env = {};
    for (const h of HOSTS.hosts) {
      env[`DIAL_FABRIC_${h.host_id.toUpperCase().replace(/-/g, '_')}_SSH_HOST`] = '198.51.100.7';
    }
    const rep = json([], env);
    expect(rep.prober_blind).toBe(true);
    const ssh = rep.hosts.flatMap((h) => h.checks.filter((c) => c.path === 'direct_ssh'));
    expect(ssh.every((c) => c.outcome === 'UNVERIFIED')).toBe(true);
    expect(ssh.some((c) => /blocked egress|cannot tell/i.test(c.detail))).toBe(true);
  });

  it('recomputes the verdicts to match the downgraded evidence', () => {
    const env = {};
    for (const h of HOSTS.hosts) {
      env[`DIAL_FABRIC_${h.host_id.toUpperCase().replace(/-/g, '_')}_SSH_HOST`] = '198.51.100.7';
    }
    const rep = json([], env);
    // A verdict left at BROKEN over checks that now read UNVERIFIED would contradict
    // its own evidence.
    for (const h of rep.hosts) {
      const broken = h.checks.filter((c) => c.outcome === 'BROKEN').length;
      if (broken === 0) expect(h.verdict).not.toBe('BROKEN');
    }
  });
});

describe('it detects a host that is only reachable through a peer', () => {
  it('flags an address that belongs to another host in the fabric', () => {
    const rep = json([], {
      DIAL_FABRIC_DIAL_HERMES_CONTROL_SSH_HOST: HOSTS.hosts.find((h) => h.host_id === 'oracle-admin-v2').private_ip,
    });
    const hermes = rep.hosts.find((h) => h.host === 'dial-hermes-control');
    const hop = hermes.checks.find((c) => c.path === 'no_peer_hop');
    expect(hop.outcome).toBe('BROKEN');
    expect(hop.detail).toMatch(/peer hop/i);
    expect(rep.verdict).toBe('FAIL');
  });

  it('names the right environment variable when it has no address', () => {
    // A hint naming a variable that can never resolve sends an operator to set the
    // wrong thing — the same class of error as every other bug found in this repo.
    const detail = json().hosts.find((h) => h.host === 'dial-hermes-control')
      .checks.find((c) => c.path === 'direct_ssh').detail;
    expect(detail).toContain('DIAL_FABRIC_DIAL_HERMES_CONTROL_SSH_HOST');
    expect(detail).not.toMatch(/DIAL_FABRIC_[A-Z_]*-/);
  });
});

describe('the independence test will not damage the estate to measure it', () => {
  it('changes nothing unless --disrupt is given', () => {
    const r = run(INDEP);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/Phase B — disruption: NOT RUN/);
    expect(r.out).toMatch(/no changes/i);
  });

  it('refuses to disrupt a protected host', () => {
    for (const host of ['dial-hermes-control', 'oracle-admin-v2']) {
      const r = run(INDEP, ['--host', host, '--disrupt']);
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/REFUSED/);
      expect(r.out).toMatch(/protected host/);
    }
  });

  it('never stops or terminates an instance to prove isolation', () => {
    const code = fs.readFileSync(INDEP, 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    for (const verb of ['instance action', 'instance terminate', 'SOFTSTOP', 'STOP']) {
      expect(code, `must not contain "${verb}"`).not.toContain(verb);
    }
  });

  it('arms the restore before making the change, not after', () => {
    // Order is the entire safety property. A trap registered after the removal leaves a
    // window in which a crash strands the host with its ingress gone.
    const code = fs.readFileSync(INDEP, 'utf8');
    const save = code.indexOf('SSH rule saved to');
    const arm = code.indexOf('trap cleanup EXIT');
    const remove = code.indexOf('nsg rules remove');
    expect(save).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(save);
    expect(remove).toBeGreaterThan(arm);
  });

  it('requires a proven way back in before removing the way in', () => {
    const code = fs.readFileSync(INDEP, 'utf8');
    const gate = code.indexOf('OCI Run Command on $TARGET is');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(code.indexOf('nsg rules remove'));
    expect(code).toMatch(/lock yourself\s*\n?out of a host/);
  });

  it('refuses to start a second disruption while one is outstanding', () => {
    const stash = path.join(tmp, 'restore.json');
    fs.writeFileSync(stash, JSON.stringify({ nsg_id: 'ocid1.nsg.x', rule: { id: 'r1' } }));
    const r = run(INDEP, ['--disrupt'], { DIAL_INDEPENDENCE_STASH: stash });
    expect(r.out).toMatch(/still outstanding/);
    expect(r.status).not.toBe(0);
  });

  it('keeps the removed rule on disk so a failed restore is replayable', () => {
    const code = fs.readFileSync(INDEP, 'utf8');
    expect(code).toMatch(/RESTORE FAILED/);
    expect(code).toMatch(/--restore/);
    expect(code).toMatch(/nsg rules add/);
  });

  it('touches an NSG, never the security list shared with the control host', () => {
    const code = fs.readFileSync(INDEP, 'utf8');
    expect(code).toMatch(/nsg rules remove/);
    expect(code).not.toMatch(/security-list (update|add|remove)/);
  });
});

describe('the independence test states what it actually established', () => {
  it('does not claim "no host depends on a peer" when it checked none', () => {
    // The first version printed that line unconditionally. With no addresses resolvable,
    // every peer-hop check is UNVERIFIED and the claim describes an empty set.
    const r = run(INDEP);
    expect(r.out).toMatch(/PEER-HOP CHECK INCONCLUSIVE/);
    expect(r.out).toMatch(/This is not 'no host depends on a peer'/);
  });

  it('stops before phase B if a host already has no path of its own', () => {
    const code = fs.readFileSync(INDEP, 'utf8');
    expect(code).toMatch(/STRUCTURAL FAILURE/);
    expect(code).toMatch(/No disruption test is needed/);
  });
});
