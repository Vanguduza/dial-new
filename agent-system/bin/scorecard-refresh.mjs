#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readRegistries, computeCt1, computeCt2, computeCounts } from '../lib/registry-metrics.mjs';

const root = process.cwd();
const target = path.join(root, 'docs/dial/status/BUILD_READINESS_SCORECARD.json');
const checkOnly = process.argv.includes('--check');
const registries = readRegistries(root);
const scorecard = JSON.parse(fs.readFileSync(target, 'utf8'));
const before = JSON.stringify(scorecard);
scorecard.counts = computeCounts(registries);
const ct1 = computeCt1(registries.frcs);
const ct2 = computeCt2(registries.eventualities);
for (const test of scorecard.closure_tests ?? []) {
  if (test.test.startsWith('CT-1')) test.evidence = { ...ct1 };
  if (test.test.startsWith('CT-2')) test.evidence = { ...ct2 };
  if (test.test.startsWith('CT-7')) test.evidence = { ...ct1, material_eventualities: ct2.material, distinct_eventuality_test_definitions: ct2.distinct_test_definitions };
}
const after = JSON.stringify(scorecard);
if (checkOnly) {
  if (before === after) {
    console.log(`Scorecard is current — ${scorecard.counts.top_level_features} registered features`);
    process.exit(0);
  }
  console.error('docs/dial/status/BUILD_READINESS_SCORECARD.json is stale; run npm run agent:scorecard');
  process.exit(1);
}
fs.writeFileSync(target, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');
console.log(before === after ? 'Scorecard already current' : `Refreshed scorecard — ${scorecard.counts.top_level_features} registered features`);
