#!/usr/bin/env node
// Module boundary gate.
//
// The workspace declares 23 packages, but nothing stopped one from importing
// another's internal files. `packages/animation` reached into
// `pipeline-core/src/fs.js`, `apps/cli` reached into `scene-engine/src/factory.js`,
// and so on: eighteen imports routed around an entry point that existed.
// Package boundaries that are not enforced are decoration, and they erode
// silently because every individual shortcut looks harmless.
//
// The rule: a module may use its OWN package's internals freely. Importing
// ANOTHER package may only target that package's declared entry point - its
// package.json "main", or src/index.ts when it declares none.
//
// This does not require workspace-name imports. The tree compiles as one
// TypeScript program into a mirrored dist/, so relative paths are how the
// runtime resolves; forcing '@dial/x' would need per-package builds and
// exports maps, which is a separate change. The boundary is what matters, and
// the boundary is checkable either way.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const AREAS = ['packages', 'apps', 'workers'];
const IMPORT = /(?:from|import)\s*\(?\s*'([^']+)'/g;

function listPackages() {
  const out = new Map();
  for (const area of AREAS) {
    const base = path.join(root, area);
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const dir = path.join(base, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      let main = null;
      const pkgJson = path.join(dir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        try {
          main = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).main || null;
        } catch {
          main = null;
        }
      }
      if (!main && fs.existsSync(path.join(dir, 'src/index.ts'))) main = 'src/index.ts';
      out.set(`${area}/${name}`, { dir: `${area}/${name}`, entry: main });
    }
  }
  return out;
}

function sourceFiles(dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const packages = listPackages();
const owners = [...packages.keys()].sort((a, b) => b.length - a.length);
const ownerOf = (file) => owners.find((p) => file.startsWith(`${p}/`)) ?? null;

// The entry point compiles to .js next to its source, and importers spell it
// that way. Compare on that spelling so "src/index.ts" and "src/index.js" match.
const entrySpellings = (pkg) => {
  const entry = packages.get(pkg)?.entry;
  if (!entry) return [];
  return [entry, entry.replace(/\.tsx?$/, '.js')];
};

const violations = [];
let checked = 0;
let crossPackage = 0;

for (const area of AREAS) {
  for (const file of sourceFiles(area)) {
    const owner = ownerOf(file);
    if (!owner) continue;
    checked += 1;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1];
      let targetPath = null;

      if (spec.startsWith('.')) {
        targetPath = path
          .relative(root, path.resolve(path.dirname(path.join(root, file)), spec))
          .replaceAll('\\', '/');
      } else if (spec.startsWith('@dial/')) {
        const name = spec.slice('@dial/'.length).split('/')[0];
        const pkg = [...packages.keys()].find((p) => p.endsWith(`/${name}`));
        if (!pkg) continue;
        const rest = spec.slice(`@dial/${name}`.length).replace(/^\//, '');
        targetPath = rest ? `${pkg}/${rest}` : pkg;
      } else {
        continue; // external dependency
      }

      const target = ownerOf(targetPath) ?? (packages.has(targetPath) ? targetPath : null);
      if (!target || target === owner) continue;
      crossPackage += 1;

      const allowed = entrySpellings(target).map((e) => `${target}/${e}`);
      if (allowed.length === 0) {
        violations.push(`${file}: imports ${target}, which declares no entry point (add "main" or src/index.ts)`);
        continue;
      }
      if (targetPath === target) continue; // bare package specifier resolves to the entry
      if (!allowed.includes(targetPath)) {
        violations.push(
          `${file}: reaches into ${target} internals — ${spec}\n      route it through ${allowed[0]} and re-export there`,
        );
      }
    }
  }
}

const report = {
  status: violations.length ? 'RED' : 'GREEN',
  packages: packages.size,
  source_files_checked: checked,
  cross_package_imports: crossPackage,
  violations: violations.length,
};

if (violations.length) {
  console.error('Module boundary violations:\n');
  for (const v of violations) console.error(`  - ${v}`);
  console.error('');
}
console.log(JSON.stringify(report, null, 2));
if (violations.length) process.exitCode = 1;
