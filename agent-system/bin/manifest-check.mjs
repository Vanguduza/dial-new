#!/usr/bin/env node
// Manifest and canon-reference integrity gate.
//
// Two failures this catches, both of which actually occurred:
//   1. The v2.1 pack shipped as a 12-file overlay while being packaged as a
//      replacement, silently dropping 181 files including 33 registries.
//   2. The closure canon named 21_READY_TO_APPLY_REPOSITORY_BOOTSTRAP/ and
//      REPOSITORY_BOOTSTRAP_CHECKLIST.json as the mechanism for clearing CT-6
//      while neither was present in the shipped pack.
//
// A path that canon references must exist. A manifest that claims a file must
// match it. Neither is checked anywhere else.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pack = 'docs/dial/final-audit';
const failures = [];
const notes = [];

const sha256 = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const abs = (...p) => path.join(root, ...p);
const exists = (p) => fs.existsSync(abs(p));

// ── 1. every manifest in the pack must be complete and hash-accurate ────────
const manifests = fs
  .readdirSync(abs(pack))
  .filter((f) => /^MANIFEST.*\.json$/i.test(f));

if (manifests.length === 0) failures.push(`${pack}: no MANIFEST file found`);

for (const name of manifests) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(abs(pack, name), 'utf8'));
  } catch (error) {
    failures.push(`${name}: not valid JSON — ${error.message}`);
    continue;
  }
  const files = manifest.files ?? [];
  if (files.length === 0) {
    notes.push(`${name}: declares no file list (index-only manifest)`);
    continue;
  }
  let missing = 0;
  let mismatched = 0;
  for (const entry of files) {
    const target = path.join(pack, entry.path);
    if (!exists(target)) {
      failures.push(`${name}: declares missing file ${entry.path}`);
      missing += 1;
      continue;
    }
    if (entry.sha256 && sha256(abs(target)) !== entry.sha256) {
      failures.push(`${name}: hash mismatch for ${entry.path}`);
      mismatched += 1;
    }
  }
  notes.push(
    `${name}: ${files.length} declared, ${missing} missing, ${mismatched} hash-mismatched`,
  );
}

// ── 2. every path the canon names must exist ────────────────────────────────
// Sourced from the closure canon (§9), the alignment audit and the v2.1 anchor
// index. These are the paths an agent is instructed to open; a broken one sends
// the session to a dead end.
const canonReferenced = [
  `${pack}/00_MASTER/DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md`,
  `${pack}/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md`,
  `${pack}/00_MASTER/V2_1_ANCHOR_INDEX.md`,
  `${pack}/00_MASTER/BUILD_READINESS_SCORECARD.json`,
  `${pack}/13_PROMPTS/DIAL_MASTER_DEVELOPMENT_PROMPT_v2_1.md`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/EXECUTABLE_EVENTUALITY_CONTRACT_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/DONOR_QUALIFICATION_STATUS.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/04_NFR/NFR_BUDGET_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/05_DEPLOYMENT/ENVIRONMENT_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/ACTIVATION_BLOCKER_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/07_OPERATING_MODEL/OPERATIONAL_RESPONSIBILITY_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/08_MASTER_DATA/MASTER_DATA_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/10_ACTIVATION_CONFIG/BRANCH_ACTIVATION_REGISTRY.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/11_REPOSITORY_ALIGNMENT/REPOSITORY_BOOTSTRAP_CHECKLIST.json`,
  `${pack}/20_IMPLEMENTATION_CLOSURE/11_REPOSITORY_ALIGNMENT/ACTUAL_GITHUB_REPOSITORY_ALIGNMENT_AUDIT.md`,
  `${pack}/21_READY_TO_APPLY_REPOSITORY_BOOTSTRAP/CLAUDE.md`,
  `${pack}/22_COMMERCE_FRONTEND_AND_TRANSITION/02_TRANSITION_EPC_LOCK/TRANSITION_EPC_INTEGRATION_LOCK.md`,
  `${pack}/22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md`,
  `${pack}/22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md`,
  `${pack}/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json`,
  `${pack}/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json`,
  `${pack}/17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json`,
  `${pack}/17_SECURITY/SECURITY_CONTROL_REGISTRY.json`,
  'CLAUDE.md',
  'agent-system/canon/PROJECT_TRUTH.md',
  'agent-system/registries/FEATURE_REGISTRY.json',
  'agent-system/bin/context-get.mjs',
  'agent-system/bin/v2-closure-check.mjs',
];

for (const target of canonReferenced) {
  if (!exists(target)) failures.push(`canon references a path that does not exist: ${target}`);
}

// ── 3. the harness must not point at scripts it does not ship ───────────────
const claudeMd = exists('CLAUDE.md') ? fs.readFileSync(abs('CLAUDE.md'), 'utf8') : '';
for (const match of claudeMd.matchAll(/node\s+(agent-system\/[\w./-]+\.mjs)/g)) {
  if (!exists(match[1])) failures.push(`CLAUDE.md names a missing script: ${match[1]}`);
}

for (const note of notes) console.log(`  ${note}`);

if (failures.length) {
  console.error('\nDIAL manifest/canon-reference check: RED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'GREEN',
      manifests_checked: manifests.length,
      canon_referenced_paths_verified: canonReferenced.length,
    },
    null,
    2,
  ),
);
