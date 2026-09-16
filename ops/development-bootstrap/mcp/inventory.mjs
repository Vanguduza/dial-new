import fs from 'node:fs';
import path from 'node:path';
import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { run, readJsonSafe } from '../lib/probes.mjs';

// One canonical MCP inventory (manifest.mcp_servers) drives client configuration checks and
// generated client fragments, so there is no second hand-maintained MCP list.
export function parseStdioCommand(command, repoDir) {
  const parts = String(command || '').trim().split(/\s+/).filter(Boolean);
  const executable = parts.shift();
  if (!['node', 'bash'].includes(executable) || parts.length !== 1) throw new Error(`unsupported canonical stdio command: ${command}`);
  const script = path.isAbsolute(parts[0]) ? parts[0] : path.join(repoDir, parts[0]);
  return { executable, script, client_args: [parts[0]], absolute_args: [script] };
}

export function clientFragments(manifest, repoDir, role = null) {
  const stdio = manifest.mcp_servers.filter((m) => m.transport === 'stdio' && m.command && (!role || m.hosts.includes(role)));
  return {
    claude_mcp_json: { mcpServers: Object.fromEntries(stdio.filter((m) => m.clients.includes('claude') && m.config_location === '.mcp.json').map((m) => {
      const parsed = parseStdioCommand(m.command, repoDir);
      return [m.name, { type: 'stdio', command: parsed.executable, args: parsed.client_args }];
    })) },
    codex_mcp_add: stdio.filter((m) => m.clients.includes('codex')).map((m) => {
      const parsed = parseStdioCommand(m.command, repoDir);
      return `codex mcp add ${m.name} -- ${parsed.executable} ${parsed.absolute_args[0]}`;
    }),
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
      let parsedCommand = null;
      try { parsedCommand = parseStdioCommand(m.command, repoDir); } catch (error) {
        checks.push(check({ id: `mcp.${m.name}.module`, domain, title: `${m.name} server command is canonical and syntax-valid`, status: STATUS.FAIL, criticality: m.criticality, evidence: { command: m.command, error: error.message }, remediation: 'use one canonical node <script> or bash <script> stdio command' }));
        continue;
      }
      const script = parsedCommand.script;
      const exists = fs.existsSync(script);
      const syntax = exists ? (parsedCommand.executable === 'node' ? run('node', ['--check', script], { timeoutMs: 10000 }) : run('bash', ['-n', script], { timeoutMs: 10000 })) : null;
      checks.push(check({ id: `mcp.${m.name}.module`, domain, title: `${m.name} server module present and syntax-valid`, status: exists && syntax.ok ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, evidence: { file: script, executable: parsedCommand.executable, command: syntax?.command, output: syntax?.output }, remediation: 'restore module from canonical branch' }));
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
      if (m.name === 'exa' && role === 'dial-hermes-control') {
        const probe = run('node', [path.join(path.dirname(new URL(import.meta.url).pathname), 'probe-exa.mjs')], { timeoutMs: 60000, cwd: repoDir });
        let parsed = null; try { parsed = JSON.parse(probe.output.split('\n').filter(Boolean).pop()); } catch {}
        checks.push(check({
          id: 'mcp.exa.functional-canary', domain,
          title: 'Exa official remote MCP live web_search_exa canary',
          status: probe.ok && parsed?.ok === true && parsed?.authentication === 'NONE' ? STATUS.PASS : STATUS.FAIL,
          criticality: m.criticality, readiness_class: m.readiness_class,
          evidence: {
            endpoint: parsed?.endpoint || 'https://mcp.exa.ai/mcp', authentication: parsed?.authentication || null,
            command: probe.command, tools: parsed?.tools || null, server_name: parsed?.server_name || null,
            server_version: parsed?.server_version || null, functional_canary: parsed?.functional_canary === true,
            error: parsed?.error || null,
          },
          remediation: 'verify outbound HTTPS to https://mcp.exa.ai/mcp and rerun node ops/development-bootstrap/mcp/probe-exa.mjs',
        }));
      }
    } else if (m.transport === 'http' && m.endpoint) {
      const health = `${m.endpoint.replace(/\/$/, '')}/health`;
      const probe = run('curl', ['-fsS', '--max-time', '5', health], { timeoutMs: 10000 });
      const semanticOk = probe.ok && (m.name !== 'dial.mcp.oracle-control' || /dial-chat-control/i.test(probe.output));
      checks.push(check({ id: `mcp.${m.name}.health`, domain, title: `${m.name} live health endpoint`, status: semanticOk ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, readiness_class: m.readiness_class, evidence: { endpoint: health, command: probe.command, exit: probe.status, response_marker_ok: semanticOk, output: probe.output.slice(0, 240) }, remediation: 'start/reinstall the declared MCP service and verify its loopback health endpoint' }));
    } else if (m.name === 'github') {
      const r = run('git', ['ls-remote', '--heads', 'origin', 'master'], { cwd: repoDir, timeoutMs: 30000 });
      checks.push(check({ id: 'mcp.github.repository-reach', domain, title: 'GitHub repository reachable with credentials (git ls-remote origin master)', status: r.ok ? STATUS.PASS : STATUS.FAIL, criticality: m.criticality, evidence: { command: r.command, output: r.output.slice(0, 120) }, remediation: 'reconnect GitHub under claude.ai Settings -> Connectors or install a deploy key' }));
    }
  }
  return checks;
}
