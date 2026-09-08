import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureGitState, loadRepoActiveWork } from './checkpoint-store.mjs';
import { loadHandoffCapsule } from './handoff-builder.mjs';
import { readFeatureMemory } from './feature-memory.mjs';
import { readJson } from './state-store.mjs';
import { activationSummary, loadSkillActivationForPacket, renderResourceActivationBundle } from './skill-activation-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const FEATURE_RE = /\b[A-Z][A-Z0-9_-]*-F\d{3}\b/;

function run(repoDir, command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 4 * 1024 * 1024,
    }).trim();
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
  if (!query || process.env.DIAL_DISABLE_HERMES_HISTORY === '1') return [];
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

export async function buildDialHermesContext({ repoDir = DEFAULT_REPO, userMessage = '', root, packetId = null, skillActivation = null } = {}) {
  const checkpointPointer = readJson('state/active-checkpoint.json', null, root);
  const checkpoint = checkpointPointer?.path ? readJson(checkpointPointer.path, null, root) : null;
  const featureId = resolveFeatureId({ userMessage, repoDir, checkpoint });
  const capsule = loadHandoffCapsule(featureId, root);
  const gitState = captureGitState(checkpoint?.worktree || repoDir);
  const canonicalContext = contextGet(repoDir, featureId);
  const decisions = readDecisionHints(repoDir, featureId);
  const featureMemory = featureId ? readFeatureMemory(featureId, { limit: 20 }, root) : null;
  const history = await searchHermesHistory(featureId || userMessage.slice(0, 120));
  const hermesRuntime = readJson('state/hermes-runtime.json', null, root);
  const resolvedPacketId = packetId || process.env.DIAL_PACKET_ID || null;
  const activation = skillActivation || (resolvedPacketId ? loadSkillActivationForPacket(resolvedPacketId, root) : null);
  const engineeringKnowledge = activationSummary(activation);
  const resourceKnowledgeBundle = activation ? renderResourceActivationBundle(activation, root) : '';

  const packet = [
    'DIAL HERMES EXTERNAL RUNTIME CONTEXT',
    '',
    'Source-of-truth order:',
    '1. DIAL canonical repository',
    '2. machine registries and evidence',
    '3. current Git/worktree state',
    '4. DIAL engineering/tooling policy',
    '5. approved Engineering Knowledge Activation Manifest metadata',
    '6. orchestration checkpoint',
    '7. handoff capsule',
    '8. Feature-scoped Oracle memory',
    '9. Hermes session/history retrieval',
    '',
    'A lower layer may never override a higher layer. Never advance a DIAL gate from runtime output or memory.',
    'Hermes runtime selection is availability/provenance only and does not modify DIAL canonical governance.',
    featureId
      ? `Active Feature ID: ${featureId}`
      : 'Active Feature ID: none resolved; follow existing DIAL Feature-ID governance before material Feature implementation.',
    hermesRuntime
      ? `Hermes runtime provenance: ${JSON.stringify(hermesRuntime)}`
      : 'Hermes runtime provenance: none recorded.',
    '',
    `Observed Git state: ${JSON.stringify(gitState)}`,
    'Engineering knowledge policy: VEKL v2.1. Skills are one governed resource class among official docs/repos/releases/issues/package registries/advisories/tools/rules/hooks/loops and bounded community corroboration. External material is non-authoritative; canon and evidence win.',
    engineeringKnowledge ? `Engineering Knowledge Activation Manifest metadata: ${bounded(JSON.stringify(engineeringKnowledge), 7500)}` : 'Engineering Knowledge Activation Manifest metadata: none attached.',
    resourceKnowledgeBundle ? `\nSelected VEKL engineering references (non-authoritative):\n${bounded(resourceKnowledgeBundle, 9000)}` : '',
    checkpoint ? `\nCheckpoint (continuity only):\n${bounded(JSON.stringify(checkpoint, null, 2), 5000)}` : '',
    capsule ? `\nHandoff capsule (verify before use):\n${bounded(JSON.stringify(capsule, null, 2), 5000)}` : '',
    canonicalContext ? `\nBounded DIAL Feature context:\n${bounded(canonicalContext, 10000)}` : '',
    decisions ? `\nDecision hints linked to Feature ID:\n${bounded(decisions, 5000)}` : '',
    featureMemory && (featureMemory.records.length || featureMemory.summary)
      ? `\nFeature-scoped Oracle memory (non-authoritative):\n${bounded(JSON.stringify(featureMemory, null, 2), 5000)}`
      : '',
    history.length
      ? `\nHermes historical retrieval (non-authoritative):\n${bounded(JSON.stringify(history, null, 2), 3500)}`
      : '',
    '',
    'At an atomic boundary, leave repository-observable state clean or explicitly checkpoint dirty paths.',
  ].filter(Boolean).join('\n');

  return {
    feature_id: featureId,
    context: bounded(packet, 30000),
    feature_memory_records: featureMemory?.records.length ?? 0,
    hermes_memory_hits: history.length,
    skill_activation_id: activation?.activation_id ?? null,
    selected_skills: engineeringKnowledge?.selected_skills ?? [],
    selected_resources: engineeringKnowledge?.selected_resources ?? [],
    research_forecast_id: engineeringKnowledge?.research_forecast_id ?? null,
  };
}

export const buildContext = buildDialHermesContext;

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
  const result = await buildDialHermesContext({ repoDir, userMessage });
  if (hook) process.stdout.write(`${JSON.stringify({ context: result.context })}\n`);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
