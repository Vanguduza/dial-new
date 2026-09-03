import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureGitState, loadRepoActiveWork } from './checkpoint-store.mjs';
import { loadHandoffCapsule } from './handoff-builder.mjs';
import { readFeatureMemory } from './feature-memory.mjs';
import { readJson } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const FEATURE_RE = /\b[A-Z][A-Z0-9_-]*-F\d{3}\b/;

function run(repoDir, command, args) {
  try {
    return execFileSync(command, args, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

function bounded(text, max = 12000) {
  if (!text) return '';
  const value = String(text).trim();
  return value.length > max ? `${value.slice(0, max)}\n…[bounded]` : value;
}

export function resolveFeatureId({ userMessage = '', repoDir = DEFAULT_REPO, checkpoint = null } = {}) {
  const explicit = String(userMessage).match(FEATURE_RE)?.[0];
  if (explicit) return explicit;
  if (checkpoint?.feature_id) return checkpoint.feature_id;
  return loadRepoActiveWork(repoDir).feature_id ?? null;
}

async function searchHermesHistory(query) {
  if (!query) return [];
  const base = process.env.HERMES_DASHBOARD_URL || 'http://127.0.0.1:9119';
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/sessions/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return [];
    const body = await response.json();
    const raw = Array.isArray(body) ? body : body?.results ?? body?.sessions ?? [];
    return raw.slice(0, 3).map((item) => ({
      session_id: item.session_id ?? item.id ?? null,
      title: bounded(item.title ?? '', 180),
      snippet: bounded(item.snippet ?? item.highlight ?? item.content ?? '', 900),
    }));
  } catch {
    return [];
  }
}

function contextGet(repoDir, featureId) {
  if (!featureId) return '';
  return run(repoDir, 'node', ['agent-system/bin/context-get.mjs', featureId]);
}

function readDecisionHints(repoDir, featureId) {
  if (!featureId) return '';
  const target = path.join(repoDir, 'agent-system/registries/DECISION_LOG.json');
  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);
    const decisions = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
    const matching = decisions.filter((entry) => JSON.stringify(entry).includes(featureId)).slice(0, 6);
    return matching.length ? JSON.stringify(matching, null, 2) : '';
  } catch {
    return '';
  }
}

export async function buildDevelopmentManagerContext({ repoDir = DEFAULT_REPO, userMessage = '', root } = {}) {
  const checkpoint = readJson('state/active-checkpoint.json', null, root);
  const checkpointValue = checkpoint?.path ? readJson(checkpoint.path, null, root) : null;
  const featureId = resolveFeatureId({ userMessage, repoDir, checkpoint: checkpointValue });
  const capsule = loadHandoffCapsule(featureId, root);
  const gitState = captureGitState(checkpointValue?.worktree || repoDir);
  const boundedContext = contextGet(repoDir, featureId);
  const decisions = readDecisionHints(repoDir, featureId);
  const featureMemory = featureId ? readFeatureMemory(featureId, { limit: 20 }, root) : null;
  const memoryHits = await searchHermesHistory(featureId || userMessage.slice(0, 120));
  const developmentManager = readJson('state/development-manager.json', null, root);
  const hermesRuntime = readJson('state/hermes-runtime.json', null, root);

  const packet = [
    'DIAL DEVELOPMENT MANAGER CONTEXT',
    '',
    'Authority order:',
    '1. DIAL canonical repository',
    '2. machine registries and evidence',
    '3. current Git/worktree state',
    '4. DIAL orchestration checkpoint',
    '5. handoff capsule',
    '6. Feature-scoped Oracle memory',
    '7. Hermes session/history retrieval',
    '8. historical conversational material',
    '',
    'A lower layer may never override a higher layer. Never advance a gate from model assertion or memory.',
    'Hermes runtime identity is continuity context only and does not grant Development Manager Chair authority.',
    featureId ? `Active Feature ID: ${featureId}` : 'Active Feature ID: none resolved; do not perform material implementation until one is resolved.',
    developmentManager ? `Development Manager Chair assignment: ${JSON.stringify(developmentManager)}` : 'Development Manager Chair assignment: none recorded.',
    hermesRuntime ? `Hermes runtime selection (runtime-only authority): ${JSON.stringify(hermesRuntime)}` : 'Hermes runtime selection: none recorded.',
    '',
    `Observed Git state: ${JSON.stringify(gitState)}`,
    checkpointValue ? `\nCheckpoint (continuity only):\n${bounded(JSON.stringify(checkpointValue, null, 2), 5000)}` : '',
    capsule ? `\nHandoff capsule (verify before use):\n${bounded(JSON.stringify(capsule, null, 2), 5000)}` : '',
    boundedContext ? `\nBounded DIAL Feature context:\n${bounded(boundedContext, 10000)}` : '',
    decisions ? `\nDecision hints linked to Feature ID:\n${bounded(decisions, 5000)}` : '',
    featureMemory && (featureMemory.records.length || featureMemory.summary)
      ? `\nFeature-scoped Oracle memory (non-authoritative):\n${bounded(JSON.stringify(featureMemory, null, 2), 5000)}`
      : '',
    memoryHits.length ? `\nHermes historical retrieval (non-authoritative):\n${bounded(JSON.stringify(memoryHits, null, 2), 3500)}` : '',
    '',
    'At an atomic boundary, leave repository-observable state clean or explicitly checkpoint dirty paths. Preserve independent-review requirements.',
  ].filter(Boolean).join('\n');

  return {
    feature_id: featureId,
    context: bounded(packet, 30000),
    feature_memory_records: featureMemory?.records.length ?? 0,
    hermes_memory_hits: memoryHits.length,
  };
}

// Compatibility alias for callers that used the old generic name. The generated
// packet is explicitly a Development Manager Chair packet, not a Hermes runtime packet.
export const buildManagerContext = buildDevelopmentManagerContext;

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  try { return input ? JSON.parse(input) : {}; } catch { return {}; }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const hook = args.has('--hook');
  const payload = hook ? await readStdin() : {};
  const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
  const userMessage = payload.user_message ?? payload.message ?? process.env.DIAL_USER_MESSAGE ?? '';
  const result = await buildDevelopmentManagerContext({ repoDir, userMessage });
  if (hook) {
    process.stdout.write(`${JSON.stringify({ context: result.context })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
