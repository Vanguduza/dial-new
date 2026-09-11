// Covers the six packages that no test imported: image-processing, packaging,
// technical-render, animation, depth and line-art.
//
// These are small, but image-processing/validateImage and
// packaging/publishPreviewPack are the two places where a malformed input or a
// bad destination does real damage - a polyglot file reaching the decoder, or a
// recursive delete aimed at the wrong directory. Their source comments describe
// defects that were already fixed once; without tests nothing stops them coming
// back. The rest assert the contracts their callers rely on.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { renderSvg, validateImage } from '../packages/image-processing/src/index.js';
import { buildAssetManifest, publishPreviewPack } from '../packages/packaging/src/index.js';
import { vehicleSceneSvg } from '../packages/technical-render/src/index.js';
import { generateFrameProfile } from '../packages/animation/src/index.js';
import { generateDepthMap } from '../packages/depth/src/index.js';
import { generateLineArt } from '../packages/line-art/src/index.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dial-media-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const png = async (path: string, width = 1600, height = 900) => {
  await sharp({ create: { width, height, channels: 3, background: '#101418' } })
    .png()
    .toFile(path);
  return path;
};

describe('image-processing / validateImage', () => {
  it('accepts a real raster reference', async () => {
    const path = await png(join(dir, 'ok.png'));
    await expect(validateImage(path, false)).resolves.toBeUndefined();
  });

  it('rejects a file whose content does not match its extension', async () => {
    // A JPEG renamed .png. Extension-only allowlisting passed this, which is
    // exactly the polyglot the magic-byte check exists to stop.
    const jpeg = join(dir, 'real.jpg');
    await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#222' } })
      .jpeg()
      .toFile(jpeg);
    const disguised = join(dir, 'disguised.png');
    await writeFile(disguised, await readFile(jpeg));
    await expect(validateImage(disguised, false)).rejects.toThrow(/content is jpeg but the extension declares png/i);
  });

  it('rejects content that is not an image at all', async () => {
    const path = join(dir, 'not-an-image.png');
    // An MZ header: a DOS/PE executable, not any allowlisted image format.
    // Built from bytes rather than written as a literal so this source file
    // stays pure text - an embedded NUL makes git treat it as binary.
    await writeFile(path, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2), Buffer.from(' not a picture')]));
    await expect(validateImage(path, false)).rejects.toThrow(/not a supported image format/i);
  });

  it('rejects an unsupported extension', async () => {
    const path = join(dir, 'reference.tiff');
    await writeFile(path, 'anything');
    await expect(validateImage(path, false)).rejects.toThrow(/Unsupported source type/i);
  });

  it('rejects an empty file', async () => {
    const path = join(dir, 'empty.png');
    await writeFile(path, '');
    await expect(validateImage(path, false)).rejects.toThrow(/size is invalid/i);
  });

  it('rejects a directory', async () => {
    const path = join(dir, 'a-directory.png');
    await mkdir(path, { recursive: true });
    await expect(validateImage(path, false)).rejects.toThrow(/not a file/i);
  });

  it('rejects an image too small to be a usable reference', async () => {
    const path = await png(join(dir, 'tiny.png'), 64, 64);
    await expect(validateImage(path, false)).rejects.toThrow(/too small/i);
  });

  describe('SVG is development-only and must stay inert', () => {
    const svg = (body: string) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">${body}</svg>`;

    it('refuses SVG outside development mode', async () => {
      const path = join(dir, 'fixture.svg');
      await writeFile(path, svg('<rect width="1600" height="900"/>'));
      await expect(validateImage(path, false)).rejects.toThrow(/permitted only in development mode/i);
    });

    it('accepts an inert SVG in development mode', async () => {
      const path = join(dir, 'inert.svg');
      await writeFile(path, svg('<rect width="1600" height="900" fill="#123"/>'));
      await expect(validateImage(path, true)).resolves.toBeUndefined();
    });

    it('refuses an SVG declaring external entities', async () => {
      const path = join(dir, 'xxe.svg');
      await writeFile(
        path,
        '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg('<text>&x;</text>'),
      );
      await expect(validateImage(path, true)).rejects.toThrow(/external entities or references/i);
    });

    it('refuses an SVG carrying script content', async () => {
      const path = join(dir, 'scripted.svg');
      await writeFile(path, svg('<script>fetch("https://example.invalid")</script>'));
      await expect(validateImage(path, true)).rejects.toThrow(/script content/i);
    });

    it('refuses an SVG carrying an inline event handler', async () => {
      const path = join(dir, 'handler.svg');
      await writeFile(path, svg('<rect width="10" height="10" onload="alert(1)"/>'));
      await expect(validateImage(path, true)).rejects.toThrow(/script content/i);
    });
  });
});

describe('image-processing / renderSvg', () => {
  it('creates missing parent directories and honours the requested size', async () => {
    const out = join(dir, 'nested', 'deeper', 'frame.png');
    await renderSvg(vehicleSceneSvg({ progress: 0.5 }), out, { width: 640, height: 360 });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(360);
  });

  it('picks the encoder from the output extension', async () => {
    const avif = join(dir, 'frame.avif');
    await renderSvg(vehicleSceneSvg({ progress: 0.2 }), avif, { width: 320, height: 180 });
    expect((await sharp(avif).metadata()).format).toBe('heif');
  });

  it('writes a bare filename without throwing on an empty dirname', async () => {
    const out = join(dir, 'bare.png');
    await expect(renderSvg(vehicleSceneSvg({ progress: 0.1 }), out)).resolves.toBeUndefined();
    expect((await stat(out)).size).toBeGreaterThan(0);
  });
});

describe('technical-render / vehicleSceneSvg', () => {
  it('is deterministic for identical inputs', () => {
    expect(vehicleSceneSvg({ progress: 0.4, mode: 'cgi' })).toBe(vehicleSceneSvg({ progress: 0.4, mode: 'cgi' }));
  });

  it('renders a different scene per mode and per progress', () => {
    expect(vehicleSceneSvg({ progress: 0.4, mode: 'cgi' })).not.toBe(vehicleSceneSvg({ progress: 0.4, mode: 'line' }));
    expect(vehicleSceneSvg({ progress: 0.1 })).not.toBe(vehicleSceneSvg({ progress: 0.9 }));
  });

  it('clamps progress outside 0..1 to the endpoints', () => {
    expect(vehicleSceneSvg({ progress: -5 })).toBe(vehicleSceneSvg({ progress: 0 }));
    expect(vehicleSceneSvg({ progress: 5 })).toBe(vehicleSceneSvg({ progress: 1 }));
  });

  it('emits a well-formed SVG at the requested dimensions', () => {
    const svg = vehicleSceneSvg({ progress: 0.5, width: 800, height: 450 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('width="800"');
  });
});

describe('animation / generateFrameProfile', () => {
  it('rejects an unknown motion profile instead of silently using a default', async () => {
    await expect(generateFrameProfile(join(dir, 'anim-bad'), 'mobile', 'no-such-profile')).rejects.toThrow(
      /Unknown motion profile/i,
    );
  });

  // 48 AVIF encodes is real work; the default 5s budget is not enough.
  it('writes every declared frame and a manifest that matches them', { timeout: 120_000 }, async () => {
    const root = join(dir, 'anim');
    const manifest = await generateFrameProfile(root, 'mobile');
    expect(manifest.frameCount).toBe(48);
    expect(manifest.frames).toHaveLength(48);
    expect(manifest.poster).toBe(manifest.frames[0]);
    expect(manifest.width).toBe(960);
    expect(manifest.format).toBe('avif');

    // Frame paths are pack-relative and every one must actually exist.
    for (const frame of manifest.frames) expect(frame.startsWith('frames/')).toBe(true);
    for (const frame of [manifest.frames[0], manifest.frames.at(-1)!]) {
      expect((await stat(join(root, frame))).size).toBeGreaterThan(0);
    }

    const onDisk = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    expect(onDisk.frames).toEqual(manifest.frames);
  });
});

describe('depth / generateDepthMap', () => {
  it('returns pack-relative paths, never an absolute build-machine path', async () => {
    // An absolute path here put the build machine's filesystem into a committed
    // artifact and made identical inputs produce different packs.
    const out = join(dir, 'depth', 'depth-map.png');
    const result = await generateDepthMap(out);
    for (const value of [result.depthMap, result.foregroundMask, result.backgroundMask]) {
      expect(value.startsWith('/')).toBe(false);
      expect(value).not.toContain(dir);
    }
    expect(result.depthMap).toBe('analysis/depth-map.png');
    expect(result.provider).toBe('deterministic-development');
    expect((await stat(out)).size).toBeGreaterThan(0);
  });
});

describe('line-art / generateLineArt', () => {
  it('writes line-mode SVG to the requested path', async () => {
    const out = join(dir, 'line', 'line-art.svg');
    expect(await generateLineArt(out)).toBe(out);
    const svg = await readFile(out, 'utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toBe(vehicleSceneSvg({ progress: 0.6, mode: 'line' }));
  });
});

describe('packaging / buildAssetManifest', () => {
  it('hashes every file, sorts by path, and skips .dvtg', async () => {
    const root = join(dir, 'pack');
    await mkdir(join(root, 'hero'), { recursive: true });
    await mkdir(join(root, '.dvtg'), { recursive: true });
    await writeFile(join(root, 'hero', 'b.txt'), 'bbb');
    await writeFile(join(root, 'a.txt'), 'a');
    await writeFile(join(root, '.dvtg', 'state.json'), '{}');

    const manifest = await buildAssetManifest(root);
    const paths = manifest.assets.map((a) => a.path);
    expect(paths).toContain('a.txt');
    expect(paths).toContain('hero/b.txt');
    expect(paths.some((p) => p.startsWith('.dvtg'))).toBe(false);
    expect(paths).toEqual([...paths].sort());
    for (const asset of manifest.assets) expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.assets.find((a) => a.path === 'a.txt')?.bytes).toBe(1);
  });

  it('does not follow symlinks out of the pack', async () => {
    // stat() followed links, so a symlinked directory either published files
    // from outside the pack or recursed into an ancestor until memory ran out.
    const outside = join(dir, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.txt'), 'not part of the pack');

    const root = join(dir, 'pack-with-link');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'real.txt'), 'real');
    await symlink(outside, join(root, 'linked'), 'dir');
    await symlink(root, join(root, 'self'), 'dir');

    const manifest = await buildAssetManifest(root);
    const paths = manifest.assets.map((a) => a.path);
    expect(paths).toContain('real.txt');
    expect(paths.some((p) => p.includes('secret.txt'))).toBe(false);
    expect(paths.some((p) => p.startsWith('self/'))).toBe(false);
  });
});

describe('packaging / publishPreviewPack', () => {
  const source = () => join(dir, 'src-pack');

  beforeAll(async () => {
    await mkdir(join(source(), 'hero'), { recursive: true });
    await writeFile(join(source(), 'meta.json'), '{"ok":true}');
    await writeFile(join(source(), 'hero', 'hero.txt'), 'hero');
    await writeFile(join(source(), 'not-allowed.txt'), 'should not be published');
  });

  it('refuses a destination outside public/packs', async () => {
    await expect(publishPreviewPack(source(), join(dir, 'anywhere', 'VF-X'))).rejects.toThrow(
      /must be inside public\/packs/i,
    );
  });

  it('refuses a path that merely contains the words, rather than the real segments', async () => {
    await expect(publishPreviewPack(source(), join(dir, 'publicpacks', 'VF-X'))).rejects.toThrow(
      /must be inside public\/packs/i,
    );
  });

  it('refuses the packs root itself, which it would recursively delete', async () => {
    await expect(publishPreviewPack(source(), join(dir, 'public', 'packs'))).rejects.toThrow(
      /must name a visual family directory/i,
    );
  });

  it('publishes only the allowlisted pack members and writes a manifest', async () => {
    const target = join(dir, 'public', 'packs', 'VF-TEST');
    await publishPreviewPack(source(), target);
    const manifest = JSON.parse(await readFile(join(target, 'asset-manifest.json'), 'utf8'));
    const paths = manifest.assets.map((a: { path: string }) => a.path);
    expect(paths).toContain('meta.json');
    expect(paths).toContain('hero/hero.txt');
    expect(paths.some((p: string) => p.includes('not-allowed'))).toBe(false);
  });

  it('replaces prior contents rather than merging into them', async () => {
    const target = join(dir, 'public', 'packs', 'VF-REPLACE');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'stale.txt'), 'from a previous publish');
    await publishPreviewPack(source(), target);
    await expect(stat(join(target, 'stale.txt'))).rejects.toThrow();
    expect((await stat(join(target, 'meta.json'))).size).toBeGreaterThan(0);
  });
});
