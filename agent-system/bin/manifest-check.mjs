#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const canonical = 'docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md';
const canonIndexPath = 'docs/dial/canon/CANON_INDEX.json';
const scorecardPath = 'docs/dial/status/BUILD_READINESS_SCORECARD.json';
const marker = 'NON-AUTHORITATIVE COMPATIBILITY POINTER';
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let fail = [];

for (const p of [
  canonical,
  canonIndexPath,
  scorecardPath,
  'CLAUDE.md',
  'agent-system/canon/PROJECT_TRUTH.md',
  'agent-system/registries/FEATURE_REGISTRY.json',
  'agent-system/registries/DECISION_LOG.json',
]) {
  if (!exists(p)) fail.push(`missing required authority/state file: ${p}`);
}

const forbidden = [
  'docs/dial/final-audit/13_PROMPTS',
  'docs/dial/final-audit/ARCHIVE',
  'docs/dial/final-audit/21_READY_TO_APPLY_REPOSITORY_BOOTSTRAP',
  'docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/ready_to_copy',
  'docs/dial/final-audit/07_IMPLEMENTATION',
  'docs/dial/final-audit/README_v2_1.md',
  'docs/dial/final-audit/MANIFEST_v2_2.json',
  'ref',
  'DIAL_MAIN_MASTER_RECONSTRUCTION_PROMPT.md',
  'DIAL_Master_Product_Technical_Delivery_Architecture_vNext3.md',
  'DIAL_Implementation_Closure_and_Build_Ready_Canon_v2_0.zip',
];
for (const p of forbidden) if (exists(p)) fail.push(`superseded authority path reappeared: ${p}`);

if (exists('CLAUDE.md') && !read('CLAUDE.md').includes(canonical)) {
  fail.push('CLAUDE.md does not point to the canonical master');
}
if (exists('agent-system/canon/PROJECT_TRUTH.md') && !read('agent-system/canon/PROJECT_TRUTH.md').includes(canonical)) {
  fail.push('PROJECT_TRUTH.md does not identify the canonical master');
}
if (exists('docs/dial/final-audit/README.md') && !read('docs/dial/final-audit/README.md').includes(canonical)) {
  fail.push('final-audit README does not subordinate itself to the canonical master');
}

const pointerFiles = [
  'docs/dial/final-audit/00_MASTER/DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md',
  'docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md',
  'docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md',
  'docs/dial/final-audit/00_MASTER/DIAL_FINAL_360_ECOSYSTEM_AUDIT_AND_DEVELOPMENT_PLAN_v1.md',
  'docs/dial/final-audit/00_MASTER/DIAL_Module_Expansion_and_Operational_Realisation_Architecture_v1.md',
  'docs/dial/final-audit/00_MASTER/V2_1_ANCHOR_INDEX.md',
  'docs/dial/final-audit/00_MASTER/V2_2_ANCHOR_INDEX.md',
  'docs/dial/final-audit/25_GROCERY_ROUNDS/GROCERY_ROUNDS_MASTER_PLAN_v1.md',
  'docs/dial/final-audit/25_GROCERY_ROUNDS/GROCERY_ROUNDS_REVIEW_v1.md',
  'docs/dial/final-audit/25_GROCERY_ROUNDS/ROUND_CREDIT_MODEL_v1.md',
];
for (const p of pointerFiles) {
  if (!exists(p)) continue; // may be deleted once all machine references migrate
  const text = read(p);
  if (!text.includes(marker) || !text.includes(canonical)) {
    fail.push(`legacy compatibility path contains doctrine instead of a pointer: ${p}`);
  }
}

if (exists(canonIndexPath)) {
  const index = JSON.parse(read(canonIndexPath));
  if (index.canonical_source !== canonical) fail.push('CANON_INDEX canonical_source is wrong');
  if (index.project_truth_projection !== 'agent-system/canon/PROJECT_TRUTH.md') fail.push('CANON_INDEX Project Truth pointer is wrong');
  if (index.readiness_state !== scorecardPath) fail.push('CANON_INDEX readiness pointer is wrong');
}

if (exists('agent-system/registries/DECISION_LOG.json')) {
  const decisions = JSON.parse(read('agent-system/registries/DECISION_LOG.json'));
  const ids = new Set();
  for (const d of decisions) {
    if (ids.has(d.decision_id)) fail.push(`duplicate decision id: ${d.decision_id}`);
    ids.add(d.decision_id);
    if (d.status !== 'LOCKED') fail.push(`${d.decision_id}: active Decision Registry may contain LOCKED current decisions only`);
    if (!String(d.record ?? '').includes(canonical)) fail.push(`${d.decision_id}: record does not point to current master`);
  }
  const text = JSON.stringify(decisions).toLowerCase();
  if (/voting weight[^}]{0,120}(credits|contribution)/.test(text)) fail.push('Decision Registry reintroduces contribution-weighted voting');
  if (/4% stands|permanent 4%|fixed 4%/.test(text)) fail.push('Decision Registry reintroduces a fixed 4% protection price');
}

if (fail.length) {
  console.error('DIAL canon coherence: RED');
  for (const f of fail) console.error(`- ${f}`);
  process.exit(1);
}
console.log('DIAL canon coherence: GREEN — one product authority, compatibility pointers contain no doctrine');
