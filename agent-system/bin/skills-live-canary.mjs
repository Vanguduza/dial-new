#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolveEngineeringSkills } from '../orchestration/skill-resolver.mjs';
import { resolveEngineeringResources } from '../orchestration/engineering-resource-resolver.mjs';
import { persistSkillActivation, renderSkillActivationBundle, verifySkillActivation } from '../orchestration/skill-activation-store.mjs';
import { probeCodexAppServer } from '../orchestration/codex-app-server-probe.mjs';
import { probeClaudeCode } from '../orchestration/claude-code-probe.mjs';
import { runPrimaryHermes } from '../orchestration/hermes-runtime-executor.mjs';
import { runClaudeHermesFallback } from '../orchestration/claude-fallback-runner.mjs';
import { reconcileHermesRuntime } from '../orchestration/hermes-runtime-router.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, writeJsonAtomic } from '../orchestration/state-store.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
const now = () => new Date().toISOString();
const stamp = () => now().replace(/[-:.]/g, '').replace('Z','Z');
const repoHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
const packetId = `vekl-qualification-${crypto.randomUUID()}`;
const instruction = 'Read-only VEKL qualification: review responsive Android Compose UI considerations for tablet and foldable. Do not modify files, install anything, or change architecture. Reply with exactly DIAL_VEKL_PRIMARY_CANARY_OK.';
const affectedPaths = ['apps/consumer-android/src/main/kotlin/VEKLQualification.kt'];
const fallbackOnly = process.argv.includes('--fallback-only');

ensureControlLayout(root);
const skillPlan = resolveEngineeringSkills({ repoDir, instruction, affectedPaths, metadata: { max_skills: 3, qualification_canary: true } });
const resourcePlan = resolveEngineeringResources({ repoDir, root, instruction, affectedPaths, maxResources: 6 });
const plan = { ...skillPlan, policy_version: 'vekl-2.0', selected_resources: resourcePlan.selected_resources, resource_rejected: resourcePlan.rejected, resource_task_classes: resourcePlan.task_classes };
if (!plan.execution_allowed || plan.resolution_state !== 'SELECTED_APPROVED_SKILLS' || plan.selected_skills.length < 1 || plan.selected_resources.length < 1) {
  throw new Error(`VEKL v2 qualification resolver did not select approved skills/resources: ${JSON.stringify(plan)}`);
}
const manifest = persistSkillActivation({
  packetId,
  missionId: 'dial-development-root',
  featureIds: [],
  plan,
  root,
});
const verified = verifySkillActivation(manifest, root);
if (!verified.ok) throw new Error(`VEKL activation verification failed: ${JSON.stringify(verified)}`);

const codexProbe = await probeCodexAppServer({ repoDir, root });
const claudeProbe = probeClaudeCode({ repoDir, root });
const limitedPrimaryStates = new Set(['ACCOUNT_LIMITED', 'RATE_LIMITED', 'MODEL_LIMITED']);
if (fallbackOnly) {
  if (codexProbe.requested_model !== 'gpt-5.6-sol' || codexProbe.resolved_model !== 'gpt-5.6-sol' || codexProbe.identity_proven !== true || !limitedPrimaryStates.has(codexProbe.state)) {
    throw new Error(`fallback-only VEKL canary requires exact Sol identity with a temporary provider limitation: ${JSON.stringify(codexProbe)}`);
  }
} else if (codexProbe.state !== 'HEALTHY' || codexProbe.resolved_model !== 'gpt-5.6-sol') {
  throw new Error('exact Sol probe is not healthy');
}
if (claudeProbe.state !== 'HEALTHY' || claudeProbe.resolved_model !== 'claude-sonnet-5') throw new Error('exact Sonnet 5 probe is not healthy');

let primary = null;
if (!fallbackOnly) {
  const primarySelection = reconcileHermesRuntime({ root });
  if (primarySelection?.selection?.runtime !== 'codex_app_server') throw new Error('Sol was not selected for VEKL canary primary');
  primary = runPrimaryHermes({ repoDir, root, packetId, skillActivation: manifest, instruction, timeoutMs: 180000 });
  if (!primary.ok || primary.resolved_model !== 'gpt-5.6-sol') throw new Error(`VEKL Sol canary failed: ${JSON.stringify(primary)}`);
}

const fallbackSelection = reconcileHermesRuntime({ root, includeRuntimes: ['claude_code'] });
if (fallbackSelection?.selection?.runtime !== 'claude_code') throw new Error('Sonnet 5 was not selected for VEKL canary fallback');
const bundle = renderSkillActivationBundle(manifest, root);
const fallback = await runClaudeHermesFallback({
  repoDir,
  root,
  packetId,
  skillActivation: manifest,
  skillBundle: bundle,
  mode: 'qualification',
  instruction: 'Reply with exactly DIAL_VEKL_SONNET_CANARY_OK. Do not modify files and do not use tools.',
  context: `Read-only VEKL qualification. Activation id: ${manifest.activation_id}. The exact persisted VEKL v2 engineering-knowledge manifest (skills + selected resources) is the only engineering-knowledge input.`,
  timeoutMs: 180000,
});
if (fallback.event.resolved_model !== 'claude-sonnet-5' || fallback.event.identity_proven !== true || fallback.event.skill_activation_id !== manifest.activation_id) {
  throw new Error(`VEKL Sonnet canary failed: ${JSON.stringify(fallback.event)}`);
}

let restored = null;
if (!fallbackOnly) {
  await probeCodexAppServer({ repoDir, root });
  restored = reconcileHermesRuntime({ root });
  if (restored?.selection?.runtime !== 'codex_app_server') throw new Error('Sol preference did not restore after VEKL canary');
}

const evidence = {
  schema_version: 1,
  kind: fallbackOnly ? 'DIAL_VEKL_LIVE_FALLBACK_CANARY' : 'DIAL_VEKL_LIVE_RUNTIME_SYMMETRY_CANARY',
  status: 'GREEN',
  observed_at: now(),
  repo_head: repoHead,
  packet_id: packetId,
  activation_id: manifest.activation_id,
  manifest_sha256: manifest.manifest_sha256,
  selected_skills: manifest.skills.map((s) => ({ skill_id: s.skill_id, upstream_commit: s.upstream_commit, content_hash: s.content_hash })),
  selected_resources: (manifest.resources || []).map((r) => ({ resource_id: r.resource_id, source_id: r.source_id, resource_class: r.resource_class, content_hash: r.content_hash || null, cache_ref: r.cache_ref || null })),
  activation_verified: true,
  primary: fallbackOnly ? { runtime: 'codex_app_server', requested_model: 'gpt-5.6-sol', resolved_model: codexProbe.resolved_model, state: codexProbe.state, identity_proven: codexProbe.identity_proven, activation_id: null } : { runtime: 'codex_app_server', requested_model: 'gpt-5.6-sol', resolved_model: primary.resolved_model, state: 'HEALTHY', identity_proven: true, activation_id: manifest.activation_id },
  fallback: { runtime: 'claude_code', requested_model: 'claude-sonnet-5', resolved_model: fallback.event.resolved_model, activation_id: fallback.event.skill_activation_id },
  same_activation_across_runtimes: fallbackOnly ? false : fallback.event.skill_activation_id === manifest.activation_id,
  fallback_activation_proven: fallback.event.skill_activation_id === manifest.activation_id,
  exact_hashes_preserved: true,
  federated_resource_provenance_preserved: (manifest.resources || []).length > 0,
  primary_restored: fallbackOnly ? false : true,
  temporary_primary_limitation: fallbackOnly ? codexProbe.state : null,
  authority: 'NON_AUTHORITATIVE_QUALIFICATION_EVIDENCE',
};
const rel = `evidence-cache/qualification/vekl-live-canary-${stamp()}.json`;
writeJsonAtomic(rel, evidence, root);
appendJsonl('events/engineering-knowledge.jsonl', { event: fallbackOnly ? 'VEKL_V2_LIVE_FALLBACK_CANARY_GREEN' : 'VEKL_V2_LIVE_RUNTIME_CANARY_GREEN', activation_id: manifest.activation_id, repo_head: repoHead, at: evidence.observed_at }, root);
console.log(JSON.stringify({ ...evidence, evidence_path: `${root}/${rel}` }, null, 2));
