#!/usr/bin/env node
// CT-7 — Contract Specificity.
//
// CT-1 was reported GREEN on "183 distinct command sets" across 186 features.
// That count is distinct by construction: every command name embeds its own
// aggregate name, so CompleteVehicleProfile and CompleteSupplierOffer differ as
// strings while being the same contract. Substituting the aggregate out reveals
// how much of the registry is genuinely feature-specific.
//
// This does not gate on absolute specificity — 186 features cannot be given
// bespoke contracts in one sitting. It gates on regression against a committed
// baseline, so the registry can only get more specific over time, and it prints
// the distance to target so progress is visible.
import fs from 'node:fs';
import path from 'node:path';
import { readRegistries, computeCt1, computeCt2 } from '../lib/registry-metrics.mjs';

const root = process.cwd();
const pack = 'docs/dial/final-audit';
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// The metrics live in agent-system/lib/registry-metrics.mjs so this check and
// the build readiness scorecard report the same numbers. They were computed
// separately once, and the scorecard drifted.
const registries = readRegistries(root);
const frcs = registries.frcs;
const eventualities = registries.eventualities;
const ct1 = computeCt1(frcs);
const ct2 = computeCt2(eventualities);

const metrics = { ct1, ct2 };

// ── regression gate ────────────────────────────────────────────────────────
const baselinePath = 'agent-system/registries/CONTRACT_SPECIFICITY_BASELINE.json';
const absoluteBaseline = path.join(root, baselinePath);

if (process.argv.includes('--write-baseline') || !fs.existsSync(absoluteBaseline)) {
  fs.mkdirSync(path.dirname(absoluteBaseline), { recursive: true });
  fs.writeFileSync(
    absoluteBaseline,
    `${JSON.stringify(
      {
        note:
          'Floor, not a target. Every value below must rise (or hold) as contracts are ' +
          'made specific. Regenerate with: node agent-system/bin/contract-specificity.mjs --write-baseline',
        recorded_at: new Date().toISOString(),
        metrics,
        targets: {
          'ct1.distinct_acceptance_contracts': frcs.length,
          'ct1.distinct_permission_skeletons': 'one per aggregate archetype at minimum',
          'ct1.feature_specific_command_ratio': 0.75,
          'ct2.distinct_test_definitions': ct2.material,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`Baseline written to ${baselinePath}`);
  console.log(JSON.stringify(metrics, null, 2));
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(absoluteBaseline, 'utf8')).metrics;
const regressions = [];

for (const [group, values] of Object.entries(metrics)) {
  for (const [key, value] of Object.entries(values)) {
    const before = baseline[group]?.[key];
    if (typeof before !== 'number' || typeof value !== 'number') continue;
    // Every tracked metric is "higher is more specific".
    if (value < before) regressions.push(`${group}.${key}: ${before} → ${value}`);
  }
}

console.log(JSON.stringify(metrics, null, 2));

if (regressions.length) {
  console.error('\nCT-7 contract specificity: RED — contracts became less specific');
  for (const regression of regressions) console.error(`  - ${regression}`);
  process.exit(1);
}

const atTarget =
  ct1.distinct_acceptance_contracts === frcs.length &&
  ct2.distinct_test_definitions >= ct2.material;

console.log(
  `\nCT-7 contract specificity: ${atTarget ? 'GREEN' : 'AMBER — no regression, below target'}`,
);
if (!atTarget) {
  console.log(
    `  acceptance contracts  ${ct1.distinct_acceptance_contracts} / ${frcs.length}\n` +
    `  eventuality test sets ${ct2.distinct_test_definitions} / ${ct2.material}`,
  );
}
