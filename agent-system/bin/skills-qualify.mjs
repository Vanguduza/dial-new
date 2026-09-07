#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getEngineeringSkill } from '../orchestration/skill-registry.mjs';
import { hashSkillDirectory } from '../orchestration/skill-activation-store.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, resolveControlPath, writeJsonAtomic } from '../orchestration/state-store.mjs';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }
function now() { return new Date().toISOString(); }
function clean(value, max = 2000) { return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max); }
function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
function shaFile(target) { return crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'); }
function walk(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p); } return out; }

const skillId = process.argv[2];
const sourceDir = path.resolve(arg('--source-dir') || '');
const commit = clean(arg('--commit'), 80);
const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
if (!skillId || !sourceDir || !commit) throw new Error('usage: skills-qualify.mjs <skill-id> --source-dir <checkout> --commit <sha>');
const skill = getEngineeringSkill(skillId, repoDir);
if (!skill) throw new Error(`unknown skill: ${skillId}`);
if (!skill.source_path) throw new Error(`${skillId} has no resolved source_path; resolve the exact upstream path before qualification`);
if (!fs.existsSync(path.join(sourceDir, '.git'))) throw new Error(`source-dir is not a Git checkout: ${sourceDir}`);
const head = git(sourceDir, 'rev-parse', 'HEAD');
if (head !== commit) throw new Error(`source checkout HEAD ${head} does not equal requested commit ${commit}`);
if (git(sourceDir, 'status', '--porcelain=v1')) throw new Error('source checkout must be clean for qualification');
const selected = path.resolve(sourceDir, skill.source_path);
const rel = path.relative(sourceDir, selected);
if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(selected) || !fs.statSync(selected).isDirectory()) throw new Error(`selected skill path is unavailable: ${skill.source_path}`);
if (!fs.existsSync(path.join(selected, 'SKILL.md'))) throw new Error(`SKILL.md missing under ${skill.source_path}`);

const findings = [];
const scripts = [];
const urls = new Set();
const bidi = /[\u202A-\u202E\u2066-\u2069]/u;
const severe = [
  ['VEKL-SCAN-001', /curl\s+[^\n|]+\|\s*(?:ba)?sh\b/i, 'curl-pipe-shell'],
  ['VEKL-SCAN-002', /\brm\s+-rf\s+(?:\/|~|\$HOME)\b/i, 'destructive rm -rf'],
  ['VEKL-SCAN-003', /\b(?:scp|rsync)\b[^\n]*(?:secret|credential|token|key)/i, 'possible credential exfiltration'],
];
const review = [
  ['VEKL-SCAN-101', /\bsudo\b/i, 'privileged command'],
  ['VEKL-SCAN-102', /\b(?:apt|apt-get|dnf|yum|brew)\s+(?:install|add)\b/i, 'system package installation'],
  ['VEKL-SCAN-103', /\b(?:npm|pnpm|yarn)\s+(?:install|add)\s+-g\b/i, 'global package installation'],
  ['VEKL-SCAN-104', /\bpip(?:3)?\s+install\b/i, 'Python package installation'],
  ['VEKL-SCAN-105', /\bsystemctl\b/i, 'service mutation/control'],
  ['VEKL-SCAN-106', /\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|PASSWORD)\s*=/i, 'credential assignment example'],
];
for (const file of walk(selected)) {
  const relFile = path.relative(selected, file).replaceAll('\\', '/');
  const st = fs.statSync(file);
  if ((st.mode & 0o111) || /\.(?:sh|py|js|mjs|cjs|ts|ps1|bat|cmd)$/i.test(file)) scripts.push(relFile);
  let text; try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (bidi.test(text)) findings.push({ rule_id: 'VEKL-SCAN-000', severity: 'BLOCK', file: relFile, finding: 'hidden bidirectional Unicode control character detected' });
  for (const [rule, pattern, finding] of severe) if (pattern.test(text)) findings.push({ rule_id: rule, severity: 'BLOCK', file: relFile, finding });
  for (const [rule, pattern, finding] of review) if (pattern.test(text)) findings.push({ rule_id: rule, severity: 'REVIEW', file: relFile, finding });
  for (const match of text.matchAll(/https?:\/\/[^\s)>'"`]+/g)) urls.add(match[0].slice(0, 500));
}

const rootLicenseCandidates = fs.readdirSync(sourceDir).filter((name) => /^LICEN[CS]E|^COPYING/i.test(name)).sort();
const localLicenseCandidates = fs.readdirSync(selected).filter((name) => /^LICEN[CS]E|^COPYING/i.test(name)).sort();
const licenseFile = rootLicenseCandidates[0] ? path.join(sourceDir, rootLicenseCandidates[0]) : (localLicenseCandidates[0] ? path.join(selected, localLicenseCandidates[0]) : null);
if (!licenseFile) findings.push({ rule_id: 'VEKL-LIC-001', severity: 'BLOCK', file: null, finding: 'upstream licence file not found at repository root' });
const hash = hashSkillDirectory(selected);
const status = findings.some((f) => f.severity === 'BLOCK') ? 'STATIC_SCAN_FAILED' : (findings.some((f) => f.severity === 'REVIEW') ? 'STATIC_SCAN_REVIEW_REQUIRED' : 'STATIC_SCAN_PASSED');
const evidence = {
  schema_version: 1,
  event: 'VEKL_VENDOR_SKILL_QUALIFICATION_SCAN',
  skill_id: skillId,
  provider: skill.provider,
  upstream_repo: skill.upstream_repo,
  source_dir: sourceDir,
  source_path: skill.source_path,
  exact_commit: commit,
  git_tree: git(sourceDir, 'rev-parse', `HEAD:${skill.source_path}`),
  content_hash: hash.value,
  content_hash_algorithm: hash.algorithm,
  file_count: hash.files,
  declared_license: skill.license,
  license_file: licenseFile ? path.basename(licenseFile) : null,
  license_sha256: licenseFile ? shaFile(licenseFile) : null,
  scripts_and_executables: scripts,
  referenced_urls: [...urls].sort(),
  findings,
  status,
  activation_allowed: false,
  next_required: status === 'STATIC_SCAN_PASSED' ? ['DIAL_CONFLICT_REVIEW', 'DETERMINISTIC_DOMAIN_EVAL', 'DEVELOPMENT_MANAGER_APPROVAL', 'IMMUTABLE_SNAPSHOT_PUBLISH'] : (status === 'STATIC_SCAN_REVIEW_REQUIRED' ? ['INDEPENDENT_REVIEW_OF_FINDINGS', 'DIAL_CONFLICT_REVIEW', 'DETERMINISTIC_DOMAIN_EVAL'] : ['REJECT_OR_REMEDIATE_UPSTREAM_WRAPPER']),
  observed_at: now(),
};
ensureControlLayout(root);
const safe = skillId.replace(/[^A-Za-z0-9._-]+/g, '_');
writeJsonAtomic(`knowledge/evidence/qualification/${safe}-${commit.slice(0, 12)}.json`, evidence, root);
appendJsonl('events/engineering-knowledge.jsonl', { event: status === 'STATIC_SCAN_FAILED' ? 'SKILL_QUARANTINED' : 'SKILL_QUALIFICATION_SCANNED', skill_id: skillId, commit, status, content_hash: hash.value, finding_count: findings.length, at: evidence.observed_at }, root);
console.log(JSON.stringify(evidence, null, 2));
if (status === 'STATIC_SCAN_FAILED') process.exitCode = 2;
