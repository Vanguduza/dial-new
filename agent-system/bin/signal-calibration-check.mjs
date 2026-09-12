#!/usr/bin/env node
// Task-class signal calibration gate.
//
// A signal that fires on almost every Feature carries no information but looks like
// evidence. Measured examples, all rejected: contract.security_profile present (309/309),
// contract.events non-empty (309/309), app_families contains DIAL_WEB (236/309). And one
// that shipped before this gate existed: contract surfaces were joined into the prose
// classifier text, so WHATSAPP fired on 145 of 309 Features - 46.9% - purely from exposure
// declarations. Every one of those Features then had the WhatsApp corpus wired into its
// compiled graph neighbourhood.
//
// The ceiling is declared in TASK_CLASS_SIGNAL_POLICY.calibration.max_feature_fraction.
// GENERAL_DEVELOPMENT is exempt: it is the no-signal sentinel, so a high rate means the
// records carry little, which is a fact about the registry rather than a bad rule.
import fs from 'node:fs';
import path from 'node:path';
import { classifyEngineeringResourcesTask } from '../orchestration/engineering-resource-resolver.mjs';

const root = process.cwd();
const POLICY_REL = 'agent-system/registries/TASK_CLASS_SIGNAL_POLICY.json';
const FEATURE_REL = 'agent-system/registries/FEATURE_REGISTRY.json';
const CONTRACT_REL = 'docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json';

const policy = JSON.parse(fs.readFileSync(path.join(root, POLICY_REL), 'utf8'));
const features = JSON.parse(fs.readFileSync(path.join(root, FEATURE_REL), 'utf8'));
const contractsRaw = JSON.parse(fs.readFileSync(path.join(root, CONTRACT_REL), 'utf8'));
const contracts = Array.isArray(contractsRaw) ? contractsRaw : contractsRaw.contracts || [];
const byFeature = new Map(contracts.map((c) => [c.feature_id, c]));

const ceiling = Number(policy.calibration?.max_feature_fraction ?? 0.4);
const exempt = new Set(policy.calibration?.exempt_classes ?? ['GENERAL_DEVELOPMENT']);

const freq = new Map();
for (const f of features) {
  const c = byFeature.get(f.feature_id) || null;
  const classes = classifyEngineeringResourcesTask({
    instruction: [f?.outcome, c?.archetype].filter(Boolean).join(' '),
    affectedPaths: f?.code_paths || [],
    featureRecord: f,
    contractRecord: c,
    repoDir: root,
  });
  for (const x of classes) freq.set(x, (freq.get(x) ?? 0) + 1);
}

const n = features.length || 1;
const rows = [...freq.entries()]
  .map(([task_class, count]) => ({ task_class, count, fraction: Number((count / n).toFixed(4)) }))
  .sort((a, b) => b.count - a.count);

const failures = [];
for (const row of rows) {
  if (exempt.has(row.task_class)) continue;
  if (row.fraction > ceiling) {
    failures.push(
      `signal ${row.task_class} fires on ${row.count}/${n} Features (${(row.fraction * 100).toFixed(1)}%), above the declared ceiling of ${(ceiling * 100).toFixed(0)}% — it does not discriminate, so it is evidence of nothing`,
    );
  }
}

const report = {
  status: failures.length ? 'RED' : 'GREEN',
  features: n,
  ceiling,
  exempt_classes: [...exempt].sort(),
  emitted_classes: rows.length,
  by_class: rows,
};
if (failures.length) {
  console.error('Signal calibration check failed:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
