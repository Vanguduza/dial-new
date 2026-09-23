#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  discoverProjectionProjects,
  openVikingHealth,
  openVikingProjectionStatus,
  projectAdmittedMemoryToOpenViking,
} from './openviking-shared-context.mjs';

export async function runOpenVikingProjection({ projects = null, root = process.env.DIAL_CONTROL_HOME, limit = 200 } = {}) {
  const selected = projects?.length ? projects : discoverProjectionProjects(root);
  const health = await openVikingHealth({ root });
  if (!health.available) {
    return {
      ok: false,
      state: 'DEGRADED_OPENVIKING_UNAVAILABLE',
      health,
      projects: selected.map((project) => openVikingProjectionStatus(project, root)),
    };
  }
  const results = [];
  for (const project of selected) {
    results.push(await projectAdmittedMemoryToOpenViking({ project, root, limit }));
  }
  return {
    ok: results.every((item) => item.ok),
    state: results.every((item) => item.ok) ? 'PROJECTED' : 'DEGRADED',
    health: { available: true, latency_ms: health.latency_ms },
    projects: results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const projects = [];
  let limit = 200;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--project' && args[i + 1]) projects.push(args[++i]);
    else if (args[i] === '--limit' && args[i + 1]) limit = Number(args[++i]) || 200;
    else throw new Error(`unknown argument ${args[i]}`);
  }
  const result = await runOpenVikingProjection({ projects: projects.length ? projects : null, limit });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
