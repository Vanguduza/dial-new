import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from '../ops/development-bootstrap/bootstrap.mjs';
import { parseSemver, parseToolVersion, requiredServicePath } from '../ops/development-bootstrap/lib/probes.mjs';
import { authorityConsistency, compareHostInventory, loadHosts } from '../ops/development-bootstrap/lib/topology.mjs';
import { evaluateAllProfiles, evaluateProfile } from '../ops/development-bootstrap/lib/readiness.mjs';
import { STATUS } from '../ops/development-bootstrap/lib/result.mjs';
import { pinReady, planConvergence, supplyChainStatus } from '../ops/development-bootstrap/converge/converge.mjs';
import { loadManifest, loadPins, validateManifest } from '../ops/development-bootstrap/lib/manifest.mjs';
import { parseEnvironmentFileEntries, parseEnvironmentFiles, environmentFileModes, evaluateUnitHardening } from '../ops/development-bootstrap/systemd/units.mjs';
import { certifyNetwork, evaluateTailscaleState, resolveNetworkTarget } from '../ops/development-bootstrap/network/reachability.mjs';
import { issueResumeToken, readResumeToken } from '../ops/development-bootstrap/auth/workflow.mjs';
import { compactProcessedIds, consumeSenderRateLimit } from '../agent-system/orchestration/whatsapp-delivery-guard.mjs';
import { composeGreenFlag, verifyWholeSystemEvidence } from '../ops/development-bootstrap/verify/green-flag.mjs';
import { governedPacketDecision } from '../agent-system/orchestration/shell-effect-classifier.mjs';
import { branchProtectionCheck } from '../ops/development-bootstrap/verify/certify.mjs';
import { credentialFileModeOk } from '../ops/development-bootstrap/verify/repository.mjs';

const repoDir = process.cwd();
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }

describe('DIAL development bootstrap closure', () => {
  it('parses two-component jq versions and product-scoped OpenSSH versions', () => {
    expect(parseToolVersion('jq', 'jq-1.7').text).toBe('1.7.0');
    expect(parseToolVersion('ssh', 'OpenSSH_9.6p1 Ubuntu-3ubuntu13.14, OpenSSL 3.0.13 30 Jan 2024').text).toBe('9.6.1');
    expect(parseToolVersion('ssh', 'OpenSSL 3.0.13')).toBeNull();
    expect(parseSemver('v22.23.2').text).toBe('22.23.2');
  });

  it('wires explicit auth/resume and readiness profile arguments', () => {
    expect(parseArgs(['--auth', '--resume', 'auth-0123456789ab', '--profile', 'OWNER_CONTROL'])).toMatchObject({ mode: 'auth', resume: 'auth-0123456789ab', profile: 'OWNER_CONTROL' });
    expect(() => parseArgs(['--verify', '--resume', 'auth-0123456789ab'])).toThrow(/only with --auth/);
    expect(() => parseArgs(['--verify', '--profile', 'GREENISH'])).toThrow(/unknown readiness profile/);
  });

  it('persists opaque auth resume tokens without credential values', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-auth-'));
    const token = issueResumeToken({ controlHome: root, credentialIds: ['cred.codex'] });
    expect(token).toMatch(/^auth-[a-f0-9]{12}$/);
    expect(readResumeToken({ controlHome: root, token }).credential_ids).toEqual(['cred.codex']);
    expect(fs.statSync(path.join(root, 'bootstrap/auth-evidence', `${token}.resume.json`)).mode & 0o077).toBe(0);
  });

  it('reconciles the Netcup control topology and accepts E2 logical CPU reporting', () => {
    const hosts = loadHosts();
    const control = hosts.hosts.find((host) => host.host_id === 'dial-hermes-control');
    expect(control).toMatchObject({ provider: 'netcup', provider_shape: 'RS 1000 G12', architecture: 'x86_64', cpu_total: 4, memory_total_mb: 8192, private_ip: null });
    expect(authorityConsistency({ repoDir, hosts }).ok).toBe(true);
    const e2 = hosts.hosts.find((host) => host.host_id === 'vekl-worker');
    expect(compareHostInventory({ entry: e2, facts: { hostname: e2.host_id, architecture: 'x86_64', cpu_total: 2, memory_total_mb: 980, private_ipv4: [e2.private_ip] } }).ok).toBe(true);
  });

  it('keeps the full recovery agent off the bounded-recovery control host', () => {
    const manifest = loadManifest();
    const hosts = loadHosts();
    const recoveryAgent = manifest.services.find((service) => service.id === 'svc.dial-recovery-agent');
    const fullRecoveryHosts = hosts.hosts.filter((host) => host.roles.includes('RECOVERY')).map((host) => host.host_id).sort();
    expect(recoveryAgent.hosts.slice().sort()).toEqual(fullRecoveryHosts);
    expect(recoveryAgent.hosts).not.toContain('dial-hermes-control');
    expect(hosts.hosts.find((host) => host.host_id === 'dial-hermes-control').roles).toContain('BOUNDED_RECOVERY');
  });

  it('passes the chosen fabric state and repository paths into the initial host telemetry publish', () => {
    const installer = fs.readFileSync(path.join(repoDir, 'deploy/oracle/resource-fabric/install-host.sh'), 'utf8');
    expect(installer).toContain('DIAL_FABRIC_STATE="$STATE_DIR" DIAL_REPO_DIR="$REPO_DIR" DIAL_FABRIC_HOST_ID="$HOST_ID" node "$FABRIC_DIR/host-agent.mjs" --publish');
  });

  it('requires all whole-system evidence while allowing bounded profiles', () => {
    const checks = [
      { id: 'core', readiness_class: 'CORE_DEVELOPMENT_REQUIRED', status: STATUS.PASS },
      { id: 'owner', readiness_class: 'OWNER_CONTROL_REQUIRED', status: STATUS.EXTERNAL_GATE },
      { id: 'recovery', readiness_class: 'RECOVERY_REQUIRED', status: STATUS.PASS },
    ];
    expect(evaluateProfile({ profile: 'CORE_DEVELOPMENT', checks }).status).toBe('GREEN');
    expect(evaluateAllProfiles({ checks }).WHOLE_SYSTEM_GREEN.status).toBe('AMBER');
  });

  it('accepts only fresh signed reports for all hosts plus provider-container evidence', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const timestamp = new Date(10_000).toISOString();
    const proofs = {
      'dial-hermes-control': ['role.resolved', 'topology.host-inventory-drift', 'fabric.qualifier', 'systemd.dial-hermes-runtime.service'],
      'vekl-worker': ['role.resolved', 'topology.host-inventory-drift', 'vekl-worker.live', 'systemd.dial-worker-agent.timer', 'systemd.dial-structural-snapshot.timer'],
      'oracle-admin': ['role.resolved', 'topology.host-inventory-drift', 'oracle-admin.live', 'systemd.dial-recovery-agent.service'],
      'provider-container': ['role.resolved', 'selftest.e2e'],
    };
    const reports = Object.keys(proofs).map((host_role) => {
      const report = { report_id: `r-${host_role}`, host_role, repository_commit: 'a'.repeat(40), timestamp, duration_ms: 7, overall_status: 'RED', checks: proofs[host_role].map((id) => ({ id, status: 'PASS' })) };
      report.report_hash = crypto.createHash('sha256').update(JSON.stringify({ ...report, timestamp: undefined, duration_ms: undefined })).digest('hex');
      report.evidence_signature = { algorithm: 'ed25519', key_id: 'fixture', value_base64: crypto.sign(null, Buffer.from(report.report_hash), privateKey).toString('base64') };
      return report;
    });
    expect(verifyWholeSystemEvidence({ reports, trustedKeys: { fixture: publicKey }, repositoryCommit: 'a'.repeat(40), now: 10_000 }).ok).toBe(true);
    expect(verifyWholeSystemEvidence({ reports: reports.slice(0, 3), trustedKeys: { fixture: publicKey }, repositoryCommit: 'a'.repeat(40), now: 10_000 }).failures).toContain('MISSING_REPORT:provider-container');
    const aggregate = composeGreenFlag({ report: { ...reports[0], checks: [], owner_action_gates: [], summary: {} }, hostReports: reports, trustedKeys: { fixture: publicKey }, gapRegister: { gaps: [] }, traceability: { rows: [] }, now: 10_000 });
    expect(aggregate.overall_status).toBe('RED');
    expect(aggregate.green_flag_conditions.some((condition) => condition.status === 'NOT_MET')).toBe(true);
  });

  it('pins every mandatory supply-chain path and binds auxiliary lock/vendor artifacts', () => {
    const pins = loadPins();
    const sha256 = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(repoDir, rel))).digest('hex');
    expect(pinReady(pins.pins.node)).toEqual({ ready: true, missing: [] });
    expect(pins.pins.node.architectures.arm64.sha256).toBe('fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8');
    expect(pins.pins.node.architectures.x64.sha256).toBe('d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307');
    expect(pinReady(pins.pins['hermes-agent'])).toEqual({ ready: true, missing: [] });
    expect(planConvergence({ manifest: loadManifest(), role: 'dial-hermes-control', pins }).find((action) => action.item === 'rt.node').method).toBe('RELEASE_TARBALL_SHA256');
    expect(supplyChainStatus({ manifest: loadManifest(), role: 'dial-hermes-control', pins }).pins_missing).toEqual([]);
    expect(Object.entries(pins.pins).filter(([, pin]) => pin?.pin_state && pin.pin_state !== 'PINNED')).toEqual([]);
    expect(sha256(pins.pins['@wonderwhy-er/desktop-commander'].lock_file)).toBe(pins.pins['@wonderwhy-er/desktop-commander'].package_lock_sha256);
    expect(sha256('deploy/oracle/hermes-codex/whatsapp-pair-runtime/package-lock.json')).toBe(pins.pins.whatsapp_pair_runtime.package_lock_sha256);
    expect(sha256(pins.pins.whatsapp_pair_runtime.baileys.vendor_file)).toBe(pins.pins.whatsapp_pair_runtime.baileys.sha256);
    const dockerfile = fs.readFileSync(path.join(repoDir, 'deploy/oracle/execution-fabric/sandbox/Dockerfile.toolbox'), 'utf8');
    expect(dockerfile).toContain(`FROM ${pins.pins.toolbox_base.image}@${pins.pins.toolbox_base.digest}`);
  });

  it('keeps executable installer paths free of pipe-to-shell, floating latest, and editable installs', () => {
    const files = [
      'deploy/oracle/hermes-codex/bootstrap-host.sh',
      'deploy/oracle/hermes-codex/install-pinned-node.sh',
      'deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh',
      'deploy/oracle/provisioning/bootstrap.sh',
      'deploy/oracle/execution-fabric/phase4-install-sandbox.sh',
      'deploy/oracle/execution-fabric/sandbox/Dockerfile.toolbox',
      'ops/development-bootstrap/converge/converge.mjs',
    ];
    const executable = files.map((file) => fs.readFileSync(path.join(repoDir, file), 'utf8').split('\n').filter((line) => !/^\s*(?:#|\/\/)/.test(line) && !/missing\.push\('safe_install_command'\)/.test(line)).join('\n')).join('\n');
    expect(executable).not.toMatch(/curl[^\n|]*\|\s*(?:ba)?sh/i);
    expect(executable).not.toMatch(/@latest\b/i);
    expect(executable).not.toMatch(/(?:uv|pip)\s+pip\s+install\s+-e|pip\s+install\s+-e/i);
  });

  it('qualifies the control plane with an explicit non-interactive PATH that includes Hermes', () => {
    const qualifier = fs.readFileSync(path.join(repoDir, 'deploy/oracle/hermes-codex/qualify-control-plane.sh'), 'utf8');
    expect(qualifier).toContain('export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:/usr/bin:/bin"');
  });

  it('uses an explicit minimal service PATH including the user-local bin', () => {
    expect(requiredServicePath('/srv/dial')).toBe('/srv/dial/.local/bin:/srv/dial/.npm-global/bin:/usr/local/bin:/usr/bin:/bin');
  });

  it('fails closed for governed material use without a packet while preserving read-only inspection', () => {
    expect(governedPacketDecision({ governed: true, consequential: true, packetId: null }).decision).toBe('deny');
    expect(governedPacketDecision({ governed: true, consequential: false, packetId: null }).decision).toBeNull();
    expect(governedPacketDecision({ governed: false, consequential: true, packetId: null }).decision).toBeNull();
  });

  it('parses EnvironmentFiles without inventing an empty or flag path and enforces hardening', () => {
    expect(parseEnvironmentFiles('')).toEqual([]);
    expect(parseEnvironmentFiles('/run/a.env (ignore_errors=no) -/run/b.env (ignore_errors=yes)')).toEqual(['/run/a.env', '/run/b.env']);
    expect(parseEnvironmentFileEntries('/run/a.env (ignore_errors=no) -/run/b.env (ignore_errors=yes)')).toEqual([{ file: '/run/a.env', optional: false }, { file: '/run/b.env', optional: true }]);
    expect(environmentFileModes([{ file: '/definitely/missing/optional.env', optional: true }])[0]).toMatchObject({ exists: false, optional: true, ok: true });
    const show = 'NoNewPrivileges=yes\nProtectSystem=strict\nProtectHome=read-only\nPrivateTmp=yes\nUnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY\nEnvironment=PATH=/home/dial/.local/bin:/usr/bin:/bin\nEnvironmentFiles=\nReadWritePaths=/var/lib/dial-control\n';
    expect(evaluateUnitHardening({ show, repoDir }).ok).toBe(true);
    expect(evaluateUnitHardening({ show: show.replace('PrivateTmp=yes', 'PrivateTmp=no'), repoDir }).failures).toContain('PrivateTmp!=yes');
    expect(credentialFileModeOk('venue-ed25519.pub', '644')).toBe(true);
    expect(credentialFileModeOk('venue-ed25519.pem', '644')).toBe(false);
  });

  it('hardens every canonical generated service with a safe explicit PATH', () => {
    const files = [
      ...walk(path.join(repoDir, 'deploy/oracle/hermes-codex')).filter((file) => file.endsWith('.sh')),
      ...walk(path.join(repoDir, 'deploy/oracle/execution-fabric')).filter((file) => file.endsWith('.sh')),
      ...walk(path.join(repoDir, 'ops/development-bootstrap')).filter((file) => file.endsWith('.sh')),
      ...walk(path.join(repoDir, 'deploy/oracle/resource-fabric/systemd')).filter((file) => file.endsWith('.service')),
      ...walk(path.join(repoDir, 'deploy/oracle/provisioning/systemd')).filter((file) => file.endsWith('.service')),
    ];
    const failures = [];
    for (const file of files) for (const block of fs.readFileSync(file, 'utf8').split('[Service]').slice(1)) {
      if (!block.includes('[Install]')) continue;
      const service = block.split('[Install]')[0];
      for (const directive of ['NoNewPrivileges', 'ProtectSystem', 'ProtectHome', 'PrivateTmp', 'UnsetEnvironment', 'Environment=PATH']) if (!service.includes(directive)) failures.push(`${path.relative(repoDir, file)}:${directive}`);
    }
    expect(failures).toEqual([]);
  });

  it('classifies the canonical secondary recovery overlay fail-closed', () => {
    expect(evaluateTailscaleState({ BackendState: 'NeedsLogin', Self: { Online: false } })).toMatchObject({ ok: false, needs_login: true, backend_state: 'NeedsLogin' });
    expect(evaluateTailscaleState({ BackendState: 'Running', TailscaleIPs: ['100.64.0.1'], Self: { Online: true, DNSName: 'dial.example.ts.net.' } })).toMatchObject({ ok: true, needs_login: false, backend_state: 'Running', online: true, tailscale_ips: ['100.64.0.1'] });
    const overlay = loadManifest().network_dependencies.find((x) => x.id === 'net.secondary-recovery-overlay');
    expect(overlay).toMatchObject({ criticality: 'MANDATORY', readiness_class: 'RECOVERY_REQUIRED', probe: 'TAILSCALE', gate: 'EXTERNAL-GATE-SECONDARY-RECOVERY-OVERLAY-001' });
  });

  it('persists external owner-gate setup as exact, non-secret bootstrap inputs', () => {
    const manifest = loadManifest();
    const byId = Object.fromEntries(manifest.credentials.map((credential) => [credential.id, credential]));
    expect(byId['cred.stitch']).toMatchObject({ interactive: true, location: '/var/lib/dial-control/secrets/stitch.env', probe: 'dial-stitch authenticated health' });
    expect(byId['cred.stitch'].owner_action).toContain('gcloud auth login --update-adc');
    expect(byId['cred.claude-secondary-subscription']).toMatchObject({
      interactive: true,
      location: '/var/lib/dial-control/secrets/claude-worker-secondary',
      required_mode: '700',
      probe: 'claude secondary auth status',
      criticality: 'OPTIONAL',
      readiness_class: 'OPTIONAL_CAPABILITY',
    });
    expect(byId['cred.claude-secondary-subscription'].owner_action).toContain('CLAUDE_CONFIG_DIR=/var/lib/dial-control/secrets/claude-worker-secondary');
    expect(byId['cred.exa']).toBeUndefined();
    const exa = manifest.mcp_servers.find((server) => server.id === 'mcp.exa');
    expect(exa).toMatchObject({ auth_type: 'NONE', transport: 'stdio', command: 'bash deploy/oracle/hermes-codex/research-mcp-runtime/run-exa.sh' });
    expect(exa.secret_refs).toBeUndefined();
    expect(byId['cred.whatsapp-cloud']).toBeUndefined();
    expect(byId['cred.whatsapp-pairing']).toMatchObject({ interactive: true, probe: 'whatsapp-hermes-operator status', owner_action: 'bash deploy/oracle/hermes-codex/configure-hermes-whatsapp-control.sh && bash deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh --foreground', criticality: 'OPTIONAL', readiness_class: 'OPTIONAL_CAPABILITY' });
    expect(byId['cred.whatsapp-pairing'].location).toBe('~/.hermes/whatsapp/dial-hermes-control/session/creds.json');
    expect(byId['cred.whatsapp-pairing'].config_location).toBe('/var/lib/dial-control/secrets/hermes-whatsapp-control.env');
    expect(byId['cred.whatsapp-pairing'].auth_semantics).toContain('dedicated Hermes WhatsApp account');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-network-config-'));
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.writeFileSync(path.join(root, 'config/development-network.env'), 'DIAL_MCP_INGRESS_URL=https://mcp.dial.invalid.example.net/health\n');
    expect(resolveNetworkTarget({ resolve_via: 'DIAL_MCP_INGRESS_URL', target: null }, { controlHome: root, env: {} })).toBe('https://mcp.dial.invalid.example.net/health');
    const scripts = [
      'deploy/oracle/hermes-codex/configure-stitch-provider.sh',
      'deploy/oracle/hermes-codex/configure-hermes-whatsapp-control.sh',
      'deploy/oracle/hermes-codex/run-stitch-provider.sh',
      'deploy/oracle/hermes-codex/configure-cloudflare-mcp-ingress.sh',
      'deploy/oracle/resource-fabric/verify-secondary-recovery-overlay.sh',
    ].map((rel) => fs.readFileSync(path.join(repoDir, rel), 'utf8')).join('\n');
    expect(scripts).toContain('chmod 600');
    expect(scripts).toContain('STITCH_AUTH_METHOD');
    expect(scripts).toContain('gcloud auth application-default print-access-token');
    expect(scripts).toContain('gcloud auth login --update-adc');
    expect(scripts).toContain('export DIAL_CONTROL_HOME="$CONTROL_HOME"');
    expect(scripts).toContain('export DIAL_REPO_DIR="$REPO_DIR"');
    expect(scripts).toContain('SECONDARY_RECOVERY_OVERLAY_PEERS_REACHABLE');
    expect(scripts).not.toMatch(/curl[^\n|]*\|\s*(?:ba)?sh/i);
  });

  it('classifies absent Cloudflare configuration as an explicit external owner gate without a fake URL', async () => {
    const previous = process.env.DIAL_MCP_INGRESS_URL;
    delete process.env.DIAL_MCP_INGRESS_URL;
    try {
      const checks = await certifyNetwork({ role: 'dial-hermes-control', manifest: { network_dependencies: [{ id: 'net.cloudflare-access', target: null, resolve_via: 'DIAL_MCP_INGRESS_URL', configuration_required: true, purpose: 'public MCP', hosts: ['dial-hermes-control'], criticality: 'MANDATORY', readiness_class: 'CORE_DEVELOPMENT_REQUIRED' }] } });
      expect(checks[0]).toMatchObject({ status: STATUS.OWNER_ACTION_REQUIRED, gate: 'EXTERNAL-GATE-CLOUDFLARE-ACCESS-001' });
      expect(JSON.stringify(checks[0])).not.toContain('not-configured.invalid');
    } finally { if (previous === undefined) delete process.env.DIAL_MCP_INGRESS_URL; else process.env.DIAL_MCP_INGRESS_URL = previous; }
  });

  it('accepts fresh native branch-protection API evidence as an enforcement mechanism', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-branch-native-'));
    const dir = path.join(root, 'docs/project-state'); fs.mkdirSync(dir, { recursive: true });
    const expectation = { schema_version: 1, max_evidence_age_days: 30, expected: { branch: 'master', required_pull_request: true, require_code_owner_review: false, required_approving_review_count: 0, dismiss_stale_reviews: false, required_status_checks: ['project-truth'], require_branches_up_to_date: true, required_signatures: false, block_force_pushes: true, block_deletions: true, enforce_on_administrators: true } };
    fs.writeFileSync(path.join(dir, 'BRANCH_PROTECTION_EXPECTATION.json'), JSON.stringify(expectation));
    fs.writeFileSync(path.join(dir, 'BRANCH_PROTECTION_EVIDENCE.json'), JSON.stringify({ schema_version: 1, repository: 'Vanguduza/dial-new', enforcement_type: 'BRANCH_PROTECTION', enforcement_id: 'branch-protection:master', observed_at: new Date().toISOString(), exported_by: 'owner', source: 'GITHUB_BRANCH_PROTECTION_API_EXPORT', source_payload_sha256: 'a'.repeat(64), observed: expectation.expected }));
    expect(branchProtectionCheck({ repoDir: root }).status).toBe(STATUS.PASS);
  });

  it('never infers applied branch protection from repository expectations alone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-branch-'));
    const dir = path.join(root, 'docs/project-state'); fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(repoDir, 'docs/project-state/BRANCH_PROTECTION_EXPECTATION.json'), path.join(dir, 'BRANCH_PROTECTION_EXPECTATION.json'));
    expect(branchProtectionCheck({ repoDir: root }).status).toBe(STATUS.OWNER_ACTION_REQUIRED);
    fs.writeFileSync(path.join(dir, 'BRANCH_PROTECTION_EVIDENCE.json'), JSON.stringify({ observed_at: new Date().toISOString(), exported_by: 'fixture', observed: { branch: 'master', required_status_checks: ['verify', 'project-truth'], required_pull_request: true, block_force_pushes: true, block_deletions: true, required_signatures: true, require_code_owner_review: true, dismiss_stale_reviews: true, require_branches_up_to_date: true, enforce_on_administrators: true, required_approving_review_count: 1 } }));
    expect(branchProtectionCheck({ repoDir: root }).status).toBe(STATUS.FAIL);
  });

  it('validates the completed manifest schema', () => {
    expect(validateManifest(loadManifest())).toEqual([]);
  });

  it('rate-limits each WhatsApp sender independently and bounds idempotency retention', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-wa-rate-')); const sender = 'a'.repeat(24);
    expect(consumeSenderRateLimit({ root, senderHash: sender, nowMs: 1_000, limit: 2, windowMs: 1_000 }).ok).toBe(true);
    expect(consumeSenderRateLimit({ root, senderHash: sender, nowMs: 1_100, limit: 2, windowMs: 1_000 }).ok).toBe(true);
    expect(consumeSenderRateLimit({ root, senderHash: sender, nowMs: 1_200, limit: 2, windowMs: 1_000 }).ok).toBe(false);
    expect(consumeSenderRateLimit({ root, senderHash: 'b'.repeat(24), nowMs: 1_200, limit: 2, windowMs: 1_000 }).ok).toBe(true);
    expect(compactProcessedIds([{ id_hash: 'old', at_ms: 1 }, { id_hash: 'new', at_ms: 2_000 }], { nowMs: 2_000, maxAgeMs: 100, maxEntries: 10 })).toEqual([{ id_hash: 'new', at_ms: 2_000 }]);
  });

  it('keeps Dial Control zero-touch bootstrap complete, bounded and resumable', () => {
    const workflow = fs.readFileSync(path.join(repoDir, '.github/workflows/netcup-zero-touch-converge.yml'), 'utf8');
    const controller = fs.readFileSync(path.join(repoDir, 'deploy/netcup/hermes-control/github-oidc-control.mjs'), 'utf8');
    const customScript = fs.readFileSync(path.join(repoDir, 'deploy/netcup/hermes-control/netcup-custom-script.sh'), 'utf8');
    const image = fs.readFileSync(path.join(repoDir, 'deploy/netcup/hermes-control/image-bootstrap.sh'), 'utf8');
    const hub = fs.readFileSync(path.join(repoDir, 'deploy/netcup/hermes-control/configure-wireguard-fabric.sh'), 'utf8');
    const peer = fs.readFileSync(path.join(repoDir, 'deploy/oracle/resource-fabric/zero-touch-enroll-peer.sh'), 'utf8');

    expect(workflow).toContain("cron: '*/5 * * * *'");
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain("body='{\"action\":\"status\"}'");
    expect(workflow).not.toContain("body='{\\\"action");
    expect(workflow).toContain("oci-cli==3.93.0");
    expect(workflow).toContain('ensure-github-admin-runner');
    expect(workflow).toContain('Final zero-touch certification');
    const adminWorkflow = fs.readFileSync(path.join(repoDir, '.github/workflows/netcup-admin-oidc.yml'), 'utf8');
    expect(adminWorkflow).toContain('id-token: write');
    expect(adminWorkflow).toContain('I_UNDERSTAND_ROOT');
    expect(adminWorkflow).toContain('admin-command');

    expect(controller).toContain('/.github/workflows/netcup-zero-touch-converge.yml@');
    expect(controller).toContain('/.github/workflows/netcup-admin-oidc.yml@');
    expect(controller).toContain("case 'admin-command'");
    expect(controller).toContain('bootstrap_ssh_public_key');
    expect(controller).toContain('overlay_verified');
    expect(controller).toContain('github_oidc_admin:true');

    const provisioningStage = customScript.split("cat >\"$RUNNER\" <<'RUNNER_EOF'")[0];
    expect(customScript).toContain('PROVISIONING_STAGE=NETWORK_FREE');
    expect(customScript).toContain('99-dial-netcup-bootstrap-dns.conf');
    expect(customScript).toContain('DPkg::Lock::Timeout=600');
    expect(customScript).toContain('Restart=on-failure');
    expect(customScript).not.toContain('ConditionPathExists=!/var/lib/dial-control/bootstrap/image-bootstrap.receipt');
    expect(provisioningStage).not.toMatch(/\b(?:apt-get|curl|git)\b/);
    expect(customScript).toContain('systemctl start --no-block dial-control-bootstrap.service');
    expect(customScript).toContain('systemctl daemon-reload');
    expect(customScript).toContain("DIAL_CONTROL_DISPLAY_NAME='Dial Control'");
    expect(customScript).toContain('c22756daf6d40c146176c52d3ee69aa109b07ebf');
    expect(customScript).toContain('a068047ebfb92046935201e372da4d6df490cd1a');
    expect(provisioningStage).not.toContain('apt-get');
    expect(provisioningStage).not.toContain('curl --proto');

    expect(image).toContain("ssh-keygen -q -t ed25519 -N ''");
    expect(image).toContain('install-github-oidc-control.sh');
    expect(image).toContain('ZERO_TOUCH_POSTBOOT=ENABLED');
    expect(image).toContain("DIAL_CONTROL_DISPLAY_NAME='Dial Control'");
    expect(image).not.toContain('DIAL_CONTROL_DISPLAY_NAME=Dial Control\\n');
    expect(image).not.toContain('dial-control-bootstrap-oracle.key');

    expect(hub).not.toContain('\\\\nOLD_PUB=');
    expect(hub).toContain('AllowedIPs = 10.77.0.5/32');
    expect(peer).toContain('old-dial-hermes-control|dial-hermes-control');

    execFileSync('bash', ['-n', path.join(repoDir, 'deploy/netcup/hermes-control/netcup-custom-script.sh')]);
    execFileSync('bash', ['-n', path.join(repoDir, 'deploy/netcup/hermes-control/configure-wireguard-fabric.sh')]);
    execFileSync('bash', ['-n', path.join(repoDir, 'deploy/oracle/resource-fabric/zero-touch-enroll-peer.sh')]);
    execFileSync('bash', ['-n', path.join(repoDir, 'deploy/netcup/hermes-control/image-bootstrap.sh')]);
  });

});
