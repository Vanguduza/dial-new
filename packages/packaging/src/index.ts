import { access, cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { hashFile } from '../../pipeline-core/src/hash.js';
import { writeJsonAtomic } from '../../pipeline-core/src/fs.js';

async function walk(root: string, current = root): Promise<string[]> {
  const results: string[] = [];
  for (const name of await readdir(current)) {
    if (name === '.dvtg') continue;
    const path = join(current, name); const info = await stat(path);
    if (info.isDirectory()) results.push(...await walk(root, path)); else results.push(path);
  }
  return results;
}

export async function buildAssetManifest(root: string) {
  const files = await walk(root);
  const assets = await Promise.all(files.map(async (path) => ({ path: relative(root, path).replaceAll('\\','/'), sha256: await hashFile(path), bytes: (await stat(path)).size })));
  const manifest = { version: '1.0.0', generatedAt: new Date().toISOString(), immutableFilenamesRecommendedForPublish: true, assets };
  await writeJsonAtomic(join(root, 'asset-manifest.json'), manifest);
  return manifest;
}

export async function publishPreviewPack(source: string, destination: string) {
  const target = resolve(destination);
  if (!target.includes(`${sep}public${sep}packs${sep}`)) throw new Error('Preview publication target must be inside public/packs');
  await rm(target, { recursive: true, force: true });
  await ensurePreviewRoot(target);
  for (const name of ['meta.json', 'hero', 'cgi', 'technical', 'exploded', 'animation', 'navigation']) {
    const from = join(source, name);
    try { await access(from); } catch { continue; }
    await cp(from, join(target, name), { recursive: true, force: true });
  }
  await buildAssetManifest(target);
}

async function ensurePreviewRoot(path: string) {
  await mkdir(path, { recursive: true });
}
