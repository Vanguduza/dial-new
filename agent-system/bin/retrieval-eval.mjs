#!/usr/bin/env node
// Retrieval quality gate (S3).
//
// DIAL measures whether the system REJECTS bad instructions - harness-evals.json
// does that well. It has never measured whether retrieval RETURNS the right
// context. Under supervision a person notices bad context. Under autonomy
// nothing does, which makes this a safety control rather than a quality metric.
//
// Scoring is deliberately asymmetric:
//
//   recall           of the resources a case says MUST be returned, how many were
//   precision_proxy  of the resources a case says must NOT be returned, how many
//                    were correctly absent
//   candidate_set    how many resources the worker actually receives
//
// Exhaustive relevance labels do not exist for a 102-resource corpus, so
// precision is measured against explicit must_exclude rather than over the whole
// corpus. That is honest about what is being measured.
//
// Usage:
//   node agent-system/bin/retrieval-eval.mjs            score against the floors
//   node agent-system/bin/retrieval-eval.mjs --report    per-case detail, no gate
//   node agent-system/bin/retrieval-eval.mjs --json out.json   persist for comparison
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolvePacketEngineeringKnowledge } from '../orchestration/engineering-knowledge-broker.mjs';

const root = process.cwd();
const GOLDEN = 'agent-system/engineering-knowledge/evals/retrieval-golden-set.json';
const golden = JSON.parse(fs.readFileSync(path.join(root, GOLDEN), 'utf8'));

const COMMUNITY_PREFIX = 'community.zie619.';
const report = process.argv.includes('--report');
const jsonIndex = process.argv.indexOf('--json');
const jsonOut = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : null;

const results = [];
for (const c of golden.cases) {
  let eligible = [];
  let bound = null;
  let error = null;
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-retrieval-eval-'));
  try {
    const manifest = resolvePacketEngineeringKnowledge({
      repoDir: root,
      root: control,
      packetId: `retrieval-eval-${c.case_id}`,
      instruction: c.instruction,
      metadata: {
        feature_id: c.feature_id,
        affected_paths: c.affected_paths ?? [],
        max_resources: golden.floors?.regression_floor?.max_candidate_set ?? 24,
      },
    });
    eligible = (manifest.resources ?? []).map((x) => x.resource_id);
    bound = manifest.knowledge_context?.traversal_bound ?? null;
  } catch (e) {
    error = e.message;
  } finally {
    fs.rmSync(control, { recursive: true, force: true });
  }

  const got = new Set(eligible);
  const mustInclude = c.must_include ?? [];
  const mustExclude = c.must_exclude ?? [];
  const hit = mustInclude.filter((x) => got.has(x));
  const missed = mustInclude.filter((x) => !got.has(x));
  const leaked = mustExclude.filter((x) => got.has(x));

  const community = eligible.filter((x) => x.startsWith(COMMUNITY_PREFIX));
  const communityFindings = [];
  if (c.expect_community_anti_patterns === true && community.length === 0) {
    communityFindings.push('expected community anti-pattern knowledge, got none');
  }
  if (c.forbid_community_corpus === true && community.length > 0) {
    communityFindings.push(`community corpus must fail closed here, got ${community.length}`);
  }

  results.push({
    case_id: c.case_id,
    returned: eligible.slice().sort(),
    feature_id: c.feature_id,
    error,
    recall: mustInclude.length ? Number((hit.length / mustInclude.length).toFixed(4)) : 1,
    precision_proxy: mustExclude.length
      ? Number(((mustExclude.length - leaked.length) / mustExclude.length).toFixed(4))
      : 1,
    candidate_set: eligible.length,
    visited_fraction: bound ? bound.visited_fraction : null,
    missed,
    leaked,
    community_findings: communityFindings,
    community_returned: community.length,
  });
}

// Differential cases. Two cases naming each other must not return the same set: if they do,
// the graph neighbourhood is a function of the Feature record alone and the concrete task
// cannot change what is retrievable. No include/exclude list catches that on its own.
const byCase = new Map(results.map((r) => [r.case_id, r]));
for (const c of golden.cases) {
  if (!c.must_differ_from) continue;
  const mine = byCase.get(c.case_id);
  const other = byCase.get(c.must_differ_from);
  if (!mine || !other) { mine?.community_findings.push(`must_differ_from names unknown case ${c.must_differ_from}`); continue; }
  if (JSON.stringify(mine.returned) === JSON.stringify(other.returned)) {
    mine.community_findings.push(`returned an identical set to ${c.must_differ_from}: the concrete task did not change retrieval`);
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
const recall = Number(mean(results.map((r) => r.recall)).toFixed(4));
const precision = Number(mean(results.map((r) => r.precision_proxy)).toFixed(4));
const largest = Math.max(0, ...results.map((r) => r.candidate_set));
const floors = golden.floors?.regression_floor ?? {};
const target = golden.floors?.target ?? {};

const failures = [];
if (results.some((r) => r.error)) {
  for (const r of results.filter((x) => x.error)) failures.push(`${r.case_id}: resolver threw — ${r.error}`);
}
if (recall < (floors.min_recall ?? 0)) {
  failures.push(`mean recall ${recall} below floor ${floors.min_recall}`);
}
if (precision < (floors.min_precision_proxy ?? 0)) {
  failures.push(`mean precision_proxy ${precision} below floor ${floors.min_precision_proxy}`);
}
if (largest > (floors.max_candidate_set ?? Infinity)) {
  failures.push(`largest candidate set ${largest} exceeds ${floors.max_candidate_set}`);
}
const pending = new Map(golden.cases.filter((c) => c.pending_owner_decision).map((c) => [c.case_id, c.pending_owner_decision]));
for (const r of results) {
  for (const f of r.community_findings) {
    if (pending.has(r.case_id)) continue;
    failures.push(`${r.case_id}: ${f}`);
  }
}

const summary = {
  status: failures.length ? 'RED' : 'GREEN',
  eval_id: golden.eval_id,
  cases: results.length,
  mean_recall: recall,
  mean_precision_proxy: precision,
  largest_candidate_set: largest,
  floors,
  target,
  distance_to_target: {
    recall: Number(((target.min_recall ?? 1) - recall).toFixed(4)),
    precision_proxy: Number(((target.min_precision_proxy ?? 1) - precision).toFixed(4)),
  },
  failures: failures.length,
  pending_owner_decision: [...pending.keys()],
};

if (report || failures.length) {
  console.error('');
  for (const r of results) {
    const flag = r.missed.length || r.leaked.length || r.community_findings.length ? 'x' : 'ok';
    console.error(
      `  ${flag.padEnd(3)} ${r.case_id} ${r.feature_id.padEnd(12)} recall ${String(r.recall).padEnd(6)} prec ${String(r.precision_proxy).padEnd(6)} set ${String(r.candidate_set).padStart(3)}` +
        (r.missed.length ? `  missed: ${r.missed.join(', ')}` : '') +
        (r.leaked.length ? `  LEAKED: ${r.leaked.join(', ')}` : '') +
        (r.community_findings.length ? `  ${r.community_findings.join('; ')}` : ''),
    );
  }
  console.error('');
}
for (const [id, why] of pending) {
  console.error(`  PENDING OWNER DECISION  ${id}: ${why}`);
  console.error('');
}
if (failures.length) {
  console.error('Retrieval eval failed:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
}

const slim = results.map(({ returned, ...rest }) => rest);
console.log(JSON.stringify(report ? { ...summary, results: slim } : summary, null, 2));
if (jsonOut) fs.writeFileSync(jsonOut, `${JSON.stringify({ ...summary, results }, null, 2)}\n`);
if (failures.length && !report) process.exitCode = 1;
