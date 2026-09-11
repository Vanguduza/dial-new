import { join } from 'node:path';
import { MOTION_PROFILES } from '../../contracts/src/index.js';
import { ensureDir, writeJsonAtomic } from '../../pipeline-core/src/index.js';
import { renderSvg } from '../../image-processing/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/index.js';

export async function generateFrameProfile(root: string, profile: 'desktop' | 'mobile', motionProfile = 'premium-v1') {
  const config = MOTION_PROFILES[motionProfile as keyof typeof MOTION_PROFILES];
  if (!config) throw new Error(`Unknown motion profile: ${motionProfile}`);
  const frameCount = profile === 'desktop' ? config.desktopFrames : config.mobileFrames;
  const width = profile === 'desktop' ? 1600 : 960;
  const height = profile === 'desktop' ? 900 : 540;
  const frameRoot = join(root, 'frames');
  await ensureDir(frameRoot);
  const frames: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const name = `${String(i + 1).padStart(4, '0')}.avif`;
    await renderSvg(vehicleSceneSvg({ progress: i / (frameCount - 1) }), join(frameRoot, name), { width, height, quality: profile === 'desktop' ? 58 : 52 });
    frames.push(`frames/${name}`);
  }
  const manifest = { profile, motionProfile, motionVersion: config.version, fps: 30, frameCount, width, height, format: 'avif', frames, poster: frames[0], segments: config.segments };
  await writeJsonAtomic(join(root, 'manifest.json'), manifest);
  return manifest;
}
