import fs from 'node:fs';
import path from 'node:path';
import { STATUS } from '../lib/result.mjs';
import { backupFile } from '../lib/backup.mjs';
import { clientFragments } from '../mcp/inventory.mjs';
import { run } from '../lib/probes.mjs';
import { planConvergence, executeConvergence, CONVERGE_STATES } from '../converge/converge.mjs';
import { requiredServicePath } from '../lib/probes.mjs';

// Convergence actions. Each action is detect-first and idempotent: it reads current state, decides
// whether a change is needed, backs up the target, then (unless dry-run) applies. Actions never embed
// secrets and never authenticate; authentication is the owner-gated workflow in auth/workflow.mjs.
// Package/runtime convergence is delegated to converge/converge.mjs (pinned channels only).
export function planActions({ role, manifest, repoDir, controlHome, checks = [], pins = undefined }) {
  const failed = new Set(checks.filter((c) => c.status === STATUS.FAIL).map((c) => c.id));
  const actions = [];
  // Persist the same minimal PATH used by every generated service. This is deterministic and does not
  // depend on whatever interactive shell happened to launch the bootstrap.
  const environmentDir = path.join(process.env.HOME || '', '.config', 'environment.d');
  const environmentFile = path.join(environmentDir, '10-dial-path.conf');
  const desiredPath = `PATH=${requiredServicePath()}\n`;
  const currentPath = fs.existsSync(environmentFile) ? fs.readFileSync(environmentFile, 'utf8') : '';
  actions.push({ id: 'act.service-path', title: 'persist deterministic service PATH including ~/.local/bin', needed: currentPath !== desiredPath, backup: environmentFile, run: () => { fs.mkdirSync(environmentDir, { recursive: true, mode: 0o700 }); fs.writeFileSync(environmentFile, desiredPath, { mode: 0o600 }); const r = run('systemctl', ['--user', 'daemon-reload'], { timeoutMs: 10000 }); return { ok: r.ok, file: environmentFile, path: requiredServicePath(), command: r.command }; } });
  // 1. Control home layout (control host only).
  if (role === 'dial-hermes-control') actions.push({ id: 'act.control-home', title: `ensure control home ${controlHome} (0700) and canonical layout`, needed: !fs.existsSync(controlHome) || failed.has('security.control-home-modes'), run: () => { fs.mkdirSync(controlHome, { recursive: true, mode: 0o700 }); fs.chmodSync(controlHome, 0o700); const r = run('node', ['agent-system/orchestration/supervisor.mjs', 'init'], { cwd: repoDir, env: { ...process.env, DIAL_CONTROL_HOME: controlHome }, timeoutMs: 60000 }); return { command: r.command, ok: r.ok }; } });
  // 2. Project Truth git hooks: converged on EVERY role including fresh provider-container clones (GAP-022).
  const hooksPath = run('git', ['config', '--get', 'core.hooksPath'], { cwd: repoDir }).output;
  actions.push({ id: 'act.git-hooks', title: 'install Project Truth git hooks (core.hooksPath=.githooks)', needed: hooksPath !== '.githooks', run: () => { const r = run('bash', ['scripts/install-project-truth-hooks.sh'], { cwd: repoDir, timeoutMs: 30000 }); const after = run('git', ['config', '--get', 'core.hooksPath'], { cwd: repoDir }).output; return { command: r.command, ok: r.ok && after === '.githooks', hooks_path_after: after, output: r.output.slice(0, 200) }; } });
  // 3. Regenerate .mcp.json from the manifest (single source of MCP truth).
  const fragments = clientFragments(manifest, repoDir, role);
  const mcpFile = path.join(repoDir, '.mcp.json');
  const current = fs.existsSync(mcpFile) ? fs.readFileSync(mcpFile, 'utf8') : '';
  const desired = `${JSON.stringify(fragments.claude_mcp_json, null, 2)}\n`;
  let currentParsed = {}; try { currentParsed = JSON.parse(current || '{}'); } catch { currentParsed = {}; }
  actions.push({ id: 'act.mcp-json', title: 'regenerate .mcp.json from manifest.mcp_servers', needed: JSON.stringify(currentParsed) !== JSON.stringify(fragments.claude_mcp_json), backup: mcpFile, run: () => { fs.writeFileSync(mcpFile, desired); return { file: mcpFile, servers: Object.keys(fragments.claude_mcp_json.mcpServers) }; } });
  // 4. Host role file: written by the canonical fabric installer, never silently.
  if (!process.env.DIAL_HOST_ROLE && !fs.existsSync(process.env.DIAL_HOST_ROLE_FILE || '/etc/dial/host-role') && role !== 'provider-container') {
    const cls = manifest.roles[role]?.host_class;
    actions.push({ id: 'act.host-role-file', title: `declare host role with the canonical installer: bash deploy/oracle/execution-fabric/install-host-role.sh ${cls}`, needed: true, owner_action: true, run: () => ({ skipped: 'requires root; owner runs the canonical installer' }) });
  }
  // 5. Pinned package/runtime convergence (closure item 1).
  const converge = planConvergence({ manifest, role, pins });
  for (const a of converge) {
    if (a.state_hint === CONVERGE_STATES.NOT_APPLICABLE) continue;
    actions.push({ id: a.id, title: `${a.needed ? 'install' : 'verify'} ${a.item} via ${a.method}${a.pinned_version ? ` @${a.pinned_version}` : ''}`, needed: a.needed, pin_ready: a.pin_ready, missing_pin: a.missing_pin, owner_action: a.needed && !a.pin_ready, owner_record: a.owner_record, converge: a, run: () => { const r = executeConvergence({ actions: [a], dryRun: false }); const res = r.results[0]; return { ok: res.state === CONVERGE_STATES.APPLIED, state: res.state, executed: res.executed, owner_action: res.owner_action || null }; } });
  }
  // State-aware housekeeping is required on all persistent DIAL infrastructure roles.
  if (['dial-hermes-control', 'vekl-worker', 'oracle-admin'].includes(role)) {
    const hkHost = role === 'dial-hermes-control' ? 'dial-control' : role;
    actions.push({
      id: 'act.install-state-aware-housekeeping',
      title: 'install Hermes state-aware resource lifecycle housekeeping',
      needed: failed.has('systemd.dial-housekeeping.timer') || !fs.existsSync(path.join(process.env.HOME || '', '.local/bin/dial-housekeeping')) || !fs.existsSync(path.join(process.env.HOME || '', '.local/bin/dial-resource')),
      run: () => {
        const r = run('bash', ['deploy/oracle/hermes-codex/install-state-aware-housekeeping.sh'], {
          cwd: repoDir,
          timeoutMs: 10 * 60 * 1000,
          env: { ...process.env, DIAL_REPO_DIR: repoDir, DIAL_HOUSEKEEPING_HOST_ID: hkHost, DIAL_SERVICE_USER: process.env.USER || 'ubuntu' },
        });
        return { command: r.command, ok: r.ok, tail: r.output.split('\n').slice(-6) };
      },
    });
  }

  // 6. Canonical installers for the control plane (wrapped, never duplicated). They run only after the
  //    runtimes they need are converged through pinned channels: an installer that would itself pull an
  //    unpinned runtime is refused (closure item 1).
  if (role === 'dial-hermes-control') {
    const runtimesReady = converge.filter((a) => ['converge.rt.node', 'converge.rt.codex', 'converge.rt.claude-code', 'converge.rt.hermes'].includes(a.id)).every((a) => !a.needed);
    const installers = [
      ['act.install-control-runtime', 'deploy/oracle/execution-fabric/install-control-runtime.sh', ['systemd.dial-venue-guard.service', 'systemd.dial-remote-mcp-relay.service', 'systemd.dial-private-mcp-bind.service', 'fabric.qualifier']],
      ['act.install-control-plane', 'deploy/oracle/hermes-codex/install-control-plane.sh', ['systemd.dial-hermes-runtime.service', 'hermes.config', 'codex.config-pinned']],
      ['act.install-external-orchestrator', 'deploy/oracle/hermes-codex/install-external-orchestrator.sh', ['systemd.dial-hermes-orchestrator.service']],
      ['act.install-operations-plane', 'deploy/oracle/hermes-codex/install-operations-plane.sh', ['systemd.dial-hermes-operations.service']],
      ['act.install-chat-control', 'deploy/oracle/hermes-codex/install-chat-control-bridge.sh', ['systemd.dial-chat-control.service', 'systemd.dial-mission-controller.service']],
      ['act.install-operator-gateway', 'deploy/oracle/hermes-codex/install-operator-gateway.sh', ['systemd.dial-owner-steering.service']],
      ['act.install-status-publisher', 'deploy/oracle/hermes-codex/install-operator-status-publisher.sh', ['systemd.dial-operator-status-publisher.timer', 'hermes.oracle-status-mirror']],
      ['act.install-engineering-research', 'deploy/oracle/hermes-codex/install-engineering-research.sh', ['systemd.dial-engineering-research.timer']],
      ['act.install-recovery-peer', 'deploy/oracle/resource-fabric/install-recovery-peer.sh', ['systemd.dial-recovery-agent.service', 'systemd.dial-host-agent.timer']],
    ];
    for (const [id, script, when] of installers) {
      const needed = when.some((w) => failed.has(w));
      actions.push({ id, title: `run canonical installer ${script}`, needed, requires_auth: id === 'act.install-control-plane', blocked: needed && !runtimesReady, owner_action: needed && !runtimesReady, owner_record: runtimesReady ? null : 'runtimes must converge through pinned channels before canonical installers run', run: () => { if (!runtimesReady) return { ok: false, refused: 'runtimes not converged through pinned channels' }; const r = run('bash', [script], { cwd: repoDir, timeoutMs: 20 * 60 * 1000, env: { ...process.env, DIAL_REPO_DIR: repoDir, DIAL_CONTROL_HOME: controlHome } }); return { command: r.command, ok: r.ok, tail: r.output.split('\n').slice(-5) }; } });
    }
  }
  if (role === 'vekl-worker') {
    actions.push({ id: 'act.install-worker-agent', title: 'install vekl-worker job entrypoint, capability timer and structural-snapshot timer', needed: failed.has('systemd.dial-worker-agent.timer') || failed.has('systemd.dial-structural-snapshot.timer') || !fs.existsSync(path.join(process.env.HOME || '', '.local/bin/dial-worker-job')), run: () => { const r = run('bash', ['ops/development-bootstrap/workers/install-worker-agent.sh'], { cwd: repoDir, timeoutMs: 5 * 60 * 1000 }); return { command: r.command, ok: r.ok, tail: r.output.split('\n').slice(-3) }; } });
    actions.push({ id: 'act.install-background-coordinator', title: 'run canonical installer deploy/oracle/execution-fabric/phase3-install-coordinator.sh', needed: failed.has('systemd.dial-background-coordinator.service'), run: () => { const r = run('bash', ['deploy/oracle/execution-fabric/phase3-install-coordinator.sh'], { cwd: repoDir, timeoutMs: 10 * 60 * 1000, env: { ...process.env, DIAL_REPO_DIR: repoDir } }); return { command: r.command, ok: r.ok, tail: r.output.split('\n').slice(-3) }; } });
  }
  if (role === 'oracle-admin') {
    actions.push({ id: 'act.recovery-bootstrap', title: 'oracle-admin is provisioned by deploy/oracle/provisioning/bootstrap.sh (root, re-runnable); this bootstrap verifies only', needed: failed.has('systemd.dial-recovery-agent.service') || failed.has('systemd.dial-commander-remote.service'), owner_action: true, run: () => ({ skipped: 'sudo /opt/dial-recovery/bin/bootstrap.sh' }) });
  }
  return actions;
}

export function executeActions({ actions, dryRun, controlHome, runId, log }) {
  const results = [];
  for (const a of actions) {
    if (!a.needed) { results.push({ id: a.id, state: 'CONVERGED', title: a.title }); log?.ok(a.id, { status: 'CONVERGED', message: a.title }); continue; }
    if (a.owner_action) { results.push({ id: a.id, state: a.pin_ready === false ? 'PIN_MISSING' : 'OWNER_ACTION_REQUIRED', title: a.title, owner_record: a.owner_record || null, missing_pin: a.missing_pin || null }); log?.warn(a.id, { status: a.pin_ready === false ? 'PIN_MISSING' : 'OWNER_ACTION_REQUIRED', message: a.owner_record || a.title }); continue; }
    if (dryRun) { results.push({ id: a.id, state: 'PLANNED', title: a.title }); log?.warn(a.id, { status: 'PLANNED', message: a.title }); continue; }
    let backup = null;
    if (a.backup && controlHome) { try { backup = backupFile({ controlHome, runId, file: a.backup }); } catch (e) { log?.warn(`${a.id}.backup`, { message: e.message }); } }
    try { const out = a.run(); const ok = out?.ok !== false; const state = ok ? 'APPLIED' : (out?.state === 'OWNER_ACTION_REQUIRED' ? 'OWNER_ACTION_REQUIRED' : 'FAILED'); results.push({ id: a.id, state, title: a.title, backup: backup?.copy || null, result: out }); log?.[ok ? 'ok' : 'error'](a.id, { status: state, message: a.title }); }
    catch (e) { results.push({ id: a.id, state: 'FAILED', title: a.title, error: e.message }); log?.error(a.id, { status: 'FAILED', message: e.message }); }
  }
  return results;
}
