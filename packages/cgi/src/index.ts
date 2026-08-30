import { renderSvg } from '../../image-processing/src/index.js';
import type { VisualGenerationJob } from '../../contracts/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/scene.js';

export interface CgiGenerationInput { job: VisualGenerationJob; outputPath: string }
export interface CgiGenerationResult { provider: string; model: string; modelVersion: string; seed: number; promptProfile: string; outputPath: string }
export interface CgiGenerator { generate(input: CgiGenerationInput): Promise<CgiGenerationResult> }

export function assertDevelopmentFixture(job: VisualGenerationJob): void {
  const hilux = job.visualFamilyId === 'VF-TOYOTA-HILUX-AN130-DC-FL' && job.make === 'Toyota' && job.model === 'Hilux';
  const test = job.visualFamilyId === 'VF-TEST-PICKUP-DC' && job.make === 'Test' && job.model === 'Pickup';
  if (!job.developmentMode || (!hilux && !test)) {
    throw new Error('The development renderer only supports the isolated Hilux/test fixture. It cannot create vehicle-specific production transitions.');
  }
}

export class DeterministicDevelopmentCgiGenerator implements CgiGenerator {
  async generate(input: CgiGenerationInput): Promise<CgiGenerationResult> {
    assertDevelopmentFixture(input.job);
    await renderSvg(vehicleSceneSvg({ progress: 0.34, mode: 'cgi' }), input.outputPath);
    return { provider: 'deterministic-development', model: 'dial-vector-fixture', modelVersion: '1.0.0', seed: 1302020, promptProfile: 'cgi-identity-lock-v1', outputPath: input.outputPath };
  }
}

export class CredentialGatedCgiGenerator implements CgiGenerator {
  async generate(): Promise<CgiGenerationResult> {
    throw new Error('Production CGI adapter is not implemented. Credentials alone do not enable it; connect a vehicle-specific production renderer.');
  }
}
