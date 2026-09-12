import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Rev 3 section 7.1: a capability is proven only by evidence that could not exist unless
 * the capability worked. verify-two-way-recovery.sh is what produces that evidence, which
 * makes IT the thing that has to be trustworthy — a verifier that passes a broken channel
 * is worse than no verifier, because it converts an unknown into a false certainty.
 *
 * So these tests run it against three stand-in targets: one behind the real forced
 * command, one with no restriction at all, and one that is down. It must reach a
 * different verdict for each, and the unbounded target must FAIL rather than pass on the
 * strength of its working happy path.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const FABRIC = path.join(ROOT, 'deploy/oracle/resource-fabric');
const VERIFY = path.join(FABRIC, 'verify-two-way-recovery.sh');
const FORCED = path.join(FABRIC, 'bounded-recovery-command.sh');
const SEED = path.join(FABRIC, 'seed-known-hosts.sh');
const PEER = path.join(FABRIC, 'install-bounded-recovery-peer.sh');

let tmp;

/** A systemd stand-in: enough for the verbs the forced command permits. */
const writeSystemctl = (dir) => {
  const f = path.join(dir, 'systemctl');
  fs.writeFileSync(f, [
    '#!/usr/bin/env bash',
    'case " $* " in',
    '  *" is-active "*) echo active; exit 0 ;;',
    '  *" restart "*)   exit 0 ;;',
    '  *" is-system-running "*) echo running; exit 0 ;;',
    'esac',
    'exit 1',
  ].join('\n'));
  fs.chmodSync(f, 0o755);
};

/** ssh(1) stand-ins. The bounded one dispatches through the REAL forced command. */
const writeSsh = (dir, kind) => {
  const f = path.join(dir, `ssh-${kind}`);
  const bodies = {
    bounded: [
      '#!/usr/bin/env bash',
      'cmd="${!#}"',
      'export SSH_ORIGINAL_COMMAND="$cmd"',
      'export SSH_CONNECTION="10.0.0.184 40000 10.0.0.123 22"',
      'export DIAL_BOUNDED_RECOVERY_LOG=/dev/null',
      `export PATH="${dir}:$PATH"`,
      `exec bash ${FORCED}`,
    ],
    // No forced command: a plain shell account. Everything "works".
    unbounded: [
      '#!/usr/bin/env bash',
      'cmd="${!#}"',
      'case "$cmd" in',
      "  'true') exit 0 ;;",
      "  'systemctl --user is-active dial-recovery-agent.service') echo active; exit 0 ;;",
      '  *) echo "pretend output"; exit 0 ;;',
      'esac',
    ],
    dead: ['#!/usr/bin/env bash', 'exit 255'],
  };
  fs.writeFileSync(f, bodies[kind].join('\n'));
  fs.chmodSync(f, 0o755);
  return f;
};

// The human-readable report goes to stderr (stdout is reserved for --json), so the
// harness must merge both streams or a successful run looks like it printed nothing.
const capture = (cmd, args, env) => {
  try {
    return { status: 0, out: execFileSync(cmd, args, { env, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const verify = (kind, args = []) => {
  const ssh = writeSsh(tmp, kind);
  const env = {
    ...process.env,
    DIAL_FABRIC_HOST_ID: 'dial-hermes-control',
    DIAL_FABRIC_STATE: path.join(tmp, 'state'),
    DIAL_VERIFY_SSH: ssh,
  };
  const json = args.includes('--json');
  // For --json the report is on stdout and must not be polluted; otherwise merge.
  const r = json
    ? capture('bash', [VERIFY, ...args], env)
    : capture('bash', ['-c', `bash "$0" "$@" 2>&1`, VERIFY, ...args], env);
  return r;
};

const report = (kind, args = []) => JSON.parse(verify(kind, [...args, '--json']).out);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twv-'));
  writeSystemctl(tmp);
});

describe('a correctly bounded target verifies', () => {
  it('reaches PARTIAL without --include-repair, because it has not tried the repair', () => {
    const r = verify('bounded', ['--target', 'oracle-admin']);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/VERDICT: PARTIAL/);
  });

  it('reaches PROVEN once the R1 repair is actually exercised', () => {
    const r = verify('bounded', ['--target', 'oracle-admin', '--include-repair']);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/VERDICT: PROVEN/);
  });

  it('covers both E2 peers when no single target is named', () => {
    const rep = report('bounded', ['--include-repair']);
    expect(rep.targets.map((t) => t.target).sort()).toEqual(['oracle-admin', 'oracle-admin-v2']);
    expect(rep.verdict).toBe('PROVEN');
  });

  it('records the ceiling it verified under, so the evidence means something later', () => {
    const rep = report('bounded', ['--target', 'oracle-admin']);
    expect(rep.recovery_authority_max).toBe('R1');
    expect(rep.bounded_recoverer).toBe(true);
    expect(rep.source_authority).toMatch(/REV3/);
  });
});

describe('an UNBOUNDED target fails, despite working perfectly', () => {
  // This is the test that matters. The unbounded stand-in answers every probe with
  // success — it is reachable, it reports a healthy unit, it does whatever it is asked.
  // A verifier that only checked permitted verbs would call it PROVEN.
  it('is reachable and observable, and still FAILS', () => {
    const rep = report('unbounded', ['--target', 'oracle-admin']);
    const byName = Object.fromEntries(rep.targets[0].checks.map((c) => [c.check, c.outcome]));
    expect(byName.reachable).toBe('PASS');
    expect(byName.observe_recovery_agent).toBe('PASS');
    expect(rep.verdict).toBe('FAILED');
  });

  it('exits non-zero so a script cannot mistake it for success', () => {
    expect(verify('unbounded', ['--target', 'oracle-admin']).status).toBe(5);
  });

  it('fails every refusal probe and says the channel is not bounded', () => {
    const rep = report('unbounded', ['--target', 'oracle-admin']);
    const refusals = rep.targets[0].checks.filter((c) => c.check.startsWith('refuses:'));
    expect(refusals.length).toBeGreaterThanOrEqual(10);
    expect(refusals.every((c) => c.outcome === 'FAIL')).toBe(true);
    expect(refusals.some((c) => /not bounded/i.test(c.detail))).toBe(true);
  });

  it('probes a shell, a reboot, the OCI control plane and command chaining', () => {
    const rep = report('unbounded', ['--target', 'oracle-admin']);
    const names = rep.targets[0].checks.map((c) => c.check).join(' | ');
    for (const must of ['interactive shell', 'reboot is R3', 'OCI control plane', 'command chaining']) {
      expect(names).toContain(must);
    }
  });

  it('never writes credential content into the evidence, even when the read succeeds', () => {
    // The unbounded stand-in happily returns output for `cat ~/.ssh/id_ed25519`. The
    // verifier must keep the exit status and discard the bytes — otherwise a regression
    // in the forced command would be recorded by writing the key into a file on disk.
    const raw = verify('unbounded', ['--target', 'oracle-admin', '--json']).out;
    expect(raw).toMatch(/credential read/);
    expect(raw).not.toMatch(/pretend output/);
  });
});

describe('an unreachable target is UNPROVEN, never a pass', () => {
  it('reports UNPROVEN and exits 4', () => {
    const r = verify('dead', ['--target', 'oracle-admin']);
    expect(r.status).toBe(4);
    expect(r.out).toMatch(/VERDICT: UNPROVEN/);
    expect(r.out).toMatch(/this is not a pass/);
  });

  it('does not report checks it could not run', () => {
    const rep = report('dead', ['--target', 'oracle-admin']);
    expect(rep.targets[0].verdict).toBe('UNPROVEN');
    expect(rep.targets[0].checks).toHaveLength(1);
    expect(rep.targets[0].checks[0].check).toBe('reachable');
  });
});

describe('an error message is not an observation', () => {
  it('fails when the target answers with something that is not a systemd state', () => {
    // "Failed to connect to bus: No medium found" is non-empty output. Accepting it would
    // be the same mistake as every other 2026-09-12 failure: output that looked like
    // success. The check requires an actual state word.
    const ssh = path.join(tmp, 'ssh-noisy');
    fs.writeFileSync(ssh, [
      '#!/usr/bin/env bash',
      'cmd="${!#}"',
      "[ \"$cmd\" = 'true' ] && exit 0",
      "case \"$cmd\" in *is-active*) echo 'Failed to connect to bus: No medium found'; exit 1 ;; esac",
      'exit 3',
    ].join('\n'));
    fs.chmodSync(ssh, 0o755);
    let out;
    try {
      out = execFileSync('bash', [VERIFY, '--target', 'oracle-admin', '--json'], {
        env: { ...process.env, DIAL_FABRIC_HOST_ID: 'dial-hermes-control', DIAL_VERIFY_SSH: ssh },
        encoding: 'utf8', stdio: 'pipe',
      });
    } catch (e) { out = e.stdout; }
    const rep = JSON.parse(out);
    const observe = rep.targets[0].checks.find((c) => c.check === 'observe_recovery_agent');
    expect(observe.outcome).toBe('FAIL');
    expect(observe.detail).toMatch(/not a state word/);
  });
});

describe('the verifier refuses to run where it makes no sense', () => {
  it('refuses on a host that is not in the fabric', () => {
    let status = 0;
    try {
      execFileSync('bash', [VERIFY], {
        env: { ...process.env, DIAL_FABRIC_HOST_ID: 'not-a-host' }, stdio: 'pipe',
      });
    } catch (e) { status = e.status; }
    expect(status).toBe(2);
  });

  it('refuses a target the host does not recover', () => {
    let out = '';
    let status = 0;
    try {
      execFileSync('bash', [VERIFY, '--target', 'dial-hermes-control'], {
        env: { ...process.env, DIAL_FABRIC_HOST_ID: 'dial-hermes-control' },
        encoding: 'utf8', stdio: 'pipe',
      });
    } catch (e) { status = e.status; out = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
    expect(status).toBe(2);
    expect(out).toMatch(/no targets/);
  });

  it('bounds every remote call, so a hung target cannot hang the verification', () => {
    const body = fs.readFileSync(VERIFY, 'utf8');
    expect(body).toMatch(/timeout "\$SSH_TIMEOUT"/);
    expect(body.match(/timeout "\$SSH_TIMEOUT"/g).length).toBeGreaterThanOrEqual(2);
  });
});

describe('known_hosts seeding is the last step before a running recovery plane', () => {
  it('refuses to seed for a host that is not in the fabric', () => {
    let status = 0;
    try {
      execFileSync('bash', [SEED], { env: { ...process.env, DIAL_FABRIC_HOST_ID: 'nope' }, stdio: 'pipe' });
    } catch (e) { status = e.status; }
    expect(status).toBe(1);
  });

  it('accounts for every target and claims none of them are seeded', () => {
    const r = capture('bash', ['-c', `bash "$0" --verify 2>&1`, SEED], {
      ...process.env, DIAL_FABRIC_HOST_ID: 'oracle-admin',
      DIAL_KNOWN_HOSTS: path.join(tmp, 'known_hosts'),
    });
    expect(r.status).not.toBe(0);
    // Every target is named. Whether it reads MISSING (no entry) or UNKNOWN (no
    // ssh-keygen to look with) depends on the machine — what must never happen is a
    // target going unmentioned, or an unseeded one reading as SEEDED.
    for (const t of ['oracle-admin-v2', 'dial-hermes-control']) {
      expect(r.out).toMatch(new RegExp(`(MISSING|UNKNOWN)\\s+${t}`));
    }
    expect(r.out).not.toMatch(/SEEDED/);
  });

  it('distinguishes "no entry" from "could not look"', () => {
    // A report that cannot tell those apart invites someone to start the recovery agent
    // on the strength of a clean-looking check.
    expect(fs.readFileSync(SEED, 'utf8')).toMatch(/cannot read known_hosts/);
  });

  it('offers a binding fingerprint check and says where the expected value comes from', () => {
    const body = fs.readFileSync(SEED, 'utf8');
    expect(body).toMatch(/--expect/);
    expect(body).toMatch(/host_key_fingerprint/);
    // Trust-on-first-use is permitted but must announce itself, never pass silently.
    expect(body).toMatch(/UNVERIFIED/);
  });

  it('refuses a changed host key instead of overwriting it', () => {
    expect(fs.readFileSync(SEED, 'utf8')).toMatch(/a DIFFERENT key is already trusted/);
  });
});

describe('the outbound half belongs only on the control host', () => {
  it('refuses to install on an E2 recovery peer', () => {
    const r = capture('bash', ['-c', `bash "$0" --verify 2>&1`, PEER],
      { ...process.env, DIAL_FABRIC_HOST_ID: 'oracle-admin', DIAL_SSH_DIR: tmp });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/does not hold the BOUNDED_RECOVERY role/);
  });

  it('checks the role before it checks the tooling', () => {
    // A policy refusal must not depend on a tool being present. Answering "wrong host"
    // with "wrong tool" sends an operator installing packages on a machine that should
    // never run this at all. Asserted on source order, because a PATH stripped bare
    // enough to hide ssh-keygen also hides the shebang's interpreter.
    const body = fs.readFileSync(PEER, 'utf8');
    expect(body.indexOf('BOUNDED_RECOVERY'))
      .toBeLessThan(body.indexOf('command -v ssh-keygen'));
  });

  it('refuses the wrong host by naming the role, not by blaming the inventory', () => {
    // `mapfile -t X < <(node ...) || die` cannot work: mapfile succeeds with zero lines
    // however node exited, so the role refusal was unreachable and an operator on an E2
    // was told "no recovery targets in hosts.json" — an error naming the wrong cause.
    // Strip comments first: the file explains this bug in prose, and prose about a bug
    // is not the bug.
    const code = fs.readFileSync(PEER, 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    expect(code).not.toMatch(/mapfile[^\n]*<\s*<\(/);
    const r = capture('bash', ['-c', `bash "$0" --verify 2>&1`, PEER],
      { ...process.env, DIAL_FABRIC_HOST_ID: 'oracle-admin', DIAL_SSH_DIR: tmp });
    expect(r.out).not.toMatch(/no recovery targets/);
  });

  it('reports ABSENT on the control host before anything is installed', () => {
    const r = capture('bash', ['-c', `bash "$0" --verify 2>&1`, PEER],
      { ...process.env, DIAL_FABRIC_HOST_ID: 'dial-hermes-control', DIAL_SSH_DIR: tmp });
    expect(r.out).toMatch(/KEY\s+ABSENT/);
    expect(r.out).toMatch(/CONFIG\s+ABSENT/);
  });

  it('pins IdentitiesOnly, without which ssh may offer an unrestricted key instead', () => {
    expect(fs.readFileSync(PEER, 'utf8')).toMatch(/IdentitiesOnly yes/);
  });

  it('never moves a private key between hosts', () => {
    const body = fs.readFileSync(PEER, 'utf8');
    expect(body).toMatch(/private half stays here/);
    expect(body).not.toMatch(/scp .*\$KEY[^.]/);
  });
});
