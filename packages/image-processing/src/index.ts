import sharp from 'sharp';
import { copyFile, readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { ensureDir } from '../../pipeline-core/src/fs.js';

export interface RenderOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export async function validateImage(path: string, developmentMode: boolean) {
  const file = await stat(path);
  if (!file.isFile()) throw new Error(`Reference is not a file: ${path}`);
  if (file.size === 0 || file.size > 25 * 1024 * 1024) throw new Error(`Reference size is invalid: ${path}`);
  const extension = extname(path).toLowerCase();
  const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
  if (developmentMode) allowed.add('.svg');
  if (!allowed.has(extension)) throw new Error(`Unsupported source type ${extension || '(none)'}`);
  try { await sharp(path).metadata(); } catch { throw new Error(`Corrupt or unsupported image: ${path}`); }
}

export async function renderSvg(svg: string, outputPath: string, options: RenderOptions = {}) {
  const width = options.width ?? 1600;
  const height = options.height ?? 900;
  await ensureDir(outputPath.substring(0, Math.max(outputPath.lastIndexOf('/'), outputPath.lastIndexOf('\\'))));
  const image = sharp(Buffer.from(svg)).resize(width, height, { fit: 'fill' });
  const ext = extname(outputPath).toLowerCase();
  if (ext === '.avif') await image.avif({ quality: options.quality ?? 62, effort: 3 }).toFile(outputPath);
  else if (ext === '.webp') await image.webp({ quality: options.quality ?? 76 }).toFile(outputPath);
  else await image.png({ compressionLevel: 8 }).toFile(outputPath);
}

export async function normalizeSource(sourcePath: string, avifPath: string, webpPath: string) {
  await ensureDir(avifPath.substring(0, Math.max(avifPath.lastIndexOf('/'), avifPath.lastIndexOf('\\'))));
  const base = sharp(sourcePath).resize(1600, 900, { fit: 'contain', background: { r: 8, g: 12, b: 18, alpha: 1 } });
  await base.clone().avif({ quality: 68, effort: 3 }).toFile(avifPath);
  await base.clone().webp({ quality: 78, alphaQuality: 90 }).toFile(webpPath);
}

export async function copyAsset(source: string, destination: string) {
  await ensureDir(destination.substring(0, Math.max(destination.lastIndexOf('/'), destination.lastIndexOf('\\'))));
  await copyFile(source, destination);
}

export async function makeContactSheet(paths: string[], outputPath: string) {
  const tiles = await Promise.all(paths.map(async (path) => {
    const buffer = await sharp(await readFile(path)).resize(640, 360, { fit: 'contain', background: '#080d14' }).png().toBuffer();
    return buffer;
  }));
  const canvas = sharp({ create: { width: 1920, height: 720, channels: 4, background: '#060a10' } });
  await canvas.composite(tiles.map((input, i) => ({ input, left: (i % 3) * 640, top: Math.floor(i / 3) * 360 }))).jpeg({ quality: 88 }).toFile(outputPath);
}
