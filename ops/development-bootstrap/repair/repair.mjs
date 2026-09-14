import fs from 'node:fs';
import path from 'node:path';
import { STATUS } from '../lib/result.mjs';
import { backupFile } from '../lib/backup.mjs';
import { clientFragments } from '../mcp/inventory.mjs';
import { run } from '../lib/probes.mjs';

// Convergence actions. Each action is detect-first and idempotent: it reads current state, decides
// whether a change is needed, backs up the target, then (unless dry-run) applies. Actions never embed
// secrets and never authenticate; authentication remains an owner gate.
export function planActions({ role, manifest, repoDir, controlHome, checks = [] }) {
  const failed = new Set(checks.filter((c) => c.status === STATUS.FAIL).map((c) => c.id));
  const actions = [];
  // 1. Control home layout (control host only).
  if (role === 'dial-hermes-control') actions.push({ id: 'act.control-home', title: `ensure control home ${controlHome} (0700) and canonical layout`, needed: !fs.existsSync(controlHome) || failed.has('security.control-home-modes'), run: () => { fs.mkdirSync(controlHome, { recursive: true, mode: 0o700 }); fs.chmodSync(controlHome, 0o700); const r = run('node', ['agent-system/orchestration/supervisor.mjs', 'init'], { cwd: repoDir, env: { ...process.env, DIAL_CONTROL_HOME: controlHome }, timeoutMs: 60000 }); return { command: r.command, ok: r.ok }; } });
  // 2. Project Truth git hooks.
  const hooksPath = run('git', ['config', '--get', 'core.hooksPath'], { cwd: repoDir }).output;
  actions.push({ id: 'act.git-hooks', title: 'install Project Truth git hooks (core.hooksPath=.githooks)', needed: hooksPath !== '.githooks' && role !== 'provider-container', run: () => { const r = run('bash', ['scripts/install-project-truth-hooks.sh'], { cwd: repoDir, timeoutMs: 30000 }); return { command: r.command, ok: r.ok, output: r.output.slice(0, 200) }; } });
  // 3. Regenerate .mcp.json from the manifest (single source of MCP truth).
  const fragments = clientFragments(manifest, repoDir, role);
  const mcpFile = path.join(repoDir, '.mcp.json');
  const current = fs.existsSync(mcpFile) ? fs.readFileSync(mcpFile, 'utf8') : '';
  const desired = `${JSON.stringify(fragments.claude_mcp_json, null, 2)}\n`;
  actions.push({ id: 'act.mcp-json', title: 'regenerate .mcp.json from manifest.mcp_servers', needed: JSON.stringify(JSON.parse(current || '{}')) !== JSON.stringify(fragments.claude_mcp_json), backup: mcpFile, run: () => { fs.writeFileSync(mcpFile, desired); return { file: mcpFile, servers: Object.keys(fragments.claude_mcp_json.mcpServers) }; } });
  // 4. Host role file guidance (requires root; never done silently).
  if (!process.env.DIAL_HOST_ROLE && !fs.existsSync('/etc/dial/host-role') && role !== 'provider-container') actions.push({ id: 'act.host-role-file', title: `declare host role: echo ${role} | sudo tee /etc/dial/host-role && sudo chmod 644 /etc/dial/host-role`, needed: true, owner_action: true, run: () => ({ skipped: 'requires root; owner runs the printed command' }) });
  // 5. Canonical installers for the control plane (wrapped, never duplicated).
  if (role === 'dial-hermes-control') {
    for (const [id, script, when] of [['act.install-control-plane', 'deploy/oracle/hermes-codex/install-control-plane.sh', ['systemd.dial-hermes-runtime.service', 'hermes.config', 'codex.config-pinned']], ['act.install-external-orchestrator', 'deploy/oracle/hermes-codex/install-external-orchestrator.sh', ['systemd.dial-hermes-orchestrator.service']], ['act.install-operations-plane', 'deploy/oracle/hermes-codex/install-operations-plane.sh', ['systemd.dial-hermes-operations.service']], ['act.install-chat-control', 'deploy/oracle/hermes-codex/install-chat-control-bridge.sh', ['systemd.dial-chat-control.service', 'systemd.dial-mission-controller.service']], ['act.install-operator-gateway', 'deploy/oracle/hermes-codex/install-operator-gateway.sh', ['systemd.dial-owner-steering.service']], ['act.install-status-publisher', 'deploy/oracle/hermes-codex/install-operator-status-publisher.sh', ['systemd.dial-operator-status-publisher.timer', 'hermes.oracle-status-mirror']], ['act.install-engineering-research', 'deploy/oracle/hermes-codex/install-engineering-research.sh', ['systemd.dial-engineering-research.timer']]]) {
      actions.push({ id, title: `run canonical installer ${script}`, needed: when.some((w) => failed.has(w)), requires_auth: id === 'act.install-control-plane', run: () => { const r = run('bash', [script], { cwd: repoDir, timeoutMs: 20 * 60 * 1000, env: { ...process.env, DIAL_REPO_DIR: repoDir, DIAL_CONTROL_HOME: controlHome } }); return { command: r.command, ok: r.ok, tail: r.output.split('\n').slice(-5) }; } });
    }
  }
  if (role === 'vekl-worker') actions.push({ id: 'act.install-worker-agent', title: 'install vekl-worker job entrypoint and capability timer', needed: failed.has('systemd.dial-worker-agent.timer') || !fs.existsSync(path.join(process.env.HOME || '', '.local/bin/dial-worker-job')), run: () => { const r = run('bash', ['ops/development-bootstrap/workers/install-worker-agent.sh'], { cwd: repoDir, timeoutMs: 5 * 60 * 1000 }); return { command: r.command, ok: r.ok, tail: r.output.split('\n').slice(-3) }; } });
  return actions;
}

export function executeActions({ actions, dryRun, controlHome, runId, log }) {
  const results = [];
  for (const a of actions) {
    if (!a.needed) { results.push({ id: a.id, state: 'CONVERGED', title: a.title }); log?.ok(a.id, { status: 'CONVERGED', message: a.title }); continue; }
    if (dryRun || a.owner_action) { results.push({ id: a.id, state: a.owner_action ? 'OWNER_ACTION_REQUIRED' : 'PLANNED', title: a.title }); log?.warn(a.id, { status: a.owner_action ? 'OWNER_ACTION_REQUIRED' : 'PLANNED', message: a.title }); continue; }
    let backup = null;
    if (a.backup && controlHome) { try { backup = backupFile({ controlHome, runId, file: a.backup }); } catch (e) { log?.warn(`${a.id}.backup`, { message: e.message }); } }
    try { const out = a.run(); const ok = out?.ok !== false; results.push({ id: a.id, state: ok ? 'APPLIED' : 'FAILED', title: a.title, backup: backup?.copy || null, result: out }); log?.[ok ? 'ok' : 'error'](a.id, { status: ok ? 'APPLIED' : 'FAILED', message: a.title }); }
    catch (e) { results.push({ id: a.id, state: 'FAILED', title: a.title, error: e.message }); log?.error(a.id, { status: 'FAILED', message: e.message }); }
  }
  return results;
}
