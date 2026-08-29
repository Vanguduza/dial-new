import { renderSvg } from '../../image-processing/src/index.js';
import { vehicleSceneSvg } from '../../technical-render/src/scene.js';

export async function generateDepthMap(outputPath: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><radialGradient id="d"><stop stop-color="#fff"/><stop offset=".55" stop-color="#777"/><stop offset="1"/></radialGradient></defs><rect width="1600" height="900" fill="#080808"/><ellipse cx="800" cy="520" rx="590" ry="260" fill="url(#d)"/><circle cx="438" cy="606" r="92" fill="#ddd"/><circle cx="1160" cy="606" r="92" fill="#eee"/></svg>`;
  await renderSvg(svg, outputPath);
  return { depthMap: outputPath, foregroundMask: 'analysis/segmentation/body.png', backgroundMask: 'analysis/segmentation/background.png', provider: 'deterministic-development' };
}

export async function generateDepthActivated(outputPath: string) { await renderSvg(vehicleSceneSvg({ progress: .2, mode: 'depth' }), outputPath); return outputPath; }
