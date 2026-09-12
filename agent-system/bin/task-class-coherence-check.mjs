#!/usr/bin/env node
// Task-class vocabulary coherence gate.
//
// Resources declare the task classes they address. The classifier emits task classes from
// the concrete instruction and the registry records. These are two vocabularies maintained
// in different files, and they had silently drifted apart: resources declared 62 classes
// and the classifier could emit only 37 of them, so 25 classes covering 86 declarations -
// RELIABILITY (22 resources), SECURITY (20), AI_SECURITY (17), WEBHOOK_SECURITY (6) - were
// dead vocabulary.
//
// That is not a cosmetic mismatch. Under graph-first bounding a resource is reachable only
// through a declared concern, so a resource whose only declared class can never be emitted
// can never be retrieved by any instruction. It sits in the registry looking available.
//
// Both directions are reported; only the retrieval-fatal one fails the build:
//
//   UNREACHABLE  a class some resource declares that no rule can emit. Fails.
//   UNUSED       a class a rule can emit that no resource declares. Reported only -
//                rules legitimately anticipate resources not yet admitted.
import fs from 'node:fs';
import path from 'node:path';
import { emittableTaskClasses } from '../orchestration/engineering-resource-resolver.mjs';

const root = process.cwd();
const RESOURCE_REL = 'agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json';
const resources = JSON.parse(fs.readFileSync(path.join(root, RESOURCE_REL), 'utf8'));

const emittable = emittableTaskClasses(root);
const declaredBy = new Map();
for (const r of resources) {
  for (const c of r.task_classes || []) {
    if (c === '*') continue;
    if (!declaredBy.has(c)) declaredBy.set(c, []);
    declaredBy.get(c).push(r.resource_id);
  }
}

const unreachable = [...declaredBy.keys()].filter((c) => !emittable.has(c)).sort();
const unused = [...emittable].filter((c) => !declaredBy.has(c)).sort();

// A resource with no reachable declared class and no always_bind cannot be retrieved at all.
const stranded = resources
  .filter((r) => r.always_bind !== true && r.resource_class !== 'SKILL')
  .filter((r) => {
    const classes = (r.task_classes || []).filter((c) => c !== '*');
    return classes.length > 0 && classes.every((c) => !emittable.has(c));
  })
  .map((r) => r.resource_id)
  .sort();

const failures = [];
for (const c of unreachable) {
  failures.push(
    `task class ${c} is declared by ${declaredBy.get(c).length} resource(s) but no classifier rule can emit it — add a rule to TASK_CLASS_SIGNAL_POLICY.prose_signals or stop declaring it`,
  );
}
for (const id of stranded) {
  failures.push(`resource ${id} declares only classes nothing can emit: it is permanently unretrievable`);
}

const report = {
  status: failures.length ? 'RED' : 'GREEN',
  declared_classes: declaredBy.size,
  emittable_classes: emittable.size,
  unreachable_declared: unreachable,
  unused_emittable: unused,
  stranded_resources: stranded,
};
if (failures.length) {
  console.error('Task-class coherence check failed:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
