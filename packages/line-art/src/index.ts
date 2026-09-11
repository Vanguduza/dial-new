import { writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ensureDir } from '../../pipeline-core/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/index.js';

// Every sibling generator (renderSvg, generateDepthMap, generateFrameProfile)
// creates its parent directory before writing. This one did not, so it threw
// ENOENT for any output path whose directory did not already exist - it only
// ever worked because an earlier pipeline stage happened to create the
// directory first. Found by the first test this package ever had.
export async function generateLineArt(outputPath: string) {
  await ensureDir(dirname(outputPath));
  await writeFile(outputPath, vehicleSceneSvg({ progress: 0.6, mode: 'line' }), 'utf8');
  return outputPath;
}
