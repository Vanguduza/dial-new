import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = path.join(ROOT, 'deploy/oracle/provisioning');
const FABRIC = path.join(ROOT, 'deploy/oracle/resource-fabric');

const read = (f) => fs.readFileSync(path.join(P, f), 'utf8');
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', timeout: 60_000, ...opts });

let rendered;
function renderCloudInit() {
  rendered ??= sh('./render-cloud-init.sh', [], { cwd: P });
  return rendered;
}

// pyyaml is present in this environment; the renderer itself does not depend on it.
function parseYaml(text) {
  const tmp = path.join(os.tmpdir(), `ci-${process.pid}-${Math.random().toString(36).slice(2)}.yaml`);
  fs.writeFileSync(tmp, text);
  try {
    return JSON.parse(sh('python3', ['-c',
      'import sys,yaml,json; json.dump(yaml.safe_load(open(sys.argv[1])), sys.stdout)', tmp]));
  } finally { fs.rmSync(tmp, { force: true }); }
}

describe('cloud-init rendering', () => {
  it('produces a valid YAML document', () => {
    const doc = parseYaml(renderCloudInit());
    expect(doc.hostname).toBe('oracle-admin');
    expect(doc.ssh_pwauth).toBe(false);
    expect(doc.disable_root).toBe(true);
  });

  // Regression guard. The first renderer used `awk -v`, which interprets backslash
  // escapes: every `\n` in bootstrap.sh's printf formats became a real newline,
  // breaking the block-scalar indentation and producing invalid YAML. The embedded
  // copy must be byte-identical to the source.
  it('embeds bootstrap.sh byte-identically', () => {
    const doc = parseYaml(renderCloudInit());
    const embedded = doc.write_files.find((f) => f.path.endsWith('bootstrap.sh'));
    expect(embedded).toBeTruthy();
    expect(embedded.permissions).toBe('0755');
    expect(embedded.content).toBe(read('bootstrap.sh'));
  });

  it('carries the authorized public key and no private key material', () => {
    const doc = parseYaml(renderCloudInit());
    const keys = doc.users[0].ssh_authorized_keys;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(read('authorized_key.pub').trim());
    expect(renderCloudInit()).not.toMatch(/PRIVATE KEY/);
  });

  it('leaves no unsubstituted placeholder', () => {
    expect(renderCloudInit()).not.toMatch(/@@[A-Z_]+@@/);
  });

  it('sets a key-only SSH policy via a drop-in, never replacing sshd_config', () => {
    const doc = parseYaml(renderCloudInit());
    const dropin = doc.write_files.find((f) => f.path === '/etc/ssh/sshd_config.d/99-oracle-admin-recovery.conf');
    expect(dropin).toBeTruthy();
    expect(dropin.content).toMatch(/^PasswordAuthentication no$/m);
    expect(dropin.content).toMatch(/^PermitRootLogin no$/m);
    expect(dropin.content).toMatch(/^PubkeyAuthentication yes$/m);
    expect(doc.write_files.some((f) => f.path === '/etc/ssh/sshd_config')).toBe(false);
  });

  it('brings SSH and the Oracle agent up before the best-effort bootstrap', () => {
    const doc = parseYaml(renderCloudInit());
    const flat = doc.runcmd.map((c) => (Array.isArray(c) ? c.join(' ') : c));
    const ssh = flat.findIndex((c) => c.includes('enable --now ssh') || c.includes('enable --now ssh'));
    const agent = flat.findIndex((c) => c.includes('oracle-cloud-agent'));
    const boot = flat.findIndex((c) => c.includes('bootstrap.sh'));
    expect(ssh).toBeGreaterThanOrEqual(0);
    expect(agent).toBeGreaterThanOrEqual(0);
    expect(boot).toBeGreaterThan(ssh);
    expect(boot).toBeGreaterThan(agent);
    // A bootstrap failure must never fail the boot and strand the recovery floor.
    expect(flat[boot]).toMatch(/\|\|/);
  });

  it('fits well inside the 32 KB instance-metadata limit once gzipped', () => {
    const gz = execFileSync('gzip', ['-9', '-c'], { input: renderCloudInit(), maxBuffer: 1 << 24 });
    expect(Math.ceil(gz.length / 3) * 4).toBeLessThan(30_000);
  });
});

describe('bootstrap phase contract', () => {
  const src = () => read('bootstrap.sh');

  it('is syntactically valid', () => {
    expect(() => sh('bash', ['-n', path.join(P, 'bootstrap.sh')])).not.toThrow();
  });

  it('runs phases 4-7 as soft phases so they cannot undo the recovery floor', () => {
    const s = src();
    for (const phase of ['3', '4', '5', '6', '7']) {
      expect(s).toMatch(new RegExp(`^soft ${phase} phase${phase}$`, 'm'));
    }
    // Phases 1 and 2 are NOT soft: they are the floor and are handled explicitly.
    expect(s).not.toMatch(/^soft 1 /m);
    expect(s).not.toMatch(/^soft 2 /m);
  });

  it('validates sshd config before restarting and reverts a bad drop-in', () => {
    const s = src();
    expect(s).toMatch(/if ! sshd -t/);
    expect(s).toMatch(/rm -f "\$dropin"/);
    expect(s.indexOf('sshd -t')).toBeLessThan(s.indexOf('systemctl enable --now ssh'));
  });

  it('allows SSH through the firewall rather than enabling a firewall blindly', () => {
    const s = src();
    expect(s).toMatch(/ufw allow OpenSSH/);
    expect(s).not.toMatch(/ufw --force enable/);
  });

  it('pins the Commander package to an exact version, never a floating tag', () => {
    const s = src();
    expect(s).toMatch(/@wonderwhy-er\/desktop-commander@\d+\.\d+\.\d+/);
    expect(s).not.toMatch(/desktop-commander@latest/);
  });

  it('installs no DIAL application workload, database or container runtime', () => {
    const s = src();
    expect(s).not.toMatch(/\bdocker\b/i);
    expect(s).not.toMatch(/postgres|mysql|redis/i);
  });

  it('never writes secrets into the git checkout', () => {
    const s = src();
    expect(s).toMatch(/\.desktop-commander-device/);
    // Credentials live under $HOME, not under /opt/dial-recovery/dial-new.
    expect(s).not.toMatch(/dial-new\/.*device\.json/);
  });
});

describe('Hermes safety boundary', () => {
  it('refuses protected hosts and accepts only oracle-admin', () => {
    // lib.sh turns on `set -e`, and `die` exits, so `set +e` has to come AFTER
    // sourcing or the guard's own refusal kills the harness shell.
    const guard = (name) =>
      sh('bash', ['-c',
        `source "${P}/lib.sh" >/dev/null 2>&1; set +e; ` +
        `out="$(assert_target_is_oracle_admin "${name}" 2>&1)"; printf '%s\\nexit=%s\\n' "$out" "$?"`]);
    expect(guard('dial-hermes-control')).toMatch(/REFUSED/);
    expect(guard('oracle-admin-v2')).toMatch(/REFUSED/);
    expect(guard('oracle-admin')).toMatch(/exit=0/);
  });

  it('never mutates a shared security list, route table or the Hermes instance', () => {
    for (const f of ['10-network-preflight.sh', '20-launch-oracle-admin.sh']) {
      const s = read(f);
      expect(s).not.toMatch(/security-list (update|add|remove)/);
      expect(s).not.toMatch(/route-table update/);
      expect(s).not.toMatch(/instance (terminate|action|update).*hermes/i);
    }
  });

  it('applies ingress through an NSG bound to the oracle-admin VNIC', () => {
    const preflight = read('10-network-preflight.sh');
    expect(preflight).toMatch(/nsg create/);
    expect(preflight).toMatch(/nsg rules add/);
    expect(read('20-launch-oracle-admin.sh')).toMatch(/--nsg-ids/);
  });

  it('stops rather than editing a shared route table that lacks a default route', () => {
    expect(read('10-network-preflight.sh')).toMatch(/forbidden by section 19 — STOP/);
  });
});

describe('instance launch hardening', () => {
  const s = () => read('20-launch-oracle-admin.sh');

  it('disables legacy IMDSv1 and enables in-transit encryption', () => {
    expect(s()).toMatch(/areLegacyImdsEndpointsDisabled["']?\s*:\s*true/);
    expect(s()).toMatch(/--is-pv-encryption-in-transit-enabled true/);
  });

  it('enables Run Command, Monitoring and Bastion and disables heavy agents', () => {
    const t = s();
    for (const p of ['Compute Instance Run Command', 'Compute Instance Monitoring', 'Bastion']) {
      expect(t).toMatch(new RegExp(`${p}[^\\n]*ENABLED`));
    }
    for (const p of ['WebLogic Management Service', 'Management Agent', 'Vulnerability Scanning',
                     'Oracle Java Management Service', 'Fleet Application Management Service']) {
      expect(t).toMatch(new RegExp(`${p}[^\\n]*DISABLED`));
    }
  });

  it('uses the Always Free E2 micro shape, never an Ampere A1 shape', () => {
    expect(s()).toMatch(/SHAPE=VM\.Standard\.E2\.1\.Micro/);
    expect(s()).not.toMatch(/A1\.Flex/);
  });

  it('excludes Minimal images and refuses to clobber an existing oracle-admin', () => {
    expect(s()).toMatch(/Minimal/);
    expect(s()).toMatch(/already exists/);
  });
});

describe('Desktop Commander transport and health', () => {
  it('opens no inbound port and runs as a non-root user unit', () => {
    const unit = read('systemd/dial-commander-remote.service');
    expect(unit).toMatch(/desktop-commander remote/);
    expect(unit).not.toMatch(/ListenStream|ListenPort|--port/);
    expect(unit).not.toMatch(/^User=root/m);
    // Inert until the owner has actually authorized the device.
    expect(unit).toMatch(/ConditionPathExists=.*device\.json/);
    // Bounded on a 1 GB host.
    expect(unit).toMatch(/MemoryMax=/);
    expect(unit).toMatch(/Slice=dial-recovery\.slice/);
  });

  // The core honesty property: an unpaired, unreachable Commander must never
  // report GREEN. The probe omits criteria it cannot establish, and doctor.mjs
  // reads an absent criterion as UNVERIFIED.
  it('never reports GREEN client criteria without an execution proof', () => {
    const out = sh('bash', [path.join(P, 'commander-probe.sh')],
      { env: { ...process.env, COMMANDER_PROOF: '/nonexistent/proof.json', HOME: os.tmpdir() } });
    expect(out).not.toMatch(/PING_RESPONDS=GREEN/);
    expect(out).not.toMatch(/COMMAND_EXECUTES=GREEN/);
  });

  it('drives doctor.mjs to a non-GREEN verdict when nothing is proven', async () => {
    const { probeDesktopCommander } = await import(path.join(FABRIC, 'doctor.mjs'));
    const result = probeDesktopCommander({ probeCmd: `COMMANDER_PROOF=/nonexistent HOME=${os.tmpdir()} bash ${path.join(P, 'commander-probe.sh')}` });
    expect(result.state).not.toBe('GREEN');
    expect(result.criteria.PING_RESPONDS).toBe('UNVERIFIED');
    expect(result.criteria.COMMAND_EXECUTES).toBe('UNVERIFIED');
  });

  it('records a proof that distinguishes a Commander call from a local shell', () => {
    const proof = path.join(os.tmpdir(), `proof-${process.pid}.json`);
    try {
      sh('bash', [path.join(P, 'commander-record-proof.sh')],
        { env: { ...process.env, COMMANDER_PROOF: proof } });
    } catch { /* exits 3 when not invoked through Commander, which is the point */ }
    const parsed = JSON.parse(fs.readFileSync(proof, 'utf8'));
    expect(parsed.executed_via).not.toBe('desktop-commander');
    expect(parsed.evidence).toHaveProperty('ping');
    expect(parsed.evidence).toHaveProperty('filesystem_read');
    fs.rmSync(proof, { force: true });
  });
});

describe('fabric inventory agreement', () => {
  it('pins the private IP the fabric already records for oracle-admin', () => {
    const hosts = JSON.parse(fs.readFileSync(path.join(FABRIC, 'hosts.json'), 'utf8'));
    const self = hosts.hosts.find((h) => h.host_id === 'oracle-admin');
    expect(self).toBeTruthy();
    // The brief says "automatic"; the fabric resolves recovery peers by this exact
    // address, so repository truth wins and the preflight pins it.
    expect(read('10-network-preflight.sh')).toContain(self.private_ip);
  });

  it('installs oracle-admin as a RECOVERY peer with the roles the fabric expects', () => {
    const hosts = JSON.parse(fs.readFileSync(path.join(FABRIC, 'hosts.json'), 'utf8'));
    const self = hosts.hosts.find((h) => h.host_id === 'oracle-admin');
    expect(self.roles).toContain('RECOVERY');
    expect(read('bootstrap.sh')).toMatch(/install-recovery-peer\.sh/);
  });

  it('does not start the recovery agent before peer known_hosts are seeded', () => {
    const s = read('bootstrap.sh');
    expect(s).toMatch(/staged, not started/);
    expect(s).not.toMatch(/enable --now dial-recovery-agent\.service/);
  });
});

describe('certification honesty', () => {
  it('reports RED, not GREEN, when no evidence has been collected', () => {
    const out = path.join(os.tmpdir(), `cert-${process.pid}.json`);
    try {
      sh('node', [path.join(P, '30-certify.mjs'), '--out', out,
                  '--hermes-before', '/nonexistent', '--hermes-after', '/nonexistent'],
         { env: { ...process.env, DIAL_OCI_COMPARTMENT: '' } });
    } catch { /* non-zero exit is expected for a RED verdict */ }
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(report.certification.state).toBe('RED');
    expect(report.hermes_control_untouched.state).toBe('unverified');
    expect(report.certification.blockers.length).toBeGreaterThan(0);
    fs.rmSync(out, { force: true });
  });
});
