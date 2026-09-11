#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildAssetManifest } from '../../../packages/packaging/src/index.js';
import { getPackRoot, runPipeline, validateJobFile } from '../../../packages/pipeline-core/src/index.js';
import { readJson } from '../../../packages/pipeline-core/src/index.js';
import { generateVehicle } from '../../../packages/pipeline-core/src/index.js';
import { validateSceneJob } from '../../../packages/scene-engine/src/index.js';
import { produceBatch } from '../../../packages/scene-engine/src/index.js';
import { loadReconstructionWorkers } from '../../../packages/scene-engine/src/index.js';
import { prepareRasterSource } from '../../../packages/scene-engine/src/index.js';
import { runGuardedTransition } from '../../../packages/scene-engine/src/index.js';

const HELP = `Dial Visual Transformation Generator

Usage:
  dial-visual validate <job.json>
  dial-visual generate <job.json> [--from <stage>] [--force]
  dial-visual raster <source.json> [--prepare-only]
  dial-visual batch <production-plan.json> [--workers <trusted-workers.json>]
  dial-visual qa <job.json>
  dial-visual package <job.json>
  dial-visual preview [visual-family-id]
  dial-visual --help

Stages may be written as cgi, technical, lineart, explosion, animate, qa, or their full numbered name.`;

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const [,, command, target] = process.argv;

async function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') { console.log(HELP); return; }
  if (command === 'raster') {
    if (!target) throw new Error('A raster source manifest is required');
    const prepared = await prepareRasterSource(target);
    const result = process.argv.includes('--prepare-only') ? prepared : await runGuardedTransition(prepared.jobPath, (event) => console.log(JSON.stringify(event)));
    console.log(JSON.stringify({ ...("packRoot" in result ? { packRoot: result.packRoot, status: result.status } : { jobPath: prepared.jobPath }), automatedChecksPassed: result.qa.passed, customerReady: false }, null, 2)); return;
  }
  if (command === 'batch') {
    if (!target) throw new Error('A production plan JSON path is required');
    const workerConfig = option('--workers');
    const providers = workerConfig ? await loadReconstructionWorkers(workerConfig) : [];
    const summary = await produceBatch(target, providers, (event) => console.log(JSON.stringify(event)));
    console.log(JSON.stringify(summary, null, 2));
    // Nonzero means some items remain unresolved; successfully built packs and checkpoints are retained.
    if (summary.needsReconstruction || summary.repairExhausted) process.exitCode = 2;
    return;
  }
  if (command === 'validate') {
    if (!target) throw new Error('A job JSON path is required');
    const input = JSON.parse(await readFile(target, 'utf8'));
    if (input.sceneEngineVersion !== undefined) {
      const result = await validateSceneJob(target);
      console.log(JSON.stringify({ valid: result.qa.passed, visualFamilyId: result.job.visualFamilyId, productionPublishable: false, qa: result.qa }, null, 2)); return;
    }
    const result = await validateJobFile(target); console.log(JSON.stringify({ valid: true, visualFamilyId: result.job.visualFamilyId, productionPublishable: result.productionPublishable, source: result.source }, null, 2)); return;
  }
  if (command === 'generate') {
    if (!target) throw new Error('A job JSON path is required');
    const events: Record<string, unknown>[] = [];
    const result = await generateVehicle(target, { from: option('--from'), force: process.argv.includes('--force'), onEvent: (event) => { events.push(event); console.log(`${event.type}: ${event.stage ?? event.visualFamilyId ?? ''}`); } });
    console.log(JSON.stringify({ ok: true, ...result, events: events.length }, null, 2)); return;
  }
  if (command === 'qa') {
    if (!target) throw new Error('A job JSON path is required');
    const root = await getPackRoot(target); const qa = await readJson(resolve(root, 'qa', 'qa.json')); console.log(JSON.stringify(qa, null, 2)); return;
  }
  if (command === 'package') {
    if (!target) throw new Error('A job JSON path is required');
    const root = await getPackRoot(target); const manifest = await buildAssetManifest(root); console.log(JSON.stringify({ packaged: true, root, assets: manifest.assets.length }, null, 2)); return;
  }
  if (command === 'preview') {
    const family = target ?? 'VF-TOYOTA-HILUX-AN130-DC-FL';
    console.log(`Starting preview for ${family} at http://localhost:3000`);
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', 'apps/preview-player', 'run', 'dev', '--workspaces=false'], { cwd: process.cwd(), stdio: 'inherit', shell: false });
    await new Promise<void>((resolvePromise, reject) => { child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`Preview exited with ${code}`))); }); return;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
