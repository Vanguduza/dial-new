import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HC = path.join(ROOT, 'deploy/netcup/hermes-control');
const WORKFLOW = path.join(ROOT, '.github/workflows/netcup-admin-oidc.yml');
const TENANCY = 'ocid1.tenancy.oc1..aaaaexpectedtenancy';
const OTHER_TENANCY = 'ocid1.tenancy.oc1..aaaaattackertenancy';
const USER = 'ocid1.user.oc1..aaaaownersession';

// A fake OCI CLI. Every call is appended to calls.log; IAM objects persist in iam/ so a
// second run sees what the first one created, which is what idempotence is about.
const FAKE_OCI = fs.readFileSync(path.join(ROOT, 'tests/fixtures/fake-oci-cli.sh'), 'utf8');

function jwt(claims) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256' })}.${b(claims)}.c2ln`;
}

let dir;
function setup({ compartment = TENANCY, session = true, tenant = TENANCY, expIn = 3000 } = {}) {
  const bin = path.join(dir, 'bin');
  const home = path.join(dir, 'home');
  const state = path.join(dir, 'state');
  for (const d of [bin, home, path.join(state, 'iam'), path.join(home, '.oci')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(bin, 'oci'), FAKE_OCI, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'hostname'), '#!/bin/sh\necho dial-control\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sudo'), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/bin/sh\necho "systemctl $*" >>"$FAKE_STATE/systemctl.log"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\n:\n', { mode: 0o755 });
  const lib = path.join(dir, 'lib');
  fs.mkdirSync(lib, { recursive: true });
  fs.copyFileSync(path.join(HC, 'prepare-oci-recovery.sh'), path.join(lib, 'prepare-oci-recovery.sh'));
  if (session) {
    const sdir = path.join(home, '.oci/edge-session/DIAL_EDGE_SESSION');
    fs.mkdirSync(sdir, { recursive: true });
    fs.writeFileSync(path.join(sdir, 'token'),
      jwt({ sub: USER, tenant, exp: Math.floor(Date.now() / 1000) + expIn }));
    fs.writeFileSync(path.join(home, '.oci/edge-session-config'), '[DIAL_EDGE_SESSION]\nsecurity_token_file=x\n');
  }
  return {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: home,
      FAKE_STATE: state,
      FAKE_COMPARTMENT: compartment,
      DIAL_OCI_AS_USER: '0',
      DIAL_OCI_ADMIN_HOME: home,
      DIAL_CONTROL_LIB: lib,
      DIAL_OCI_EDGE_STATE: path.join(state, 'edge'),
      DIAL_OCI_ESTATE_FILE: path.join(state, 'oracle-estate.env'),
      DIAL_OCI_READY_MARKER: path.join(state, 'github-oci-ready'),
    },
    home, state,
  };
}

function run(ctx, ...args) {
  const r = spawnSync('bash', [path.join(HC, 'oci-edge-login.sh'), ...args], { env: ctx.env, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const calls = (ctx) => (fs.existsSync(path.join(ctx.state, 'calls.log')) ? fs.readFileSync(path.join(ctx.state, 'calls.log'), 'utf8') : '');
const sessionGone = (ctx) =>
  !fs.existsSync(path.join(ctx.home, '.oci/edge-session')) && !fs.existsSync(path.join(ctx.home, '.oci/edge-session-config'));

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-edge-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('oci-edge-login finish', () => {
  it('turns a verified session into a dedicated least-privilege recovery key, then destroys the session', () => {
    const ctx = setup();
    const r = run(ctx, 'finish', TENANCY);
    expect(r.err).not.toMatch(/REFUSED/);
    expect(r.code).toBe(0);
    expect(r.out).toContain('OCI_EDGE_SESSION=VERIFIED');
    expect(r.out).toContain('api_key=UPLOADED');
    expect(r.out).toContain('OCI_RECOVERY_DURABLE_PROBE=GREEN');
    expect(r.out).toContain('OCI_EDGE_LOGIN=FINISHED');

    const log = calls(ctx);
    // The durable probe and final discovery use the dedicated user's config, not the session.
    expect(log).toMatch(/--config-file \S+\/\.oci\/config --profile DEFAULT compute instance list/);
    expect(log).toMatch(/--config-file \S+\/\.oci\/config --profile DEFAULT instance-agent command list/);
    expect(log).toMatch(/--auth security_token iam user update-user-capabilities .*--can-use-console-password false/);
    expect(log).toContain('session terminate');

    // Root compartment: policy grammar is "in tenancy", never "compartment id <tenancy ocid>".
    const statements = JSON.parse(fs.readFileSync(path.join(ctx.state, 'iam/policy-statements'), 'utf8'));
    expect(statements).toHaveLength(6);
    // Converge run #181: with only "manage instance-agent-command-family", execution list worked but
    // execution get (exit code and output) returned 404 for an execution that exists.
    expect(statements).toContain('Allow group dial-netcup-recovery to read instance-agent-command-execution-family in tenancy');
    expect(statements.join('\n')).not.toContain('compartment id ocid1.tenancy');
    expect(statements).toContain("Allow group dial-netcup-recovery to use instances in tenancy where request.permission = 'INSTANCE_POWER_ACTIONS'");
    expect(statements.some((s) => /manage all-resources|manage instance-family/.test(s))).toBe(false);

    const home = ctx.home;
    const config = fs.readFileSync(path.join(home, '.oci/config'), 'utf8');
    expect(config).toContain('user=ocid1.user.oc1..created');
    expect(config).toContain(`tenancy=${TENANCY}`);
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(true);
    expect(fs.readFileSync(path.join(ctx.state, 'oracle-estate.env'), 'utf8')).toContain(`DIAL_OCI_COMPARTMENT=${TENANCY}`);
    expect(sessionGone(ctx)).toBe(true);
    // Nothing secret reaches stdout, which the workflow publishes.
    expect(r.out + r.err).not.toMatch(/PRIVATE KEY|eyJ/);
  });

  it('scopes the policy to a named compartment when the estate is not in the root', () => {
    const ctx = setup({ compartment: 'ocid1.compartment.oc1..estate' });
    expect(run(ctx, 'finish', TENANCY).code).toBe(0);
    const statements = JSON.parse(fs.readFileSync(path.join(ctx.state, 'iam/policy-statements'), 'utf8'));
    expect(statements[1]).toBe('Allow group dial-netcup-recovery to read instance-family in compartment id ocid1.compartment.oc1..estate');
    expect(statements[0]).toBe('Allow group dial-netcup-recovery to inspect compartments in tenancy');
  });

  it('is idempotent: a second run creates nothing and does not re-upload the key', () => {
    const ctx = setup();
    expect(run(ctx, 'finish', TENANCY).code).toBe(0);
    fs.writeFileSync(path.join(ctx.state, 'calls.log'), '');
    const again = setup();            // fresh session, same IAM state directory
    const r = run(again, 'finish', TENANCY);
    expect(r.code).toBe(0);
    expect(r.out).toContain('api_key=ALREADY_REGISTERED');
    expect(r.out).toContain('iam_policy=RECONCILED');
    expect(calls(again)).not.toMatch(/ create /);
    expect(calls(again)).not.toMatch(/api-key upload/);
  });

  it('refuses and destroys a session that belongs to another tenancy before any IAM call', () => {
    const ctx = setup({ tenant: OTHER_TENANCY });
    const r = run(ctx, 'finish', TENANCY);
    expect(r.code).toBe(22);
    expect(r.err).toContain('different tenancy');
    expect(calls(ctx)).not.toMatch(/iam (user|group|policy|dynamic-group)/);
    expect(sessionGone(ctx)).toBe(true);
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(false);
  });

  it('refuses a session about to expire rather than failing half-way through IAM', () => {
    const ctx = setup({ expIn: 30 });
    const r = run(ctx, 'finish', TENANCY);
    expect(r.code).toBe(23);
    expect(calls(ctx)).not.toMatch(/iam (user|group|policy)/);
    expect(sessionGone(ctx)).toBe(true);
  });

  it('reports ABSENT without a session or a running bridge, and never marks recovery ready', () => {
    const ctx = setup({ session: false });
    const r = run(ctx, 'finish', TENANCY);
    expect(r.code).toBe(21);
    expect(r.out).toContain('OCI_EDGE_SESSION=ABSENT');
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(false);
  });

  it('records van-trading-core and the separate dial-hermes-control source, and enrolls both for Run Command', () => {
    const ctx = setup();
    expect(run(ctx, 'finish', TENANCY).code).toBe(0);
    const estate = fs.readFileSync(path.join(ctx.state, 'oracle-estate.env'), 'utf8');
    expect(estate).toContain('VAN_TRADING_CORE_OCID=ocid1.instance.oc1..a1van');
    expect(estate).toContain('DIAL_HERMES_CONTROL_SOURCE_OCID=ocid1.instance.oc1..a1src');
    const rule = fs.readFileSync(path.join(ctx.state, 'iam/dg-rule'), 'utf8');
    expect(rule).toContain("instance.id = 'ocid1.instance.oc1..a1van'");
    expect(rule).toContain("instance.id = 'ocid1.instance.oc1..a1src'");
  });

  it('works once the source has been terminated: van-trading-core stays, the source drops out', () => {
    const ctx = setup();
    ctx.env.FAKE_NO_SOURCE = '1';
    expect(run(ctx, 'finish', TENANCY).code).toBe(0);
    const estate = fs.readFileSync(path.join(ctx.state, 'oracle-estate.env'), 'utf8');
    expect(estate).toContain('VAN_TRADING_CORE_OCID=ocid1.instance.oc1..a1van');
    expect(estate).toMatch(/^DIAL_HERMES_CONTROL_SOURCE_OCID=$/m);
    expect(fs.readFileSync(path.join(ctx.state, 'iam/dg-rule'), 'utf8')).not.toContain('a1src');
  });

  it('keeps the session and lists candidates when two van-trading-core instances match, without touching IAM', () => {
    const ctx = setup();
    ctx.env.FAKE_DUP_VAN = '1';
    const r = run(ctx, 'finish', TENANCY);
    expect(r.code).toBe(27);
    expect(r.out).toContain('OCI_EDGE_SESSION=KEPT_FOR_RETRY');
    expect(r.err).toContain('CANDIDATE van-trading-core ocid=ocid1.instance.oc1..a1van name=van-trading-core');
    expect(r.err).toContain('CANDIDATE van-trading-core ocid=ocid1.instance.oc1..a1van2 name=van-trading-core');
    expect(calls(ctx)).not.toMatch(/iam (user|group|policy|dynamic-group)/);
    expect(calls(ctx)).not.toContain('session terminate');
    expect(sessionGone(ctx)).toBe(false);
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(false);
  });

  it('finishes with the owner-pinned van-trading-core on the retry, reusing the kept session', () => {
    const ctx = setup();
    ctx.env.FAKE_DUP_VAN = '1';
    expect(run(ctx, 'finish', TENANCY).code).toBe(27);
    const r = run(ctx, 'finish', TENANCY, 'af-johannesburg-1', 'ocid1.instance.oc1..a1van2');
    expect(r.err).not.toMatch(/REFUSE/);
    expect(r.code).toBe(0);
    expect(r.out).toContain('OCI_EDGE_LOGIN=FINISHED');
    expect(fs.readFileSync(path.join(ctx.state, 'oracle-estate.env'), 'utf8')).toContain('VAN_TRADING_CORE_OCID=ocid1.instance.oc1..a1van2');
    expect(sessionGone(ctx)).toBe(true);
  });

  it('refuses a pinned OCID that is not a van-trading-core candidate, keeping the verified session for the retry', () => {
    const ctx = setup();
    ctx.env.FAKE_DUP_VAN = '1';
    const r = run(ctx, 'finish', TENANCY, 'af-johannesburg-1', 'ocid1.instance.oc1..a1src');
    expect(r.code).toBe(25);
    expect(r.err).toContain('pinned van-trading-core OCID');
    expect(calls(ctx)).not.toMatch(/iam (user|group|policy|dynamic-group)/);
    expect(sessionGone(ctx)).toBe(false);
  });

  it('keeps the session and asks for an email when an identity domain rejects the user, without claiming CREATED', () => {
    const ctx = setup();
    ctx.env.FAKE_REQUIRE_EMAIL = '1';
    const r = run(ctx, 'finish', TENANCY);
    expect(r.code).toBe(40);
    expect(r.out).toContain('OCI_EDGE_SESSION=KEPT_FOR_RETRY');
    expect(r.out).toContain('OWNER_INPUT_REQUIRED');
    expect(r.err).not.toContain('iam_user=CREATED');
    expect(sessionGone(ctx)).toBe(false);
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(false);
  });

  it('creates the recovery user with the supplied primary email and finishes on the retry', () => {
    const ctx = setup();
    ctx.env.FAKE_REQUIRE_EMAIL = '1';
    expect(run(ctx, 'finish', TENANCY).code).toBe(40);
    const r = run(ctx, 'finish', TENANCY, 'af-johannesburg-1', '', 'owner+dial-netcup-recovery@example.com');
    expect(r.err).not.toMatch(/REFUSE/);
    expect(r.code).toBe(0);
    expect(r.out).toContain('OCI_EDGE_LOGIN=FINISHED');
    expect(fs.readFileSync(path.join(ctx.state, 'iam/user-email'), 'utf8').trim()).toBe('owner+dial-netcup-recovery@example.com');
    expect(sessionGone(ctx)).toBe(true);
  });

  it('rejects a malformed recovery user email before touching OCI', () => {
    const ctx = setup();
    expect(run(ctx, 'finish', TENANCY, 'af-johannesburg-1', '', 'x@y.com; rm -rf /').code).toBe(2);
    expect(calls(ctx)).toBe('');
  });

  it('retries the final durable discovery through IAM propagation instead of reporting 0 instances', () => {
    const ctx = setup();
    ctx.env.FAKE_DURABLE_LIST_FAILS = '3';
    const r = run(ctx, 'finish', TENANCY);
    expect(r.err).not.toContain('found 0');
    expect(r.err).toContain('NotAuthorizedOrNotFound');
    expect(r.code).toBe(0);
    expect(r.out).toContain('OCI_EDGE_LOGIN=FINISHED');
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(true);
  });

  it('reports the real OCI error when durable discovery never recovers', () => {
    const ctx = setup();
    ctx.env.FAKE_DURABLE_LIST_FAILS = '1000';
    const r = run(ctx, 'finish', TENANCY);
    expect(r.code).toBe(26);
    expect(r.err).toContain('"code": "NotAuthorizedOrNotFound"');
    expect(r.err).toContain('run rediscover_oci_estate');
    expect(r.err).not.toContain('found 0');
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(false);
  });

  it('rediscover completes the estate with the durable key alone, no session needed', () => {
    const ctx = setup();
    ctx.env.FAKE_DURABLE_LIST_FAILS = '1000';
    expect(run(ctx, 'finish', TENANCY).code).toBe(26);
    ctx.env.FAKE_DURABLE_LIST_FAILS = '0';
    const r = run(ctx, 'rediscover');
    expect(r.err).not.toMatch(/REFUSE/);
    expect(r.code).toBe(0);
    expect(r.out).toContain('OCI_RECOVERY_REDISCOVERY=GREEN');
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(true);
    expect(calls(ctx)).not.toMatch(/rediscover.*security_token/);
  });

  it('refuses rediscover before any durable key exists', () => {
    const ctx = setup({ session: false });
    const r = run(ctx, 'rediscover');
    expect(r.code).toBe(21);
  });

  it('keeps a verified session when a later IAM step fails, so the retry needs no new login', () => {
    const ctx = setup();
    expect(run(ctx, 'finish', TENANCY).code).toBe(0);      // policy exists now
    const again = setup();
    again.env.FAKE_DURABLE_LIST_FAILS = '1000';            // a failure after verification
    expect(run(again, 'finish', TENANCY).code).toBe(26);
    expect(sessionGone(again)).toBe(false);
    again.env.FAKE_DURABLE_LIST_FAILS = '0';
    fs.writeFileSync(path.join(again.state, 'durable-list-fails'), '0');
    const r = run(again, 'finish', TENANCY);
    expect(r.code).toBe(0);
    expect(r.out).toContain('iam_policy=RECONCILED');
    expect(sessionGone(again)).toBe(true);
  });

  it('enables Run Command on every estate VM with the owner session, preserving other plugins', () => {
    const ctx = setup();
    expect(run(ctx, 'finish', TENANCY).code).toBe(0);           // estate inventory exists
    const again = setup();
    const w = (id, cfg) => fs.writeFileSync(path.join(again.state, `agent-${id}.json`), JSON.stringify(cfg));
    w('ocid1.instance.oc1..admin', { 'is-management-disabled': false, 'are-all-plugins-disabled': false,
      'plugins-config': [{ name: 'Compute Instance Run Command', 'desired-state': 'ENABLED' }] });
    w('ocid1.instance.oc1..vekl', { 'is-management-disabled': true, 'are-all-plugins-disabled': false,
      'plugins-config': [{ name: 'Bastion', 'desired-state': 'ENABLED' }, { name: 'Compute Instance Run Command', 'desired-state': 'ENABLED' }] });
    w('ocid1.instance.oc1..a1src', { 'is-management-disabled': false, 'plugins-config': [{ name: 'Bastion', 'desired-state': 'ENABLED' }] });
    const r = run(again, 'enable-run-command', TENANCY);
    expect(r.err).not.toMatch(/REFUSED/);
    expect(r.code).toBe(0);
    expect(r.out).toContain('run_command_oracle_admin=ALREADY_ENABLED');
    expect(r.out).toContain('run_command_vekl_worker=ENABLED');
    expect(r.out).toContain('run_command_van_trading_core=ENABLED');
    expect(r.out).toContain('run_command_dial_hermes_control=ENABLED');
    const vekl = JSON.parse(fs.readFileSync(path.join(again.state, 'agent-update-ocid1.instance.oc1..vekl.json'), 'utf8'));
    expect(vekl.isManagementDisabled).toBe(false);
    expect(vekl.pluginsConfig).toContainEqual({ name: 'Bastion', desiredState: 'ENABLED' });
    expect(vekl.pluginsConfig).toContainEqual({ name: 'Compute Instance Run Command', desiredState: 'ENABLED' });
    const src = JSON.parse(fs.readFileSync(path.join(again.state, 'agent-update-ocid1.instance.oc1..a1src.json'), 'utf8'));
    expect(src.pluginsConfig).toContainEqual({ name: 'Bastion', desiredState: 'ENABLED' });
    expect(fs.existsSync(path.join(again.state, 'agent-update-ocid1.instance.oc1..admin.json'))).toBe(false);
    expect(sessionGone(again)).toBe(true);
  });

  it('refuses enable-run-command with a session for another tenancy', () => {
    const ctx = setup({ tenant: OTHER_TENANCY });
    const r = run(ctx, 'enable-run-command', TENANCY);
    expect(r.code).toBe(22);
    expect(calls(ctx)).not.toContain('compute instance update');
    expect(sessionGone(ctx)).toBe(true);
  });

  it('rejects a malformed tenancy argument', () => {
    const ctx = setup();
    expect(run(ctx, 'finish', 'ocid1.tenancy.oc1..x; rm -rf /').code).toBe(2);
    expect(calls(ctx)).toBe('');
  });

  it('never writes the recovery-ready marker from session-auth discovery alone', () => {
    const ctx = setup();
    const r = spawnSync('bash', [path.join(HC, 'prepare-oci-recovery.sh'), 'discover'], {
      env: { ...ctx.env, OCI_RECOVERY_DISCOVERY_AUTH: 'session', OCI_CLI_AUTH: 'security_token',
        OCI_CLI_CONFIG_FILE: path.join(ctx.home, '.oci/edge-session-config'), OCI_RECOVERY_TENANCY_OCID: TENANCY },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('OCI_RECOVERY_DISCOVERY=INVENTORY_ONLY');
    expect(fs.existsSync(path.join(ctx.state, 'github-oci-ready'))).toBe(false);
  });
});

describe('admin workflow OCI login posture', () => {
  const wf = fs.readFileSync(WORKFLOW, 'utf8');
  it('is manual-only: no push trigger can restart the bridge and kill an in-progress login', () => {
    expect(wf).not.toMatch(/^\s*push:/m);
    expect(wf).not.toContain('edge-auth-bootstrap:');
  });
  it('exposes the login lifecycle as bounded operations that require the expected tenancy to finish', () => {
    for (const op of ['start_oci_edge_login', 'oci_edge_login_status', 'finish_oci_edge_login', 'abort_oci_edge_login']) {
      expect(wf).toContain(op);
    }
    expect(wf).toContain('oci-edge-login.sh /usr/local/lib/dial-control/oci-edge-login.sh 0755');
    expect(wf).toMatch(/finish_oci_edge_login\)\n\s+\[\[ "\$OCI_TENANCY_OCID" =~/);
  });
  it('stages refreshed helpers with their real extension last, so node --check accepts the .mjs', () => {
    expect(wf).toContain('stage="${dst%.*}.tmp.${dst##*.}"');
    expect(wf).not.toContain("'$dst.tmp'");
  });
});
