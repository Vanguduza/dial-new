#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'docs/dial/canon/CANON_INDEX.json');
const checkOnly = process.argv.includes('--check');
const index = {
  schema_version: 1,
  canonical_source: 'docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md',
  project_truth_projection: 'agent-system/canon/PROJECT_TRUTH.md',
  engineering_entry: 'CLAUDE.md',
  readiness_state: 'docs/dial/status/BUILD_READINESS_SCORECARD.json',
  feature_registry: 'agent-system/registries/FEATURE_REGISTRY.json',
  decision_registry: 'agent-system/registries/DECISION_LOG.json',
  feature_contract_root: 'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS',
  eventuality_root: 'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS',
  security_root: 'docs/dial/final-audit/17_SECURITY',
  rule: 'Subordinate artifacts may add implementation detail but may never override the canonical source.',
  compatibility_pointer_marker: 'NON-AUTHORITATIVE COMPATIBILITY POINTER',
};
const rendered = `${JSON.stringify(index, null, 2)}\n`;
if (checkOnly) {
  if (!fs.existsSync(target)) {
    console.error('CANON_INDEX.json is missing');
    process.exit(1);
  }
  if (fs.readFileSync(target, 'utf8') !== rendered) {
    console.error('CANON_INDEX.json is stale; run node agent-system/bin/manifest-write.mjs');
    process.exit(1);
  }
  console.log('CANON_INDEX.json is current');
  process.exit(0);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, rendered, 'utf8');
console.log('Wrote docs/dial/canon/CANON_INDEX.json');
