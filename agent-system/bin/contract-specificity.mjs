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

const root = process.cwd();
const pack = 'docs/dial/final-audit';
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const frcs = load(`${pack}/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json`);
const eventualities = load(`${pack}/20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/EXECUTABLE_EVENTUALITY_CONTRACT_REGISTRY.json`);

const countDistinct = (items) => new Set(items.map((v) => JSON.stringify(v))).size;

// ── CT-1 metrics ───────────────────────────────────────────────────────────
// Strip the aggregate name so two commands that differ only by which aggregate
// they act on collapse to the same skeleton.
const skeleton = (frc) =>
  [...(frc.commands ?? [])].sort().map((command) => command.split(frc.aggregate).join('<A>'));

const LIFECYCLE = new Set([
  'Create<A>', 'Start<A>', 'Block<A>', 'Resume<A>', 'Complete<A>', 'Cancel<A>',
]);

let commandTotal = 0;
let commandLifecycle = 0;
for (const frc of frcs) {
  for (const command of skeleton(frc)) {
    commandTotal += 1;
    if (LIFECYCLE.has(command)) commandLifecycle += 1;
  }
}

const ct1 = {
  features: frcs.length,
  distinct_command_skeletons: countDistinct(frcs.map(skeleton)),
  lifecycle_boilerplate_commands: commandLifecycle,
  total_commands: commandTotal,
  feature_specific_command_ratio: Number(
    ((commandTotal - commandLifecycle) / commandTotal).toFixed(3),
  ),
  distinct_state_models: countDistinct(frcs.map((f) => f.states)),
  distinct_acceptance_contracts: countDistinct(frcs.map((f) => f.acceptance_contract)),
  distinct_permission_skeletons: countDistinct(
    frcs.map((f) => [...(f.permissions ?? [])].map((p) => p.split('.').pop()).sort()),
  ),
  distinct_eventuality_ref_sets: countDistinct(frcs.map((f) => f.eventuality_refs)),
};

// ── CT-2 metrics ───────────────────────────────────────────────────────────
const material = eventualities.filter((e) => e.materiality === 'MATERIAL');
const ct2 = {
  eventualities: eventualities.length,
  material: material.length,
  distinct_test_definitions: countDistinct(eventualities.map((e) => e.tests)),
  distinct_procedures: countDistinct(eventualities.map((e) => e.procedure_steps)),
  distinct_compensation_rules: countDistinct(eventualities.map((e) => e.compensation_rule)),
  distinct_evidence_sets: countDistinct(eventualities.map((e) => e.evidence_to_freeze)),
};

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
          'ct2.distinct_test_definitions': material.length,
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
  ct2.distinct_test_definitions >= material.length;

console.log(
  `\nCT-7 contract specificity: ${atTarget ? 'GREEN' : 'AMBER — no regression, below target'}`,
);
if (!atTarget) {
  console.log(
    `  acceptance contracts  ${ct1.distinct_acceptance_contracts} / ${frcs.length}\n` +
    `  eventuality test sets ${ct2.distinct_test_definitions} / ${material.length}`,
  );
}
