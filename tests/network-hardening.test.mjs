import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoDir = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoDir, rel), 'utf8');

describe('Netcup and Oracle network hardening', () => {
  it('makes Dial Control SSH key-only and reachable only over the overlay, behind a default-deny firewall', () => {
    const s = read('deploy/netcup/hermes-control/harden-netcup-host.sh');
    for (const line of ['PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'PermitRootLogin no']) expect(s).toContain(line);
    expect(s).toContain('ufw --force default deny incoming');
    expect(s).toMatch(/ufw allow in on "\$WG_IF" from "\$WG_NET" to any port 22 proto tcp/);
    expect(s).toMatch(/for r in OpenSSH 22\/tcp 22 9443\/tcp; do ufw --force delete allow/);
    // No public SSH allowance anywhere in the Netcup control path.
    for (const rel of ['deploy/netcup/hermes-control/harden-netcup-host.sh', 'deploy/netcup/hermes-control/postboot-converge.sh']) {
      expect(read(rel)).not.toMatch(/ufw allow (OpenSSH|22\b)/);
    }
    expect(read('deploy/netcup/hermes-control/postboot-converge.sh')).toContain('harden-netcup-host.sh" apply');
  });

  it('restricts Oracle peer SSH to the overlay, the VNIC subnet and Dial Control, behind an automatic rollback', () => {
    const s = read('deploy/oracle/resource-fabric/harden-oracle-peer.sh');
    const arm = s.indexOf('systemd-run --unit="$ROLLBACK_UNIT" --on-active=180');
    const firstChange = s.indexOf('while spec="$(iptables -S INPUT');
    expect(arm).toBeGreaterThan(0);
    expect(firstChange).toBeGreaterThan(arm);
    expect(s).toContain('"$TAG overlay"');
    expect(s).toContain('"$TAG vcn-subnet/bastion"');
    expect(s).toContain('"$TAG netcup-direct"');
    expect(s).toContain('PermitRootLogin no');
    expect(s).toMatch(/systemctl mask rpcbind\.socket/);
  });

  it('confirms a peer only after a fresh overlay login and never touches the migration source by default', () => {
    const s = read('deploy/netcup/hermes-control/harden-oracle-estate.sh');
    expect(s).toContain('ControlMaster=no');
    expect(s).toMatch(/grep -vx "\$MIGRATION_SOURCE"/);
    const apply = s.indexOf('dial-harden-peer apply');
    const confirm = s.indexOf('dial-harden-peer confirm');
    expect(confirm).toBeGreaterThan(apply);
  });

  it('proves alternate paths per peer and demands two independent non-overlay paths, never faking bastion', () => {
    const s = read('deploy/netcup/hermes-control/alternate-paths.sh');
    expect(s).toMatch(/length\) >= 2 and \.overlay=="PASS"/);
    expect(s).toContain('HostKeyAlias');
    expect(s).toMatch(/select\(\."lifecycle-state"=="ACTIVE"\)\] \| length > 0/);
    expect(s).toContain('echo OWNER_ACTION_REQUIRED');
  });

  it('waits out the Run Command agent poll interval instead of failing a healthy peer', () => {
    // 2026-09-24: vekl-worker's hostname command succeeded after 3m22s; the old 150 s probe window called it FAIL.
    const s = read('deploy/netcup/hermes-control/alternate-paths.sh');
    const wait = Number(s.match(/RC_WAIT_SECONDS="\$\{DIAL_RC_WAIT_SECONDS:-(\d+)\}"/)[1]);
    expect(wait).toBeGreaterThanOrEqual(480);
    const verify = s.slice(s.indexOf('verify() {'));
    expect(verify.indexOf('run_command_create')).toBeGreaterThan(0);
    expect(verify.indexOf('run_command_await')).toBeGreaterThan(verify.indexOf('run_command_create'));
    const wf = read('.github/workflows/oracle-recovery.yml');
    expect(wf).not.toMatch(/sleep (30|45)\n/);
    expect(wf.match(/for _ in \$\(seq 1 45\); do/g)).toHaveLength(2);
    // status step + receipt, in both the observe and recover jobs
    expect(wf.match(/grep -oE 'ocid1\\.instanceagentcommand\\.\[a-z0-9.-\]\+'/g)).toHaveLength(4);
  });

  it('reinstalls the GitHub recovery helper on every Oracle peer pass', () => {
    const s = read('deploy/netcup/hermes-control/harden-oracle-estate.sh');
    expect(s).toContain('deploy/oracle/recovery/dial-github-recovery.sh');
    expect(s).toMatch(/install -m 0755 -o root -g root \/tmp\/dial-github-recovery \/usr\/local\/bin\/dial-github-recovery/);
    expect(s.indexOf('/usr/local/bin/dial-github-recovery')).toBeLessThan(s.indexOf('if [[ "$MODE" == verify ]]'));
  });

  it('re-roles the retired Hermes source into van-trading-core only after cutover, with VAN captured first', () => {
    const s = read('deploy/netcup/hermes-control/oci-edge-login.sh');
    const op = s.slice(s.indexOf('reimage_source_as_van() {'), s.indexOf('finish() {'));
    // Gates: source retired and a verified path to the old van, before any OCI change.
    expect(op.indexOf('a1-control-retired')).toBeLessThan(op.indexOf('verify_session'));
    expect(op).toContain('old-van-access-verified');
    // Order: consistent VAN capture -> format in place -> Bastion access -> estate swap -> terminate old van.
    const order = ['capture --final', '--source-details', 'create-managed-ssh', 'VAN_TRADING_CORE_OCID=$src', 'terminate --instance-id "$old_van"'].map((x) => op.indexOf(x));
    order.forEach((i) => expect(i).toBeGreaterThan(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Owner instruction: only the Hermes clone and the VAN backup are kept.
    expect(op).toContain('isPreserveBootVolumeEnabled:false');
    expect(op).toContain('--preserve-boot-volume false');
    expect(op).toContain("[[ \"$(jq -r '.data.\"display-name\"' <<<\"$inst\")\" == dial-hermes-control ]]");
    // The E2 rebuild keeps its own fallback volume.
    const rebuild = s.slice(s.indexOf('rebuild_instance() {'), s.indexOf('finish() {'));
    expect(rebuild).toContain('terminate --instance-id "$old" --preserve-boot-volume true');
  });

  it('moves VAN with VAN\'s own installer and qualifier, pinned to an exact commit', () => {
    const s = read('deploy/netcup/hermes-control/rerole-van-trading-core.sh');
    expect(s).toMatch(/VAN_SHA="\$\{VAN_SHA:-[0-9a-f]{40}\}"/);
    expect(s).toContain('deploy/van-trading-core/bootstrap.sh --commit-sha=');
    expect(s).toContain("VAN_EXPECTED_REPOSITORY_SHA='$VAN_SHA'");
    expect(s).toContain('old-services-stopped-at');
    expect(s).toContain('sha256sum -c --quiet SHA256SUMS');
    // The permanent key means "identities rotated" to the estate; only rotation may create it.
    for (const rel of ['deploy/netcup/hermes-control/rerole-van-trading-core.sh', 'deploy/netcup/hermes-control/oci-edge-login.sh']) {
      expect(read(rel)).not.toMatch(/ssh-keygen[^\n]*dial-control-oracle-admin/);
    }
    const peer = read('deploy/oracle/resource-fabric/harden-oracle-peer.sh');
    expect(peer).toContain('-s 10.77.0.1/32 -p tcp --dport 9133');
    const wf = read('.github/workflows/netcup-admin-oidc.yml');
    expect(wf).toContain('reimage-source-as-van-detached');
    expect(wf).toContain('rerole-van-trading-core.sh /usr/local/lib/dial-control/rerole-van-trading-core.sh');
  });

  it('proves takeover credentials with checks that can pass before activation', () => {
    const s = read('deploy/netcup/hermes-control/github-oidc-control.mjs');
    const pre = s.slice(s.indexOf("case 'activation-preflight'"), s.indexOf("case 'migrate-cutover'"));
    expect(pre).not.toContain('agy sign-in status');
    expect(pre).toContain("google-capability-cli.mjs status antigravity | jq -e '.antigravity.authentication.verified == true'");
    expect(pre).not.toContain('127.0.0.1:9141/health');
    expect(pre).toContain('/secrets/xkiro-api.key');
    expect(pre).not.toMatch(/timeout \d+s [A-Z_]+=/);
    // ubuntu() execs through `env` with no shell: a check must not start with a shell builtin.
    for (const m of pre.matchAll(/ubuntu\("([^"]*)/g)) expect(m[1], m[1]).not.toMatch(/^(cd|export|source|\.) /);
  });

  it('rotates identities with one well-formed remote command per peer and survives a re-run', () => {
    const s = read('deploy/netcup/hermes-control/rotate-bootstrap-identities.sh');
    // The inner command must stay inside the remote string (escaped quotes), or the hub restarts its own
    // WireGuard locally and the peer receives an unterminated quote (converge run 35999321364).
    expect(s).toContain('nohup bash -lc \\"sleep 1; systemctl restart wg-quick@wg-dial\\"');
    expect(s).not.toMatch(/nohup bash -lc "sleep 1/);
    // A peer that already accepts the permanent key is not re-authorized with the removed bootstrap key.
    const loop = s.slice(s.indexOf('for name in "${NAMES[@]}"; do'));
    expect(loop.indexOf('if ! runuser -u ubuntu -- ssh -i "$PERM"')).toBeLessThan(loop.indexOf('ssh -i "$BOOT"'));
  });

  it('accepts a canonical role file under an explicit --role override, and still rejects a missing or contradicting one', async () => {
    const fs2 = await import('node:fs'); const os2 = await import('node:os');
    const { resolveHostRole } = await import('../ops/development-bootstrap/roles/role-guard.mjs');
    const dir = fs2.mkdtempSync(path.join(os2.tmpdir(), 'role-'));
    const file = path.join(dir, 'host-role');
    fs2.writeFileSync(file, 'ROLE=CONTROL_AUTHORITY\n', { mode: 0o644 });
    // The override outranks the file, which is why certify now resolves the file separately.
    expect(resolveHostRole({ env: { DIAL_HOST_ROLE: 'dial-hermes-control' }, roleFile: file, hostname: 'dial-control' }).source).toBe('env');
    const fromFile = resolveHostRole({ env: { DIAL_HOST_ROLE: '' }, roleFile: file, hostname: 'dial-control' });
    expect([fromFile.source, fromFile.role_file_format, fromFile.role]).toEqual(['role_file', 'CANONICAL', 'dial-hermes-control']);
    fs2.writeFileSync(file, 'ROLE=BACKGROUND_COORDINATOR\n');
    expect(resolveHostRole({ env: { DIAL_HOST_ROLE: '' }, roleFile: file, hostname: 'dial-control' }).role).toBe('UNKNOWN');
    const certify = read('ops/development-bootstrap/verify/certify.mjs');
    expect(certify).toContain("resolveHostRole({ env: { ...process.env, DIAL_HOST_ROLE: '' }, roles, hosts })");
    expect(certify).toContain('fromFile.role === resolved.role');
  });

  it('treats a completed rotation as done on a later converge pass, but only when every peer accepts the permanent key', () => {
    const s = read('deploy/netcup/hermes-control/rotate-bootstrap-identities.sh');
    // Converge run 36016946411 failed "REFUSE: bootstrap ssh key missing" after the 13:27 rotation had succeeded.
    const already = s.indexOf('echo "BOOTSTRAP_IDENTITIES_ROTATED=ALREADY"');
    expect(already).toBeGreaterThan(0);
    const guard = s.slice(s.indexOf('if [[ ! -s "$BOOT" ]]; then'), already);
    expect(guard).toContain('[[ -s "$PERM" ]] || { echo "REFUSE: bootstrap ssh key missing"');
    expect(guard).toMatch(/ssh -i "\$PERM" .* true \|\|\s*\{ echo "REFUSE/);
    // Nothing that needs the bootstrap key (or regenerates WireGuard keys) runs before that exit.
    expect(s.indexOf('ssh -i "$BOOT"')).toBeGreaterThan(already);
    expect(s.indexOf('wg genkey')).toBeGreaterThan(already);
    expect(s).toContain('BOOT_PUB="$(cat "$BOOT_PUB_FILE" 2>/dev/null || true)"');
  });

  it('keeps re-enrollment working after identity rotation has retired the bootstrap key', () => {
    const s = read('deploy/netcup/hermes-control/oci-enroll-oracle-estate.sh');
    const fallback = s.indexOf('SSH_PUB_FILE=/home/ubuntu/.ssh/dial-oracle-admin.pub');
    expect(fallback).toBeGreaterThan(0);
    expect(fallback).toBeLessThan(s.indexOf('die "bootstrap SSH public key missing"'));
    expect(read('deploy/netcup/hermes-control/rotate-bootstrap-identities.sh')).toContain('rm -f "$BOOT" "$BOOT_PUB_FILE"');
  });

  it('never copies the source host OAuth credentials over the ones Dial Control holds', () => {
    const s = read('deploy/netcup/hermes-control/migrate-from-oracle-control.sh');
    const copy = s.slice(s.indexOf('copy_identity(){'), s.indexOf('snapshot_repo(){'));
    expect(copy).toContain('for cred in .credentials.json auth.json; do');
    expect(copy).toContain('if [[ -s "$HOME/$rel/$cred" ]]; then excludes+=(--exclude "/$cred"); fi');
    expect(copy.indexOf('excludes+=(--exclude "/$cred")')).toBeLessThan(copy.indexOf('"${excludes[@]}"'));
  });

  it('accepts the owner-approved overlay equivalent only on fresh, complete per-peer proof', async () => {
    const { evaluateAlternatePathsEvidence } = await import('../ops/development-bootstrap/network/reachability.mjs');
    const now = Date.parse('2026-09-24T08:00:00Z');
    const pass = (peer) => ({ peer, overlay: 'PASS', direct: 'PASS', run_command: 'PASS' });
    const doc = { schema: 'dial.alternate-paths.v1', observed_at_utc: '2026-09-24T07:00:00Z', peers: [pass('oracle-admin'), pass('vekl-worker')] };
    expect(evaluateAlternatePathsEvidence(doc, { now }).ok).toBe(true);
    expect(evaluateAlternatePathsEvidence({ ...doc, peers: [pass('oracle-admin'), { ...pass('vekl-worker'), run_command: 'FAIL' }] }, { now }).ok).toBe(false);
    expect(evaluateAlternatePathsEvidence({ ...doc, peers: [pass('oracle-admin')] }, { now }).ok).toBe(false);
    expect(evaluateAlternatePathsEvidence({ ...doc, observed_at_utc: '2026-09-22T00:00:00Z' }, { now }).ok).toBe(false);
    expect(evaluateAlternatePathsEvidence({ ...doc, schema: 'other' }, { now }).ok).toBe(false);
    expect(evaluateAlternatePathsEvidence(null).ok).toBe(false);
  });

  it('registers the GitHub recovery workflows without letting a push run any job', async () => {
    const yaml = (await import('js-yaml')).default;
    for (const rel of ['.github/workflows/oracle-recovery.yml', '.github/workflows/netcup-admin.yml']) {
      const wf = yaml.load(read(rel));
      expect(Object.keys(wf.on).sort()).toEqual(['push', 'workflow_dispatch']);
      expect(wf.on.push.paths).toEqual([rel]);
      for (const [name, job] of Object.entries(wf.jobs)) expect(job.if, `${rel}:${name}`).toMatch(/^\$\{\{ github\.event_name == 'workflow_dispatch' && /);
    }
  });
});

