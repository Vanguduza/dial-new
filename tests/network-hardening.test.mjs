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

  it('lets the cutover through only when every open CORE item is the activation hold or a named external/auth gate', async () => {
    const { spawnSync } = await import('node:child_process'); const os2 = await import('node:os');
    // One rule for both the cutover and activation.
    expect(read('deploy/netcup/hermes-control/migrate-from-oracle-control.sh')).toContain('core-verdict-gate.py" "$EVIDENCE/netcup-core-verification.json" MIGRATION_BLOCKED');
    expect(read('deploy/netcup/hermes-control/postboot-converge.sh')).toContain('core-verdict-gate.py" "$verification" ACTIVATION_BLOCKED');
    const gate = path.join(repoDir, 'deploy/netcup/hermes-control/core-verdict-gate.py');
    const dir = fs.mkdtempSync(path.join(os2.tmpdir(), 'cutover-'));
    const judge = (report) => { const f = path.join(dir, 'v.json'); fs.writeFileSync(f, JSON.stringify(report)); const r = spawnSync('python3', [gate, f, 'MIGRATION_BLOCKED'], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
    const hold = (id) => ({ id, status: 'OWNER_ACTION_REQUIRED', gate: 'NETCUP-ACTIVATION-GATE' });
    const report = (core, checks, overall = 'AMBER') => ({ overall_status: overall, readiness_profiles: { CORE_DEVELOPMENT: core }, checks });
    const held = ['systemd.dial-hermes-runtime.service', 'hermes.development-gate'];
    expect(judge({ overall_status: 'GREEN' }).code).toBe(0);
    const ok = judge(report({ status: 'AMBER', failed: [], uncovered: [], open: held }, held.map(hold)));
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toContain('GREEN_EXCEPT_GATED');
    // Owner/external gates (converge run 36030523028: Cloudflare Access, Google provider integration) are tracked, not failures.
    const ext = [...held, 'net.cloudflare-access', 'google.dev-antigravity'];
    const extChecks = [...held.map(hold), { id: 'net.cloudflare-access', status: 'OWNER_ACTION_REQUIRED', gate: 'EXTERNAL-GATE-CLOUDFLARE-ACCESS-001' }, { id: 'google.dev-antigravity', status: 'UNVERIFIED', gate: 'AUTH-GATE-GOOGLE-ANTIGRAVITY-001' }];
    const okExt = judge(report({ status: 'AMBER', failed: [], uncovered: [], open: ext }, extChecks));
    expect(okExt.code, okExt.out).toBe(0);
    expect(okExt.out).toContain('net.cloudflare-access@EXTERNAL-GATE-CLOUDFLARE-ACCESS-001');
    // A gate name that is neither of those prefixes does not count.
    expect(judge(report({ status: 'AMBER', failed: [], uncovered: [], open: ['x.y'] }, [{ id: 'x.y', status: 'UNVERIFIED', gate: 'SOME-OTHER-GATE' }])).out).toContain('open_not_held=x.y');
    // Any failure, coverage gap, un-held open item, RED/P0 overall, or missing profile still blocks.
    expect(judge(report({ status: 'RED', failed: ['security.no-tracked-secrets'], uncovered: [], open: held }, held.map(hold), 'RED')).out).toContain('MIGRATION_BLOCKED');
    expect(judge(report({ status: 'RED', failed: [], uncovered: ['hc.verify'], open: held }, held.map(hold), 'RED')).out).toContain('uncovered=hc.verify');
    expect(judge(report({ status: 'AMBER', failed: [], uncovered: [], open: [...held, 'claude.auth'] }, [...held.map(hold), { id: 'claude.auth', status: 'UNVERIFIED', gate: null }])).out).toContain('open_not_held=claude.auth');
    expect(judge(report({ status: 'AMBER', failed: [], uncovered: [], open: held }, held.map(hold), 'RED')).code).not.toBe(0);
    expect(judge({ overall_status: 'AMBER' }).code).not.toBe(0);
  });

  it('runs the control plane on the host Dial Control actually is (pinned Node, x86_64, restricted user namespaces)', async () => {
    // Activation 18:35: chat-control/mission-controller/owner-steering exited 203/EXEC on /usr/bin/node, absent on Netcup.
    for (const f of ['install-chat-control-bridge.sh', 'install-operator-gateway.sh', 'install-engineering-research.sh']) {
      const s = read(`deploy/oracle/hermes-codex/${f}`);
      expect(s, f).not.toMatch(/ExecStart=\/usr\/bin\/node/);
      expect(s, f).toContain('NODE_BIN="$(command -v node)"');
      expect(s.indexOf('NODE_BIN="$(command -v node)"'), f).toBeLessThan(s.indexOf('ExecStart=${NODE_BIN}'));
    }
    // HAIF 18:49: PrivateDevices in a user unit fails 218/CAPABILITIES under Ubuntu 24.04 userns restriction (owner decision).
    const haif = read('deploy/oracle/hermes-codex/install-haif.sh');
    const dialUnit = haif.slice(haif.indexOf('dial-hermes-haif.service" <<EOF'), haif.indexOf('dde-hermes-haif.service" <<EOF'));
    const ddeUnit = haif.slice(haif.indexOf('dde-hermes-haif.service" <<EOF'));
    expect(dialUnit).not.toMatch(/^PrivateDevices=/m);
    for (const kept of ['NoNewPrivileges=true', 'PrivateTmp=true', 'ProtectSystem=strict', 'ProtectHome=read-only', 'RestrictSUIDSGID=true', 'LockPersonality=true']) expect(dialUnit).toContain(kept);
    expect(ddeUnit).toMatch(/^PrivateDevices=true$/m);
    // Qualification 19:3x: "host must be ARM64; detected x86_64". It now checks the host against hosts.json.
    const q = read('deploy/oracle/hermes-codex/qualify-control-plane.sh');
    expect(q).not.toContain('must be ARM64');
    const expr = q.match(/DECLARED_ARCH="\$\(node -e '([^']+)'/)[1];
    const { spawnSync } = await import('node:child_process');
    const declared = spawnSync('node', ['-e', expr, path.join(repoDir, 'deploy/oracle/resource-fabric/hosts.json')], { encoding: 'utf8' }).stdout;
    expect(declared).toBe('x86_64');
    expect(q).toMatch(/"\$ARCH_NORM" == "\$DECLARED_ARCH" \]\] \|\| fail/);
  });

  it('never repeats migration prepare or cutover over a Netcup that already took over', () => {
    // Every push triggers converge; after the 18:34 cutover a re-run would copy the quiesced source over live state.
    const s = read('deploy/netcup/hermes-control/github-oidc-control.mjs');
    const guard = s.indexOf("const PRE_CUTOVER_PHASES=['migrate-prepare','activation-preflight','migrate-cutover'];");
    expect(guard).toBeGreaterThan(0);
    expect(s.slice(guard, guard + 400)).toContain("fs.existsSync(path.join(CONTROL,'state/migration-cutover-complete'))) return {skipped:true");
    // It sits before the dispatch, and activation/retirement are not in it.
    expect(guard).toBeLessThan(s.indexOf('  switch(action){'));
    for (const phase of ['activate', 'source-retirement-preflight', 'retire-a1-control-role']) expect(s.slice(guard, guard + 120)).not.toContain(`'${phase}'`);
  });

  it('lets activation reach its later steps and decides it on the full verify, not the fast repair verdict', () => {
    // Activation 2026-09-24 18:46/18:53: the repair's fast post-apply verdict omits repository gates, is never
    // GREEN on this role, and under set -e aborted activation before install-control-plane and the full verify ran.
    const s = read('deploy/netcup/hermes-control/postboot-converge.sh');
    const repair = s.indexOf('bootstrap.sh" --repair --role dial-hermes-control --profile CORE_DEVELOPMENT ||');
    expect(repair).toBeGreaterThan(0);
    expect(s.indexOf('install-control-plane.sh')).toBeGreaterThan(repair);
    const verify = s.indexOf('bootstrap.sh" --verify --role dial-hermes-control --profile CORE_DEVELOPMENT --json >"$verification"');
    const decide = s.indexOf('core-verdict-gate.py" "$verification" ACTIVATION_BLOCKED');
    const complete = s.indexOf('echo "NETCUP_CONTROL_ACTIVATION=COMPLETE"');
    expect(verify).toBeGreaterThan(repair);
    expect(decide).toBeGreaterThan(verify);
    expect(complete).toBeGreaterThan(decide);
    expect(s).toMatch(/^set -Eeuo pipefail$/m);
  });

  it('reports the orchestration gate as the activation hold only while Netcup activation is pending', () => {
    const s = read('ops/development-bootstrap/verify/repository.mjs');
    expect(s).toContain("const held = !ev.unblocked && activationGateHolds('dial-hermes-orchestrator.service', { controlHome });");
    expect(s).toContain('status: ev.unblocked ? STATUS.PASS : held ? STATUS.OWNER_ACTION_REQUIRED : STATUS.FAIL');
    expect(s).toContain("gate: held ? 'NETCUP-ACTIVATION-GATE' : 'EXTERNAL-GATE-HERMES-REQUALIFICATION-001'");
  });

  it('links every provider-certified CORE manifest item to a check the certifier produces', () => {
    // Converge run 36030523028: rt.antigravity, prov.xkiro, prov.google-*, cred.xkiro and cred.stitch had
    // no check_ids, so their existing checks never covered them and CORE_DEVELOPMENT could not go green.
    const manifest = JSON.parse(read('ops/development-bootstrap/manifest.json'));
    const src = ['ops/development-bootstrap/providers/google.mjs', ...fs.readdirSync(path.join(repoDir, 'ops/development-bootstrap/providers')).map((f) => `ops/development-bootstrap/providers/${f}`), ...fs.readdirSync(path.join(repoDir, 'ops/development-bootstrap/verify')).map((f) => `ops/development-bootstrap/verify/${f}`)].filter((f) => f.endsWith('.mjs')).map(read).join('\n');
    const produced = new Set([...src.matchAll(/id: '([a-z0-9.-]+)'/g)].map((m) => m[1]));
    const registry = JSON.parse(read('agent-system/registries/EXTERNAL_CAPABILITY_REGISTRY.json'));
    const caps = registry.capabilities || registry.entries || registry;
    for (const cap of Array.isArray(caps) ? caps : Object.values(caps)) if (cap.capability_id || cap.id) produced.add(`google.${String(cap.capability_id || cap.id).toLowerCase()}`);
    for (const id of ['rt.antigravity', 'prov.xkiro', 'prov.google-antigravity', 'prov.google-stitch', 'cred.xkiro', 'cred.stitch']) {
      const item = ['runtimes', 'providers', 'credentials'].flatMap((k) => manifest[k]).find((x) => x.id === id);
      expect(item?.check_ids?.length, id).toBeGreaterThan(0);
      for (const c of item.check_ids) expect(produced.has(c), `${id} -> ${c}`).toBe(true);
    }
  });

  it('holds the Antigravity installer to the supply-chain pin rather than a stale literal', async () => {
    // af0bd80 refreshed the pin 1.2.0 -> 1.2.9; G16 still demanded "1.2.0" and failed npm run verify on Netcup.
    const { spawnSync } = await import('node:child_process');
    const pin = JSON.parse(read('ops/development-bootstrap/supply-chain/PINS.json')).pins['antigravity-cli'].version;
    expect(read('deploy/oracle/hermes-codex/install-google-antigravity.sh')).toContain(`VERSION="${pin}"`);
    expect(read('agent-system/orchestration/google-capability-program-check.mjs')).not.toMatch(/VERSION=\\?"1\.2\.0/);
    const r = spawnSync('node', ['agent-system/orchestration/google-capability-program-check.mjs'], { cwd: repoDir, encoding: 'utf8' });
    const g16 = JSON.parse(r.stdout).gates.find((g) => g.id === 'G16');
    expect(g16.ok, g16.detail).toBe(true);
    expect(g16.detail).toContain(`(${pin})`);
  });

  it('keeps credential-shaped test fixtures out of the tracked-secret scan without changing their values', async () => {
    const { spawnSync } = await import('node:child_process');
    const pattern = '(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16})';
    const files = ['agent-system/orchestration/n8n-runtime-qualification.mjs', 'tests/orchestration-n8n-runtime.test.mjs', 'tests/orchestration-vekl-discovery.test.mjs'];
    const r = spawnSync('grep', ['-lE', pattern, ...files], { cwd: repoDir, encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('');
    expect(read(files[0])).toContain("'Bearer ' + 'AKIA' + 'IOSFODNN7EXAMPLEKEY123'");
    // The tracked-file rule still catches real env files and keys; only templates are exempt.
    const rule = read('ops/development-bootstrap/verify/repository.mjs').match(/git ls-files \| (grep -iE '[^']+') \| (grep -viE '[^']+')/);
    expect(rule).toBeTruthy();
    const sh = spawnSync('sh', ['-c', `printf 'a/.env\\na/.env.prod\\na/.env.example\\nb/.env.template\\nx.pem\\n' | ${rule[1].replace(/\\\\/g, '\\')} | ${rule[2].replace(/\\\\/g, '\\')}`], { encoding: 'utf8' });
    expect(sh.stdout.trim().split('\n')).toEqual(['a/.env', 'a/.env.prod', 'x.pem']);
  });
});

