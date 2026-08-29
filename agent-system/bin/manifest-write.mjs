#!/usr/bin/env node
// Regenerates the pack manifest over the WHOLE pack.
//
// This exists because v2.1 was authored as a twelve-file overlay and shipped as
// a replacement pack, dropping 181 files. A manifest that only ever lists what
// changed cannot detect that. This always walks the tree, so a release can only
// ever declare everything it actually contains.
//
// Run after any change to pack content, then `npm run agent:manifest-check`.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pack = 'docs/dial/final-audit';
const VERSION = '2.2';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.name === 'ARCHIVE') continue;
    if (entry.isDirectory()) walk(rel, out);
    else if (!/^MANIFEST.*\.json$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = walk(pack)
  .map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return {
      path: path.relative(pack, file).replaceAll('\\', '/'),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  name: 'DIAL Consolidated Development Pack',
  version: VERSION,
  supersedes: ['2.1', '2.0', '1.6'],
  generated_at: new Date().toISOString(),
  kind: 'COMPLETE_PACK',
  packaging_rule:
    'This manifest declares every file in the pack except ARCHIVE/ and the manifests ' +
    'themselves. A release that changes only some files must still regenerate over the ' +
    'whole pack. agent:manifest-check fails on a missing, altered or undeclared file, ' +
    'which is how the v2.1 overlay-as-replacement defect is prevented from recurring.',
  active_readme: 'README.md',
  active_anchor_index: '00_MASTER/V2_2_ANCHOR_INDEX.md',
  active_master_plan: '00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md',
  active_master_prompt: '13_PROMPTS/DIAL_MASTER_DEVELOPMENT_PROMPT_v2_1.md',
  base_closure_canon: '00_MASTER/DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md',
  closure_test_report: '20_IMPLEMENTATION_CLOSURE/14_VALIDATION/CLOSURE_TEST_REPORT.md',
  primary_commerce_frontend_donor: 'https://github.com/jatolentino/Shop-Ecommerce',
  primary_frontend_divisions: ['SPARE', 'GROCERIES'],
  frozen_transition_contracts: [
    '22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md',
    '22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md',
  ],
  file_count: files.length,
  files,
};

const target = path.join(root, pack, `MANIFEST_v${VERSION.replace('.', '_')}.json`);
fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, target)} — ${files.length} files declared`);
