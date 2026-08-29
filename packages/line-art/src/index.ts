import { writeFile } from 'node:fs/promises';
import { vehicleSceneSvg } from '../../technical-render/src/scene.js';
export async function generateLineArt(outputPath: string) { await writeFile(outputPath, vehicleSceneSvg({ progress: .60, mode: 'line' }), 'utf8'); return outputPath; }
