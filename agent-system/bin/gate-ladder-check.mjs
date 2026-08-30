#!/usr/bin/env node
// One gate ladder, enforced.
//
// Three ladders were live at once — the closure canon's, v1_6 §7's and the
// module-expansion §34's — each asserting continuity with the others, and the
// FEATURE_REGISTRY schema enforced a fourth combination. Prose cannot settle
// that; this can. Source of truth:
// docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/13_GATE_LADDER/GATE_LADDER_CANON.md
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pack = 'docs/dial/final-audit';
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

export const GATE_LADDER = [
  'SPECIFIED',
  'DESIGN_CLOSED',
  'BUILDABLE',
  'CODE_PRESENT',
  'DOMAIN_TESTED',
  'INTEGRATION_GREEN',
  'STAGING_GREEN',
  'CERTIFIED_DORMANT',
  'ACTIVATION_BLOCKERS_GREEN',
  'ACTIVE',
];

// Superseded names. Present so the failure can say what to write instead,
// rather than only that the value is unknown.
export const GATE_ALIASES = {
  PLANNED: 'SPECIFIED',
  MAPPED: 'BUILDABLE',
  THIN_SLICE_REQUIRED: 'BUILDABLE',
  THIN_SLICE_GREEN: 'CODE_PRESENT',
  DOMAIN_GREEN: 'DOMAIN_TESTED',
  PRODUCTION_GREEN: 'ACTIVATION_BLOCKERS_GREEN',
};

const sources = [
  { file: 'agent-system/registries/FEATURE_REGISTRY.json', id: 'feature_id', fields: ['status', 'current_gate'], inPack: false },
  { file: `${pack}/11_FEATURE_REALIZATION/SUPPORTING_CAPABILITY_REGISTRY.json`, id: 'capability_id', fields: ['status', 'current_gate'], inPack: true },
  { file: `${pack}/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json`, id: 'subfeature_id', fields: ['status'], inPack: true },
  { file: `${pack}/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json`, id: 'feature_id', fields: ['implementation_status'], inPack: true },
];

const failures = [];
const counts = {};

for (const source of sources) {
  const full = path.join(root, source.file);
  if (!fs.existsSync(full)) continue;
  for (const record of load(source.file)) {
    for (const field of source.fields) {
      const value = record[field];
      if (value === undefined || value === null) continue;
      counts[value] = (counts[value] ?? 0) + 1;
      if (GATE_LADDER.includes(value)) continue;
      const alias = GATE_ALIASES[value];
      failures.push(
        alias
          ? `${source.file}: ${record[source.id]}.${field} = "${value}" is a superseded name — write "${alias}"`
          : `${source.file}: ${record[source.id]}.${field} = "${value}" is not a canonical gate state`,
      );
    }
  }
}

// The registry schema must not enforce a different ladder than the canon.
const schemaPath = 'agent-system/registries/FEATURE_REGISTRY.schema.json';
if (fs.existsSync(path.join(root, schemaPath))) {
  const enumerated = load(schemaPath)?.items?.properties?.status?.enum;
  if (!enumerated) failures.push(`${schemaPath}: status enum missing`);
  else {
    const extra = enumerated.filter((v) => !GATE_LADDER.includes(v));
    const missing = GATE_LADDER.filter((v) => !enumerated.includes(v));
    if (extra.length) failures.push(`${schemaPath}: status enum allows non-canonical ${extra.join(', ')}`);
    if (missing.length) failures.push(`${schemaPath}: status enum omits canonical ${missing.join(', ')}`);
  }
}

if (failures.length) {
  console.error('DIAL gate ladder: RED');
  for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
  if (failures.length > 40) console.error(`  … and ${failures.length - 40} more`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    { status: 'GREEN', ladder: GATE_LADDER, states_in_use: counts },
    null,
    2,
  ),
);
