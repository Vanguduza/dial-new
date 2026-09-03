#!/usr/bin/env node
// RBC-007 — source/test path mapping gate.
//
// Verifies that every path claimed by the Feature Registry and the Supporting
// Capability Registry actually exists, that no claimed gate outruns its
// evidence, and reports which implemented source files are not yet claimed by
// anything.
//
// The registries are the map. There is no separate mapping file, because a
// second copy of this relationship would drift from the first.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pack = 'docs/dial/final-audit';
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(root, p));

const FEATURES = 'agent-system/registries/FEATURE_REGISTRY.json';
const CAPABILITIES = `${pack}/11_FEATURE_REALIZATION/SUPPORTING_CAPABILITY_REGISTRY.json`;

// The lifecycle, imported rather than restated. A record may not claim a gate
// it has no evidence for: CODE_PRESENT needs code_paths, DOMAIN_TESTED needs
// tests too. This file used to keep its own copy of the ladder, which drifted
// out of step with the canon and made the guard reject canonical states.
import { GATE_LADDER as GATES, GATE_ALIASES } from '../lib/gate-ladder.mjs';

const failures = [];
const warnings = [];

const features = load(FEATURES);
const capabilities = load(CAPABILITIES);

function check(records, label, idKey, gateKey) {
  let mapped = 0;
  for (const record of records) {
    const id = record[idKey];
    const codePaths = record.code_paths ?? [];
    const testPaths = record.test_paths ?? [];

    for (const p of [...codePaths, ...testPaths]) {
      if (!exists(p)) failures.push(`${label} ${id}: claims a path that does not exist — ${p}`);
    }
    if (codePaths.length || testPaths.length) mapped += 1;

    const gate = record[gateKey] ?? 'SPECIFIED';
    if (!GATES.includes(gate)) {
      const canonical = GATE_ALIASES[gate];
      failures.push(
        canonical
          ? `${label} ${id}: superseded gate "${gate}" — write "${canonical}"`
          : `${label} ${id}: unknown gate "${gate}"`,
      );
      continue;
    }
    const index = GATES.indexOf(gate);
    if (index >= GATES.indexOf('CODE_PRESENT') && codePaths.length === 0) {
      failures.push(`${label} ${id}: claims ${gate} with no code_paths`);
    }
    if (index >= GATES.indexOf('DOMAIN_TESTED') && testPaths.length === 0) {
      failures.push(`${label} ${id}: claims ${gate} with no test_paths`);
    }
  }
  return mapped;
}

const mappedFeatures = check(features, 'Feature', 'feature_id', 'current_gate');
const mappedCapabilities = check(capabilities, 'Capability', 'capability_id', 'current_gate');

// ── orphan detection ───────────────────────────────────────────────────────
// Source that no Feature or Capability claims cannot be governed: it has no
// contract, no security profile and no acceptance criteria.
const claimed = new Set();
for (const record of [...features, ...capabilities]) {
  for (const p of [...(record.code_paths ?? []), ...(record.test_paths ?? [])]) {
    claimed.add(p.replaceAll('\\', '/'));
  }
}

const SOURCE_ROOTS = ['packages', 'apps', 'workers', 'tests'];
const IGNORED = /node_modules|\.next|\.vinext|\.wrangler|dist|\/ui\/|components\.json/;

// Application shell, build config and operator tooling. These are not customer
// capabilities and forcing them into one would make the mapping dishonest —
// but they must be declared, so that anything NOT on this list and NOT claimed
// by a Feature or Capability shows up as a genuine governance gap.
const SHELL_AND_TOOLING = new Set([
  'apps/preview-player/app/layout.tsx',
  'apps/preview-player/app/page.tsx',
  'apps/preview-player/hooks/use-mobile.ts',
  'apps/preview-player/lib/utils.ts',
  'apps/preview-player/next-env.d.ts',
  'apps/preview-player/next.config.ts',
  'apps/preview-player/vite.config.ts',
  // Build-time fallback error page, aliased from vite.config.ts because vinext
  // resolves `next/error` at bundle time and `next` is not a dependency. It is
  // infrastructure, not a customer capability.
  'apps/preview-player/lib/next-error-fallback.tsx',
  // Shared test fixture, not production source.
  'tests/helpers/scene-fixture.ts',
  // DIAL orchestration control-plane qualification. This tests operator
  // infrastructure under agent-system/, not a customer Feature/Capability.
  'tests/orchestration-control-plane.test.mjs',
  'apps/cli/src/index.ts',
  'workers/visual-generation-worker/src/index.ts',
  'playwright.config.ts',
  'vitest.config.ts',
]);

function walk(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (IGNORED.test(rel)) continue;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const sourceFiles = SOURCE_ROOTS.flatMap((r) => walk(r));
const orphans = sourceFiles.filter(
  (file) =>
    !SHELL_AND_TOOLING.has(file) &&
    ![...claimed].some((c) => file === c || file.startsWith(`${c}/`)),
);

if (orphans.length) {
  warnings.push(`${orphans.length} source file(s) claimed by no Feature or Capability:`);
  for (const orphan of orphans.slice(0, 20)) warnings.push(`    ${orphan}`);
  if (orphans.length > 20) warnings.push(`    … and ${orphans.length - 20} more`);
}

// ── report ─────────────────────────────────────────────────────────────────
const byGate = {};
for (const record of [...features, ...capabilities]) {
  const gate = record.current_gate ?? 'SPECIFIED';
  byGate[gate] = (byGate[gate] ?? 0) + 1;
}

for (const warning of warnings) console.log(`  ${warning}`);

if (failures.length) {
  console.error('\nDIAL source map: RED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'GREEN',
      features: features.length,
      features_mapped: mappedFeatures,
      capabilities: capabilities.length,
      capabilities_mapped: mappedCapabilities,
      source_files_scanned: sourceFiles.length,
      shell_and_tooling: SHELL_AND_TOOLING.size,
      unclaimed_source_files: orphans.length,
      by_gate: byGate,
    },
    null,
    2,
  ),
);