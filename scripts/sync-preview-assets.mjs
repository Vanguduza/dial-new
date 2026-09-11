#!/usr/bin/env node
// Regenerates everything under apps/preview-player/public/ that is derived from
// something else in the repository.
//
// Two copies used to be committed:
//
//   * public/packs/<family>/  - the publishable subset of artifacts/<family>/,
//     produced by publishPreviewPack. Committed separately, it had ALREADY
//     drifted: the pack job regenerates artifacts/ on every CI run and nothing
//     ever re-derived this copy.
//   * public/catalog/visual-transition-source-queue.json - byte-identical to
//     catalog-data/generated/visual-transition-source-queue.json. 12MB, twice.
//
// Deriving them means the preview can only ever serve what the pipeline
// actually produced.
import { access, copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
// From dist/, like every other run script (see `dial-visual`, `api`): the
// packages compile as one program into a mirrored dist/, so the .ts sources are
// not directly importable from a plain .mjs entry point.
import { publishPreviewPack } from '../dist/packages/packaging/src/index.js';

const root = process.cwd();
const ARTIFACTS = join(root, 'artifacts');
const PUBLIC = join(root, 'apps/preview-player/public');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const derivedFiles = [
  {
    from: 'catalog-data/generated/visual-transition-source-queue.json',
    to: 'apps/preview-player/public/catalog/visual-transition-source-queue.json',
  },
];

async function main() {
  const done = [];

  if (await exists(ARTIFACTS)) {
    for (const family of (await readdir(ARTIFACTS, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()) {
      for (const version of (await readdir(join(ARTIFACTS, family), { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()) {
        const source = join(ARTIFACTS, family, version);
        const target = join(PUBLIC, 'packs', family, version);
        await publishPreviewPack(source, target);
        done.push(`packs/${family}/${version}`);
      }
    }
  }

  for (const { from, to } of derivedFiles) {
    if (!(await exists(join(root, from)))) continue;
    await mkdir(dirname(join(root, to)), { recursive: true });
    await copyFile(join(root, from), join(root, to));
    done.push(to.replace('apps/preview-player/public/', ''));
  }

  console.log(JSON.stringify({ status: 'SYNCED', derived: done }, null, 2));
}

main().catch((error) => {
  console.error(`preview asset sync failed: ${error.message}`);
  process.exitCode = 1;
});
