#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildAssetManifest } from '../../../packages/packaging/src/index.js';
import { getPackRoot, runPipeline, validateJobFile } from '../../../packages/pipeline-core/src/index.js';
import { readJson } from '../../../packages/pipeline-core/src/fs.js';

const HELP = `Dial Visual Transformation Generator

Usage:
  dial-visual validate <job.json>
  dial-visual generate <job.json> [--from <stage>] [--force]
  dial-visual qa <job.json>
  dial-visual package <job.json>
  dial-visual preview [visual-family-id]
  dial-visual --help

Stages may be written as cgi, technical, lineart, explosion, animate, qa, or their full numbered name.`;

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
const [,, command, target] = process.argv;

async function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') { console.log(HELP); return; }
  if (command === 'validate') {
    if (!target) throw new Error('A job JSON path is required');
    const result = await validateJobFile(target); console.log(JSON.stringify({ valid: true, visualFamilyId: result.job.visualFamilyId, productionPublishable: result.productionPublishable, source: result.source }, null, 2)); return;
  }
  if (command === 'generate') {
    if (!target) throw new Error('A job JSON path is required');
    const events: Record<string, unknown>[] = [];
    const result = await runPipeline(target, { from: option('--from'), force: process.argv.includes('--force'), onEvent: (event) => { events.push(event); console.log(`${event.type}: ${event.stage ?? event.visualFamilyId}`); } });
    console.log(JSON.stringify({ ok: true, jobId: result.jobId, packRoot: result.packRoot, productionPublishable: result.state.productionPublishable, events: events.length }, null, 2)); return;
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
