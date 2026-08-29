import { renderSvg } from '../../image-processing/src/index.js';
import type { VisualGenerationJob } from '../../contracts/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/scene.js';

export interface CgiGenerationInput { job: VisualGenerationJob; outputPath: string }
export interface CgiGenerationResult { provider: string; model: string; modelVersion: string; seed: number; promptProfile: string; outputPath: string }
export interface CgiGenerator { generate(input: CgiGenerationInput): Promise<CgiGenerationResult> }

export class DeterministicDevelopmentCgiGenerator implements CgiGenerator {
  async generate(input: CgiGenerationInput): Promise<CgiGenerationResult> {
    await renderSvg(vehicleSceneSvg({ progress: 0.34, mode: 'cgi' }), input.outputPath);
    return { provider: 'deterministic-development', model: 'dial-vector-fixture', modelVersion: '1.0.0', seed: 1302020, promptProfile: 'cgi-identity-lock-v1', outputPath: input.outputPath };
  }
}

export class CredentialGatedCgiGenerator implements CgiGenerator {
  async generate(): Promise<CgiGenerationResult> {
    throw new Error('Live CGI generation requires DVTG_CGI_PROVIDER and provider credentials');
  }
}
