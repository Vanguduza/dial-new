import { runPipeline, type RunOptions } from '../../../packages/pipeline-core/src/index.js';
export async function processVisualGenerationJob(jobPath: string, options: RunOptions = {}) { return runPipeline(jobPath, options); }
