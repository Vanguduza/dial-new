#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getEngineeringSkill, loadEngineeringSkillRegistry } from '../orchestration/skill-registry.mjs';
import { hashSkillDirectory } from '../orchestration/skill-activation-store.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from '../orchestration/state-store.mjs';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function now() { return new Date().toISOString(); }
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function clean(v, max = 4000) { return String(v ?? '').trim().slice(0, max); }
function safe(v) { return String(v).replace(/[^A-Za-z0-9._-]+/g, '_'); }
function shaFile(target) { return crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'); }
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true, mode: 0o755 });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name), b = path.join(dst, entry.name);
    if (entry.isDirectory()) copyTree(a, b);
    else if (entry.isFile()) fs.copyFileSync(a, b);
    else throw new Error(`unsupported skill entry: ${a}`);
  }
}
function chmodReadOnly(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { chmodReadOnly(p); fs.chmodSync(p, 0o555); }
    else if (entry.isFile()) fs.chmodSync(p, 0o444);
  }
  fs.chmodSync(dir, 0o555);
}
function review(pathArg, expectedKind, skillId, commit) {
  if (!pathArg) throw new Error(`${expectedKind} evidence is required`);
  const p = path.resolve(pathArg);
  const row = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (row.kind !== expectedKind || row.skill_id !== skillId || row.exact_commit !== commit || row.decision !== 'APPROVED') {
    throw new Error(`${expectedKind} evidence is not an APPROVED review for ${skillId}@${commit}`);
  }
  return { path: p, sha256: shaFile(p), reviewer: row.reviewer ?? null, reviewed_at: row.reviewed_at ?? null };
}

const skillId = process.argv[2];
const sourceDir = path.resolve(arg('--source-dir') || '');
const commit = clean(arg('--commit'), 80);
const managerPath = arg('--manager-review');
const specialistPath = arg('--specialist-review');
const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
if (!skillId || !sourceDir || !commit || !managerPath) throw new Error('usage: skills-promote.mjs <skill-id> --source-dir <checkout> --commit <sha> --manager-review <json> [--specialist-review <json>]');
const record = getEngineeringSkill(skillId, repoDir);
if (!record) throw new Error(`unknown skill: ${skillId}`);
if (!record.source_path) throw new Error(`${skillId} has no source_path`);
if (!fs.existsSync(path.join(sourceDir, '.git'))) throw new Error('source-dir must be a Git checkout');
if (git(sourceDir, 'rev-parse', 'HEAD') !== commit) throw new Error('source checkout HEAD does not match commit');
if (git(sourceDir, 'status', '--porcelain=v1')) throw new Error('source checkout must be clean');
const selected = path.join(sourceDir, record.source_path);
if (!fs.existsSync(path.join(selected, 'SKILL.md'))) throw new Error('selected skill SKILL.md missing');
const hash = hashSkillDirectory(selected);
const qRel = `knowledge/evidence/qualification/${safe(skillId)}-${commit.slice(0, 12)}.json`;
const eRel = `knowledge/evidence/qualification/${safe(skillId)}-${commit.slice(0, 12)}-eval.json`;
const qual = readJson(qRel, null, root);
const evalRow = readJson(eRel, null, root);
if (!qual || qual.status !== 'STATIC_SCAN_PASSED' || qual.content_hash !== hash.value) throw new Error('current STATIC_SCAN_PASSED evidence with matching hash is required');
if (!evalRow || evalRow.status !== 'EVAL_PASSED' || evalRow.content_hash !== hash.value) throw new Error('current EVAL_PASSED evidence with matching hash is required');
const manager = review(managerPath, 'DEVELOPMENT_MANAGER_SKILL_APPROVAL', skillId, commit);
const securityAdjacent = (record.task_classes || []).some((x) => /SECURITY|HEALTH|MONEY|IDENTITY|COMPLIANCE/i.test(x)) || /security|health|payment|ledger|identity|compliance/i.test(`${record.skill_id} ${record.display_name}`);
const specialist = securityAdjacent ? review(specialistPath, 'SPECIALIST_SKILL_REVIEW', skillId, commit) : null;

ensureControlLayout(root);
const runtimeName = record.runtime_name || safe(skillId);
const providerDir = safe(record.provider || 'unknown');
const snapshotRel = `knowledge/vendor/${providerDir}/${commit}/${runtimeName}`;
const snapshotAbs = resolveControlPath(snapshotRel, root);
if (fs.existsSync(snapshotAbs)) {
  const observed = hashSkillDirectory(snapshotAbs);
  if (observed.value !== hash.value) throw new Error(`existing immutable snapshot hash mismatch for ${skillId}`);
} else {
  fs.mkdirSync(path.dirname(snapshotAbs), { recursive: true, mode: 0o755 });
  copyTree(selected, snapshotAbs);
  const observed = hashSkillDirectory(snapshotAbs);
  if (observed.value !== hash.value) throw new Error('snapshot copy hash mismatch');
  chmodReadOnly(snapshotAbs);
}
const observedMode = fs.statSync(snapshotAbs).mode & 0o777;
if ((observedMode & 0o222) !== 0) throw new Error('snapshot directory remains writable after publication');

const registryPath = path.join(repoDir, 'agent-system/engineering-knowledge/registries/ENGINEERING_SKILL_REGISTRY.json');
const rows = loadEngineeringSkillRegistry(repoDir);
const updatedAt = now();
const updated = rows.map((row) => row.skill_id === skillId ? {
  ...row,
  production_pin: commit,
  content_hash: hash.value,
  approval_state: 'APPROVED',
  snapshot_rel: snapshotRel,
  runtime_name: runtimeName,
  eval_score: 1,
  last_verified_at: updatedAt,
  qualification_evidence: qRel,
  eval_evidence: eRel,
  manager_review_sha256: manager.sha256,
  specialist_review_sha256: specialist?.sha256 ?? null,
} : row);
fs.writeFileSync(registryPath, `${JSON.stringify(updated, null, 2)}\n`);

const sourceLockName = record.provider === 'google-android' ? 'GOOGLE_ANDROID_SKILLS_SOURCE.lock.json' : (record.provider === 'google' ? 'GOOGLE_SKILLS_SOURCE.lock.json' : null);
if (sourceLockName) {
  const lockPath = path.join(repoDir, 'agent-system/engineering-knowledge/vendors/google', sourceLockName);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.production_pin && lock.production_pin !== commit) throw new Error(`${lock.repo} already pinned to different production commit ${lock.production_pin}`);
  const next = { ...lock, production_pin: commit, activation_allowed: true, state: 'PRODUCTION_PINNED_SELECTED_PATHS', qualification_required: true, last_qualified_at: updatedAt };
  fs.writeFileSync(lockPath, `${JSON.stringify(next, null, 2)}\n`);
}
const statusPath = path.join(repoDir, 'agent-system/engineering-knowledge/vendors/google/qualification-status.json');
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
const approvedCount = updated.filter((r) => ['APPROVED', 'ACTIVE'].includes(r.approval_state)).length;
const activeCount = updated.filter((r) => r.approval_state === 'ACTIVE').length;
fs.writeFileSync(statusPath, `${JSON.stringify({ ...status, state: approvedCount ? 'SELECTED_SKILLS_APPROVED' : status.state, approved_skill_count: approvedCount, active_skill_count: activeCount, research_reference_only: false, last_updated_at: updatedAt }, null, 2)}\n`);

const evidence = {
  schema_version: 1,
  event: 'VEKL_SKILL_PROMOTED',
  skill_id: skillId,
  provider: record.provider,
  exact_commit: commit,
  source_path: record.source_path,
  content_hash: hash.value,
  snapshot_rel: snapshotRel,
  snapshot_read_only: true,
  manager_review: manager,
  specialist_review: specialist,
  approval_state: 'APPROVED',
  promoted_at: updatedAt,
};
writeJsonAtomic(`knowledge/evidence/qualification/${safe(skillId)}-${commit.slice(0, 12)}-promotion.json`, evidence, root);
appendJsonl('events/engineering-knowledge.jsonl', { event: 'SKILL_APPROVED', skill_id: skillId, commit, content_hash: hash.value, snapshot_rel: snapshotRel, at: updatedAt }, root);
console.log(JSON.stringify(evidence, null, 2));
