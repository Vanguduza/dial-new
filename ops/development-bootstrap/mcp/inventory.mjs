import fs from 'node:fs';
import path from 'node:path';
import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { run, readJsonSafe } from '../lib/probes.mjs';

// One canonical MCP inventory (manifest.mcp_servers) drives client configuration checks and
// generated client fragments, so there is no second hand-maintained MCP list.
export function clientFragments(manifest, repoDir, role = null) {
  const stdio = manifest.mcp_servers.filter((m) => m.transport === 'stdio' && m.command && (!role || m.hosts.includes(role)));
  return {
    claude_mcp_json: { mcpServers: Object.fromEntries(stdio.filter((m) => m.clients.includes('claude') && m.config_location === '.mcp.json').map((m) => [m.name, { type: 'stdio', command: 'node', args: [m.command.replace(/^node /, '')] }])) },
    codex_mcp_add: stdio.filter((m) => m.clients.includes('codex')).map((m) => `codex mcp add ${m.name} -- node ${path.join(repoDir, m.command.replace(/^node /, ''))}`),
  };
}

export function certifyMcp({ role, manifest, repoDir }) {
  const domain = 'MCP';
  const checks = [];
  const repoMcp = readJsonSafe(path.join(repoDir, '.mcp.json'), { mcpServers: {} });
  for (const m of manifest.mcp_servers) {
    if (!m.hosts.includes(role)) { checks.push(check({ id: `mcp.${m.name}.placement`, domain, title: `${m.name} not placed on ${role}`, status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { hosts: m.hosts } })); continue; }
    if (m.status_note && /NOT_IMPLEMENTED|Absent/.test(m.status_note)) { checks.push(check({ id: `mcp.${m.name}.implemented`, domain, title: `${m.name}: ${m.status_note}`, status: STATUS.FAIL, criticality: m.criticality, evidence: { config_location: m.config_location }, remediation: 'implement or mark deprecated; do not enable a described-only server' })); continue; }
    if (m.transport === 'stdio' && m.command) {
      const script = path.join(repoDir, m.command.replace(/^node /, ''));
      const exists = fs.existsSync(script);
      const syntax = exists ? run('node', ['--check', script], { timeoutMs: 10000 }) : null;
      checks.push(check({ id: `mcp.${m.name}.module`, domain, title: `${m.name} server module present and syntax-valid`, status: exists && syntax.ok ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, evidence: { file: script, command: syntax?.command, output: syntax?.output }, remediation: 'restore module from canonical branch' }));
      if (m.clients.includes('claude') && m.config_location === '.mcp.json') {
        const registered = Boolean(repoMcp.mcpServers?.[m.name]);
        checks.push(check({ id: `mcp.${m.name}.registered`, domain, title: `${m.name} registered in .mcp.json`, status: registered ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, evidence: { file: '.mcp.json', registered }, remediation: 'bootstrap --apply regenerates .mcp.json from the manifest' }));
      }
      if (m.name === 'dial-oracle-status') {
        // Harmless capability probe: speak MCP over stdio and call the single tool.
        const probe = run('node', [path.join(path.dirname(new URL(import.meta.url).pathname), 'probe-stdio.mjs'), script], { timeoutMs: 40000, cwd: repoDir });
        let parsed = null; try { parsed = JSON.parse(probe.output.split('\n').filter(Boolean).pop()); } catch {}
        checks.push(check({ id: `mcp.${m.name}.capability-probe`, domain, title: `${m.name} answers tools/list and dial_oracle_status over stdio`, status: parsed?.ok ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, evidence: { command: probe.command, tools: parsed?.tools || null, available: parsed?.available ?? null, fresh: parsed?.fresh ?? null, output: parsed ? undefined : probe.output.slice(0, 400) }, remediation: 'node agent-system/orchestration/claude-oracle-status-mcp.mjs must start and answer JSON-RPC' }));
      }
    } else if (m.transport === 'http' && m.endpoint) {
      checks.push(check({ id: `mcp.${m.name}.health`, domain, title: `${m.name} health endpoint`, status: STATUS.UNVERIFIED, criticality: m.criticality, evidence: { endpoint: `${m.endpoint}/health` }, remediation: 'verified by systemd/units check on the control host' }));
    } else if (m.name === 'github') {
      const r = run('git', ['ls-remote', '--heads', 'origin', 'master'], { cwd: repoDir, timeoutMs: 30000 });
      checks.push(check({ id: 'mcp.github.repository-reach', domain, title: 'GitHub repository reachable with credentials (git ls-remote origin master)', status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, evidence: { command: r.command, output: r.output.slice(0, 120) }, remediation: 'reconnect GitHub under claude.ai Settings -> Connectors or install a deploy key' }));
    }
  }
  return checks;
}
