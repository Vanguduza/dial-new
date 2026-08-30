#!/usr/bin/env node
// Keeps the measured half of BUILD_READINESS_SCORECARD.json true.
//
// The scorecard is the project's answer to "is this ready for development", and
// it carried hand-written counts. After twenty features were added it still
// said 186 — so the one document people consult for readiness was the one most
// likely to be wrong.
//
// Only the measured fields are generated: `counts`, and the CT-1/CT-2 evidence
// blocks. Judgement stays hand-written — status, why_amber, remedy, the
// authorization condition. A machine should not be able to talk itself into
// GREEN.
//
//   --check   report drift and exit 1 without writing (for CI)
import fs from 'node:fs';
import path from 'node:path';
import { readRegistries, computeCt1, computeCt2, computeCounts } from '../lib/registry-metrics.mjs';

const root = process.cwd();
const target = path.join(root, 'docs/dial/final-audit/00_MASTER/BUILD_READINESS_SCORECARD.json');
const checkOnly = process.argv.includes('--check');

const registries = readRegistries(root);
const scorecard = JSON.parse(fs.readFileSync(target, 'utf8'));
const before = JSON.stringify(scorecard);

scorecard.counts = computeCounts(registries);

const ct1 = computeCt1(registries.frcs);
const ct2 = computeCt2(registries.eventualities);

for (const test of scorecard.closure_tests ?? []) {
  if (test.test.startsWith('CT-1')) {
    // distinct_command_names is deliberately dropped: it counted names that
    // embed their own aggregate, so it was distinct by construction. Keeping it
    // would preserve the metric that produced a false GREEN.
    test.evidence = { ...ct1 };
  }
  if (test.test.startsWith('CT-2')) test.evidence = { ...ct2 };
  if (test.test.startsWith('CT-7')) {
    test.evidence = {
      ...ct1,
      material_eventualities: ct2.material,
      distinct_eventuality_test_definitions: ct2.distinct_test_definitions,
    };
  }
}

const after = JSON.stringify(scorecard);

if (checkOnly) {
  if (before === after) {
    console.log(`Scorecard is current — ${scorecard.counts.top_level_features} features, ${scorecard.counts.pack_files} pack files`);
    process.exit(0);
  }
  const old = JSON.parse(before);
  const drift = Object.entries(scorecard.counts)
    .filter(([key, value]) => old.counts?.[key] !== value)
    .map(([key, value]) => `  ${key}: ${old.counts?.[key] ?? '(absent)'} -> ${value}`);
  console.error('BUILD_READINESS_SCORECARD.json is stale.');
  if (drift.length) console.error(drift.join('\n'));
  else console.error('  closure-test evidence has drifted from the registries');
  console.error('Run: node agent-system/bin/scorecard-refresh.mjs');
  process.exit(1);
}

fs.writeFileSync(target, `${JSON.stringify(scorecard, null, 2)}\n`, 'utf8');
console.log(
  before === after
    ? 'Scorecard already current'
    : `Refreshed scorecard — ${scorecard.counts.top_level_features} features, ${scorecard.counts.mandatory_realization_facets} facets, ${scorecard.counts.pack_files} pack files`,
);
