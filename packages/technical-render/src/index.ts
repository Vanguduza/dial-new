import { renderSvg } from '../../image-processing/src/index.js';
import { vehicleSceneSvg } from './scene.js';

// Entry-point facade: cross-package consumers import these from the package
// root, never from its internal modules. agent:boundary-check enforces that.
export { vehicleSceneSvg } from './scene.js';

export interface TechnicalRenderer { generate(outputPath: string): Promise<{ outputPath: string; renderer: string }> }
export class DeterministicTechnicalRenderer implements TechnicalRenderer {
  async generate(outputPath: string) { await renderSvg(vehicleSceneSvg({ progress: .47, mode: 'technical' }), outputPath); return { outputPath, renderer: 'dial-vector-fixture@1' }; }
}
