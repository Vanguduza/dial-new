import { access, cp, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { hashFile } from '../../pipeline-core/src/hash.js';
import { writeJsonAtomic } from '../../pipeline-core/src/fs.js';

/**
 * Walks a pack root, skipping symlinks.
 *
 * The previous implementation used stat(), which follows links. A symlinked
 * directory inside a pack either escaped the pack — so the asset manifest
 * hashed and published files from outside it — or pointed at an ancestor and
 * recursed until the process ran out of memory.
 */
async function walk(root: string, current = root): Promise<string[]> {
  const results: string[] = [];
  for (const name of await readdir(current)) {
    if (name === '.dvtg') continue;
    const path = join(current, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) results.push(...(await walk(root, path)));
    else if (info.isFile()) results.push(path);
  }
  return results;
}

export async function buildAssetManifest(root: string) {
  const files = await walk(root);
  const assets = await Promise.all(
    files.map(async (path) => ({
      path: relative(root, path).replaceAll('\\', '/'),
      sha256: await hashFile(path),
      bytes: (await stat(path)).size,
    })),
  );
  assets.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    immutableFilenamesRecommendedForPublish: true,
    assets,
  };
  await writeJsonAtomic(join(root, 'asset-manifest.json'), manifest);
  return manifest;
}

export async function publishPreviewPack(source: string, destination: string) {
  const target = resolve(destination);
  // Containment check on resolved path segments rather than substring search.
  // 'includes' would accept any path that happened to contain the marker text.
  const segments = target.split(sep);
  const publicIndex = segments.lastIndexOf('public');
  const contained = publicIndex >= 0 && segments[publicIndex + 1] === 'packs';
  if (!contained) {
    throw new Error('Preview publication target must be inside public/packs');
  }
  // This performs a recursive delete, so refuse to operate on the packs root
  // itself — only on a visual-family directory beneath it.
  if (segments.length <= publicIndex + 2) {
    throw new Error('Preview publication target must name a visual family directory');
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const name of ['meta.json', 'hero', 'cgi', 'technical', 'exploded', 'animation', 'navigation']) {
    const from = join(source, name);
    try {
      await access(from);
    } catch {
      continue;
    }
    await cp(from, join(target, name), { recursive: true, force: true, dereference: false });
  }
  await buildAssetManifest(target);
}
