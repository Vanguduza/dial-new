#!/usr/bin/env node
// Graph orphan gate (S1).
//
// 3,432 of 5,330 compiled nodes once had degree zero - 64.4% of the graph was
// unreachable by any query. The bulk were EVENT (2,435) and API (927), and
// their situation was structural rather than accidental: the closed edge
// vocabulary defined no edge type with either as a source or a target, so no
// amount of data could ever have connected them.
//
// Two rules, because they catch different mistakes:
//
//   TYPE RULE     A node type that is ENTIRELY isolated means the vocabulary
//                 has no edge for it. This is the EVENT/API defect and it is
//                 always a bug - either connect the type or stop compiling it.
//   CEILING RULE  Total isolated fraction above the declared ceiling means
//                 unreferenced records are accumulating unnoticed.
//
// Isolated nodes are not merely wasted space: every one is hashed into
// graph_revision_hash, so churn in a node nothing can retrieve still
// invalidates knowledge bindings.
import fs from 'node:fs';
import path from 'node:path';
import { compileGraphContent } from '../orchestration/canon-graph-compiler.mjs';

const root = process.cwd();
const POLICY = 'agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json';
const policy = JSON.parse(fs.readFileSync(path.join(root, POLICY), 'utf8'));
const ceiling = Number(policy.orphan_policy?.max_isolated_fraction ?? 0.02);
const exempt = new Set(policy.orphan_policy?.type_rule_exempt ?? []);

const graph = compileGraphContent(root);

const degree = new Map(graph.nodes.map((n) => [n.node_ref, 0]));
for (const edge of graph.edges) {
  if (edge.tombstoned) continue;
  degree.set(edge.source_ref, (degree.get(edge.source_ref) ?? 0) + 1);
  degree.set(edge.target_ref, (degree.get(edge.target_ref) ?? 0) + 1);
}

const total = new Map();
const isolated = new Map();
for (const node of graph.nodes) {
  total.set(node.node_type, (total.get(node.node_type) ?? 0) + 1);
  if ((degree.get(node.node_ref) ?? 0) === 0) {
    isolated.set(node.node_type, (isolated.get(node.node_type) ?? 0) + 1);
  }
}

const failures = [];

// Type rule: a wholly isolated type has no edge vocabulary at all.
const fullyIsolated = [...total.keys()]
  .filter((type) => !exempt.has(type) && (isolated.get(type) ?? 0) === total.get(type))
  .sort();
for (const type of fullyIsolated) {
  failures.push(
    `node type ${type} is entirely isolated (${total.get(type)} nodes): no edge type in the closed vocabulary names it as a source or target — connect it or stop compiling it`,
  );
}

const isolatedTotal = [...isolated.values()].reduce((a, b) => a + b, 0);
const fraction = graph.nodes.length ? isolatedTotal / graph.nodes.length : 0;
if (fraction > ceiling) {
  failures.push(
    `isolated fraction ${(fraction * 100).toFixed(2)}% exceeds the declared ceiling of ${(ceiling * 100).toFixed(2)}%`,
  );
}

const report = {
  status: failures.length ? 'RED' : 'GREEN',
  nodes: graph.nodes.length,
  edges: graph.edges.length,
  isolated: isolatedTotal,
  isolated_fraction: Number(fraction.toFixed(6)),
  ceiling,
  fully_isolated_types: fullyIsolated,
  by_type: Object.fromEntries([...isolated.entries()].sort((a, b) => b[1] - a[1])),
};

if (failures.length) {
  console.error('Graph orphan check failed:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
