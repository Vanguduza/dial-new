import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import type { z } from "zod";
import type { assetSchema } from "./contracts.js";

export const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export function confine(root: string, file: string) {
  if (isAbsolute(file) || /^[a-z]+:/i.test(file) || file.includes("\\") || file.split("/").some((part) => part === ".." || part === "")) throw new Error("Only confined relative asset paths are allowed");
  const path = resolve(root, file);
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Path escapes its asset root");
  return path;
}
export async function confinedExisting(root: string, file: string) {
  const canonicalRoot = await realpath(root);
  const path = await realpath(confine(canonicalRoot, file));
  const rel = relative(canonicalRoot, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Symlink escapes its asset root");
  return path;
}
export async function readAsset(root: string, asset: z.infer<typeof assetSchema>) {
  const bytes = await readFile(await confinedExisting(root, asset.file));
  if (digest(bytes) !== asset.sha256) throw new Error(`Checksum mismatch: ${asset.file}`);
  return bytes;
}

export async function makeConfinedDirectory(root: string, file: string) {
  const canonicalRoot = await realpath(root), target = confine(canonicalRoot, file);
  let parent = target;
  for (;;) {
    try {
      const actual = await realpath(parent), rel = relative(canonicalRoot, actual);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("Directory junction escapes its output root");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      parent = dirname(parent);
    }
  }
  await mkdir(target, { recursive: true });
  return target;
}

export interface Raster { pixels: Buffer; width: number; height: number }
export interface Bounds { x: number; y: number; width: number; height: number }
export async function decodeRgba(bytes: Buffer): Promise<Raster> {
  const image = sharp(bytes, { limitInputPixels: 20_000_000 });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp", "avif", "heif"].includes(metadata.format ?? "")) throw new Error("Only raster images are supported");
  if ((metadata.pages ?? 1) > 1) throw new Error("Animated/multipage sources are not supported");
  if (metadata.orientation && metadata.orientation !== 1) throw new Error("Normalize EXIF orientation before registering the scene");
  const { data, info } = await image.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { pixels: data, width: info.width, height: info.height };
}
export function alphaBounds(raster: Raster, threshold = 24): Bounds | null {
  let minX = raster.width, minY = raster.height, maxX = -1, maxY = -1;
  for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
    if (raster.pixels[(y * raster.width + x) * 4 + 3] < threshold) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
export function cropRaster(raster: Raster, bounds: Bounds): Raster {
  const pixels = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const offset = ((bounds.y + y) * raster.width + bounds.x) * 4;
    raster.pixels.copy(pixels, y * bounds.width * 4, offset, offset + bounds.width * 4);
  }
  return { pixels, width: bounds.width, height: bounds.height };
}
export async function encodePng(raster: Raster) {
  return sharp(raster.pixels, { raw: { width: raster.width, height: raster.height, channels: 4 } }).png().toBuffer();
}
