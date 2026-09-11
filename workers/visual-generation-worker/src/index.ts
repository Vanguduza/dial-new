import type { RunOptions } from '../../../packages/pipeline-core/src/index.js';
import { generateVehicle } from '../../../packages/pipeline-core/src/index.js';
export async function processVisualGenerationJob(jobPath: string, options: RunOptions = {}) { return generateVehicle(jobPath, options); }
