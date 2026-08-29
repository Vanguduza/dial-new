import { renderSvg } from '../../image-processing/src/index.js';
import { vehicleSceneSvg } from './scene.js';

export interface TechnicalRenderer { generate(outputPath: string): Promise<{ outputPath: string; renderer: string }> }
export class DeterministicTechnicalRenderer implements TechnicalRenderer {
  async generate(outputPath: string) { await renderSvg(vehicleSceneSvg({ progress: .47, mode: 'technical' }), outputPath); return { outputPath, renderer: 'dial-vector-fixture@1' }; }
}
