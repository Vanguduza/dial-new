import sharp from 'sharp';
import { copyFile, open, readFile, stat } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { ensureDir } from '../../pipeline-core/src/index.js';

export interface RenderOptions {
  width?: number;
  height?: number;
  quality?: number;
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
// sharp's own default ceiling is ~268 megapixels, which still decodes to
// gigabytes of RAM. A vehicle reference has no legitimate need to exceed this.
const MAX_DECODED_PIXELS = 50_000_000;

/**
 * Magic-byte signatures. The previous implementation allowlisted by file
 * extension only, so a file named .png containing anything at all reached the
 * decoder, and a polyglot passed the check entirely.
 */
const SIGNATURES: Array<{ format: string; test: (head: Buffer) => boolean }> = [
  { format: 'jpeg', test: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  {
    format: 'png',
    test: (h) =>
      h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    format: 'webp',
    test: (h) => h.subarray(0, 4).toString('ascii') === 'RIFF' && h.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    format: 'avif',
    test: (h) => {
      if (h.subarray(4, 8).toString('ascii') !== 'ftyp') return false;
      const brand = h.subarray(8, 12).toString('ascii');
      return brand === 'avif' || brand === 'avis' || brand === 'mif1';
    },
  },
];

const EXTENSION_TO_FORMAT: Record<string, string> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
  '.avif': 'avif',
};

async function readHead(path: string, bytes = 32): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function validateImage(path: string, developmentMode: boolean) {
  const file = await stat(path);
  if (!file.isFile()) throw new Error(`Reference is not a file: ${path}`);
  if (file.size === 0 || file.size > MAX_SOURCE_BYTES) {
    throw new Error(`Reference size is invalid: ${path}`);
  }

  const extension = extname(path).toLowerCase();

  // SVG is accepted only for the deterministic development fixture. It is XML,
  // not a raster format, and it reaches a full XML parser inside the
  // rasteriser. developmentMode is a field in the job file, so this branch is
  // reachable by anyone who can supply one — it must stay narrow.
  if (extension === '.svg') {
    if (!developmentMode) throw new Error('SVG sources are permitted only in development mode');
    const text = await readFile(path, 'utf8');
    if (/<!DOCTYPE|<!ENTITY|xlink:href\s*=\s*["']?(?!#)/i.test(text)) {
      throw new Error(`SVG source declares external entities or references: ${path}`);
    }
    if (/<script|\bon[a-z]+\s*=/i.test(text)) {
      throw new Error(`SVG source contains script content: ${path}`);
    }
  } else {
    const declared = EXTENSION_TO_FORMAT[extension];
    if (!declared) throw new Error(`Unsupported source type ${extension || '(none)'}`);
    const head = await readHead(path);
    const actual = SIGNATURES.find((signature) => signature.test(head))?.format;
    if (!actual) throw new Error(`Source content is not a supported image format: ${path}`);
    if (actual !== declared) {
      throw new Error(`Source content is ${actual} but the extension declares ${declared}: ${path}`);
    }
  }

  let metadata;
  try {
    metadata = await sharp(path, { limitInputPixels: MAX_DECODED_PIXELS }).metadata();
  } catch {
    throw new Error(`Corrupt or unsupported image: ${path}`);
  }

  // A small compressed file can declare enormous dimensions. Reject before any
  // stage allocates a decode buffer for it.
  const { width = 0, height = 0 } = metadata;
  if (width * height > MAX_DECODED_PIXELS) {
    throw new Error(`Source decodes to ${width}x${height}, above the ${MAX_DECODED_PIXELS} pixel limit`);
  }
  if (width < 320 || height < 180) {
    throw new Error(`Source is too small to be a usable reference: ${width}x${height}`);
  }
}

export async function renderSvg(svg: string, outputPath: string, options: RenderOptions = {}) {
  const width = options.width ?? 1600;
  const height = options.height ?? 900;
  // dirname handles a bare filename correctly. The previous lastIndexOf-based
  // form produced an empty string for a path with no separator, and mkdir('')
  // throws.
  await ensureDir(dirname(outputPath));
  const image = sharp(Buffer.from(svg), { limitInputPixels: MAX_DECODED_PIXELS }).resize(
    width,
    height,
    { fit: 'fill' },
  );
  const ext = extname(outputPath).toLowerCase();
  if (ext === '.avif') await image.avif({ quality: options.quality ?? 62, effort: 3 }).toFile(outputPath);
  else if (ext === '.webp') await image.webp({ quality: options.quality ?? 76 }).toFile(outputPath);
  else await image.png({ compressionLevel: 8 }).toFile(outputPath);
}

export async function normalizeSource(sourcePath: string, avifPath: string, webpPath: string) {
  await ensureDir(dirname(avifPath));
  await ensureDir(dirname(webpPath));
  const base = sharp(sourcePath, { limitInputPixels: MAX_DECODED_PIXELS }).resize(1600, 900, {
    fit: 'contain',
    background: { r: 8, g: 12, b: 18, alpha: 1 },
  });
  await base.clone().avif({ quality: 68, effort: 3 }).toFile(avifPath);
  await base.clone().webp({ quality: 78, alphaQuality: 90 }).toFile(webpPath);
}

export async function copyAsset(source: string, destination: string) {
  await ensureDir(dirname(destination));
  await copyFile(source, destination);
}

export async function makeContactSheet(paths: string[], outputPath: string) {
  await ensureDir(dirname(outputPath));
  const tiles = await Promise.all(
    paths.map(async (path) =>
      sharp(await readFile(path), { limitInputPixels: MAX_DECODED_PIXELS })
        .resize(640, 360, { fit: 'contain', background: '#080d14' })
        .png()
        .toBuffer(),
    ),
  );
  const canvas = sharp({
    create: { width: 1920, height: 720, channels: 4, background: '#060a10' },
  });
  await canvas
    .composite(tiles.map((input, i) => ({ input, left: (i % 3) * 640, top: Math.floor(i / 3) * 360 })))
    .jpeg({ quality: 88 })
    .toFile(outputPath);
}
