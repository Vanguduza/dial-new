#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getEngineeringSkill, loadEngineeringSkillRegistry } from '../orchestration/skill-registry.mjs';
import { resolveEngineeringSkills } from '../orchestration/skill-resolver.mjs';
import { hashSkillDirectory } from '../orchestration/skill-activation-store.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, writeJsonAtomic } from '../orchestration/state-store.mjs';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function now() { return new Date().toISOString(); }
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function clean(v, max = 4000) { return String(v ?? '').trim().slice(0, max); }
function safe(v) { return String(v).replace(/[^A-Za-z0-9._-]+/g, '_'); }

const TASK_FIXTURES = Object.freeze({
  ANDROID_UI_IMPLEMENTATION: 'Implement a Jetpack Compose Android screen with edge-to-edge layout',
  ANDROID_RESPONSIVE_LAYOUT: 'Implement adaptive responsive Jetpack Compose layout for phone tablet and foldable',
  ANDROID_NAVIGATION: 'Implement Android Navigation 3 typed navigation and deep links',
  ANDROID_SECURITY: 'Harden Android exported intents and deep links against intent abuse',
  ANDROID_PERFORMANCE: 'Diagnose Android startup jank with Perfetto trace analysis',
  ANDROID_RELEASE_OPTIMIZATION: 'Diagnose Android R8 shrinking and release optimization',
  ANDROID_CAMERA: 'Implement Android CameraX capture lifecycle for proof of delivery',
  ANDROID_TESTING: 'Set up Android instrumentation and device tests',
  ANDROID_DEVICE_VERIFICATION: 'Android device build run verify screenshot layout inspect',
  GA_ANALYTICS_ADAPTER: 'Build a read-only Google Analytics Data API reporting adapter',
  GA_ANALYTICS_ADMIN: 'Configure a Google Analytics property using the Admin API',
  CLOUD_SECURITY_REVIEW: 'Review Oracle cloud architecture security using transferable WAF principles',
  CLOUD_RELIABILITY_REVIEW: 'Review Oracle cloud reliability and failover using transferable WAF principles',
  CLOUD_PERFORMANCE_REVIEW: 'Review Oracle cloud performance using transferable WAF principles',
  CLOUD_OPERATIONAL_REVIEW: 'Review Oracle operational excellence using transferable WAF principles',
  SKILL_LIFECYCLE_RESEARCH: 'Review agent skill registry lifecycle design without changing DIAL providers',
});

const skillId = process.argv[2];
const sourceDir = path.resolve(arg('--source-dir') || '');
const commit = clean(arg('--commit'), 80);
const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
if (!skillId || !sourceDir || !commit) throw new Error('usage: skills-eval.mjs <skill-id> --source-dir <checkout> --commit <sha>');
const record = getEngineeringSkill(skillId, repoDir);
if (!record) throw new Error(`unknown skill: ${skillId}`);
if (!record.source_path) throw new Error(`${skillId} has no source_path`);
if (!fs.existsSync(path.join(sourceDir, '.git'))) throw new Error(`source-dir is not a Git checkout: ${sourceDir}`);
if (git(sourceDir, 'rev-parse', 'HEAD') !== commit) throw new Error('source checkout HEAD does not match requested commit');
if (git(sourceDir, 'status', '--porcelain=v1')) throw new Error('source checkout must be clean');
const selectedDir = path.join(sourceDir, record.source_path);
const bodyPath = path.join(selectedDir, 'SKILL.md');
if (!fs.existsSync(bodyPath)) throw new Error(`SKILL.md missing: ${record.source_path}`);
const body = fs.readFileSync(bodyPath, 'utf8');
const hash = hashSkillDirectory(selectedDir);

const failures = [];
const warnings = [];
if (/\b(?:change|replace|migrate)\b.{0,80}\bDIAL\b.{0,80}\b(?:source of truth|architecture authority)\b/i.test(body)) failures.push('skill content attempts to redefine DIAL authority');
if (/\b(?:customer|patient|payment|ledger)\b.{0,80}\b(?:secret|token|password|private key)\b/i.test(body)) warnings.push('content mentions sensitive concepts near credentials; manual review required');
if (/curl\s+[^\n|]+\|\s*(?:ba)?sh\b/i.test(body)) failures.push('skill contains curl-pipe-shell installation instruction');
if (/\brm\s+-rf\s+(?:\/|~|\$HOME)\b/i.test(body)) failures.push('skill contains destructive rm -rf instruction');

const baseRegistry = loadEngineeringSkillRegistry(repoDir);
const candidate = { ...record, approval_state: 'APPROVED', production_pin: commit, content_hash: hash.value, snapshot_rel: `knowledge/vendor/eval/${safe(skillId)}`, runtime_name: safe(skillId) };
const registry = baseRegistry.map((r) => r.skill_id === skillId ? candidate : r);
const selectionResults = [];
for (const taskClass of record.task_classes || []) {
  const instruction = TASK_FIXTURES[taskClass];
  if (!instruction) { warnings.push(`no deterministic fixture for task class ${taskClass}`); continue; }
  const plan = resolveEngineeringSkills({ repoDir, instruction, affectedPaths: ['apps/consumer-android/src/main/kotlin/Eval.kt'], registry, metadata: { max_skills: 5 } });
  const selected = plan.selected_skills.some((s) => s.skill_id === skillId);
  selectionResults.push({ task_class: taskClass, selected, resolution_state: plan.resolution_state, selected_ids: plan.selected_skills.map((s) => s.skill_id) });
  if (!selected) failures.push(`candidate was not selected for declared task class ${taskClass}`);
}

const unrelated = resolveEngineeringSkills({ repoDir, instruction: 'Update a generic DIAL backend TypeScript validation helper', affectedPaths: ['packages/example/src/index.ts'], registry, metadata: { max_skills: 5 } });
if (unrelated.selected_skills.some((s) => s.skill_id === skillId)) failures.push('candidate activates for unrelated backend task');
const maps = resolveEngineeringSkills({ repoDir, instruction: 'Replace DIAL Delivery routing map with Google Maps', affectedPaths: ['apps/delivery/src/map.ts'], registry, metadata: { max_skills: 5 } });
if (/maps/i.test(skillId) && maps.selected_skills.some((s) => s.skill_id === skillId)) failures.push('Google Maps replacement skill bypassed DIAL maps lock');

const result = {
  schema_version: 1,
  event: 'VEKL_DETERMINISTIC_SKILL_EVAL',
  skill_id: skillId,
  provider: record.provider,
  exact_commit: commit,
  source_path: record.source_path,
  content_hash: hash.value,
  eval_suite: record.eval_suite,
  status: failures.length ? 'EVAL_FAILED' : 'EVAL_PASSED',
  selection_results: selectionResults,
  unrelated_activation_blocked: !unrelated.selected_skills.some((s) => s.skill_id === skillId),
  failures,
  warnings,
  observed_at: now(),
};
ensureControlLayout(root);
writeJsonAtomic(`knowledge/evidence/qualification/${safe(skillId)}-${commit.slice(0, 12)}-eval.json`, result, root);
appendJsonl('events/engineering-knowledge.jsonl', { event: result.status, skill_id: skillId, commit, content_hash: hash.value, failure_count: failures.length, at: result.observed_at }, root);
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 2;
