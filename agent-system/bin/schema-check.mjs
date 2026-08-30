#!/usr/bin/env node
// JSON Schema gate.
//
// Before this existed nothing in the repository parsed schemas/, so
// hero-to-epc-flow-pack.schema.json sat with unbalanced braces — invalid JSON —
// without any test noticing, while still being handed to the Catalog Agent as
// its integration contract.
//
// This validates that every schema parses, and that every generated navigation
// artifact conforms to the schema that claims to govern it. It implements the
// JSON Schema subset the DIAL schemas actually use, so it needs no dependency.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const checked = [];

// ── minimal JSON Schema validator (draft 2020-12 subset) ───────────────────
/** Structural equality, for `const` and `enum` over arrays and objects. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

function validate(value, schema, doc, at = '') {
  const errors = [];
  const fail = (message) => errors.push(`${at || '<root>'}: ${message}`);

  if (schema.$ref) {
    const target = schema.$ref.startsWith('#/')
      ? schema.$ref
          .slice(2)
          .split('/')
          .reduce((node, key) => node?.[key], doc)
      : null;
    if (!target) return [`${at}: unresolved $ref ${schema.$ref}`];
    return validate(value, target, doc, at);
  }

  // `const` and `enum` compare by value, not by reference. Using !== and
  // Array.includes meant a const array or object could never match anything,
  // so a schema pinning an exact list reported RED against a document that
  // was in fact identical.
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    fail(`expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => deepEqual(value, candidate))) {
    fail(`${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }

  const types = schema.type ? [schema.type].flat() : null;
  if (types) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const ok = types.some((t) => (t === 'integer' ? Number.isInteger(value) : t === actual));
    if (!ok) {
      fail(`expected type ${types.join('|')}, got ${actual}`);
      return errors; // further checks would be noise
    }
  }

  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      fail(`"${value}" does not match ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`shorter than minLength ${schema.minLength}`);
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above maximum ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`has ${value.length} items, minItems is ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) fail('items are not unique');
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(item, schema.items, doc, `${at}[${index}]`));
      });
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) fail(`missing required property "${key}"`);
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], subSchema, doc, at ? `${at}.${key}` : key));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) fail(`unexpected property "${key}"`);
      }
    } else if (typeof schema.additionalProperties === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (!(key in (schema.properties ?? {}))) {
          errors.push(...validate(item, schema.additionalProperties, doc, at ? `${at}.${key}` : key));
        }
      }
    }
  }

  for (const sub of schema.allOf ?? []) {
    if (sub.if) {
      const conditionHolds = validate(value, sub.if, doc, at).length === 0;
      if (conditionHolds && sub.then) errors.push(...validate(value, sub.then, doc, at));
      if (!conditionHolds && sub.else) errors.push(...validate(value, sub.else, doc, at));
    } else {
      errors.push(...validate(value, sub, doc, at));
    }
  }

  return errors;
}

// ── 1. every schema must parse ─────────────────────────────────────────────
const schemaDir = path.join(root, 'schemas');
const schemas = {};
for (const name of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.json'))) {
  try {
    schemas[name] = JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8'));
    checked.push(`schemas/${name} parses`);
  } catch (error) {
    failures.push(`schemas/${name} is not valid JSON — ${error.message}`);
  }
}

// ── 2. generated artifacts must conform ────────────────────────────────────
const governed = [
  { glob: 'navigation/hero-to-epc-flow-pack.json', schema: 'hero-to-epc-flow-pack.schema.json' },
  { glob: 'navigation/epc-mapping.json', schema: 'visual-epc-mapping.schema.json' },
];
const directlyGoverned = [
  {
    path: 'catalog-data/generated/visual-transition-source-queue.json',
    schema: 'visual-transition-source-queue.schema.json',
  },
  {
    path: 'apps/preview-player/public/catalog/visual-transition-source-queue.json',
    schema: 'visual-transition-source-queue.schema.json',
  },
];

function findPacks(base) {
  const found = [];
  if (!fs.existsSync(path.join(root, base))) return found;
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), depth + 1);
    }
    found.push(dir);
  };
  walk(base);
  return found;
}

const roots = [...findPacks('artifacts'), ...findPacks('apps/preview-player/public/packs')];

for (const { glob, schema } of governed) {
  const doc = schemas[schema];
  if (!doc) continue;
  for (const packRoot of roots) {
    const target = path.join(packRoot, glob);
    if (!fs.existsSync(path.join(root, target))) continue;
    let instance;
    try {
      instance = JSON.parse(fs.readFileSync(path.join(root, target), 'utf8'));
    } catch (error) {
      failures.push(`${target}: not valid JSON — ${error.message}`);
      continue;
    }
    const errors = validate(instance, doc, doc);
    if (errors.length) {
      failures.push(`${target} violates ${schema}:`);
      for (const error of errors.slice(0, 12)) failures.push(`    ${error}`);
    } else {
      checked.push(`${target} conforms to ${schema}`);
    }
  }
}

for (const entry of directlyGoverned) {
  const doc = schemas[entry.schema];
  const target = path.join(root, entry.path);
  if (!doc || !fs.existsSync(target)) continue;
  try {
    const instance = JSON.parse(fs.readFileSync(target, 'utf8'));
    const errors = validate(instance, doc, doc);
    if (errors.length) {
      failures.push(`${entry.path} violates ${entry.schema}:`);
      for (const error of errors.slice(0, 12)) failures.push(`    ${error}`);
    } else {
      checked.push(`${entry.path} conforms to ${entry.schema}`);
    }
  } catch (error) {
    failures.push(`${entry.path}: not valid JSON — ${error.message}`);
  }
}

for (const line of checked) console.log(`  ok  ${line}`);

if (failures.length) {
  console.error('\nDIAL schema check: RED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({ status: 'GREEN', assertions: checked.length }, null, 2));
