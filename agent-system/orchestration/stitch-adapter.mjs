import { generateStitchScreen, stitchHealth } from './providers/google/stitch-adapter.mjs';

class GoogleStitchTransport {
  constructor({ env = process.env } = {}) { this.env = env; }
  async health() { return stitchHealth({ env: this.env }); }
  async generate(input = {}) {
    const prompt = String(input.prompt || input.design_prompt || '').trim();
    if (!prompt) throw new Error('STITCH_PROMPT_REQUIRED');
    return generateStitchScreen({
      title: input.project_title || 'DIAL governed design',
      prompt,
      deviceType: input.device_type || 'DESKTOP',
      env: this.env,
    });
  }
}

export class StitchAdapter {
  constructor({ transport = null, enabled = false, projectId = null, env = process.env } = {}) {
    this.transport = transport || new GoogleStitchTransport({ env });
    this.enabled = enabled;
    this.projectId = projectId;
  }

  async health() {
    if (!this.enabled) return { state: 'DISABLED' };
    if (typeof this.transport?.health !== 'function') return { state: 'UNAVAILABLE' };
    return this.transport.health();
  }
  async generate(input) {
    if (!this.enabled) throw new Error('STITCH_DISABLED');
    if (typeof this.transport?.generate !== 'function') throw new Error('STITCH_TRANSPORT_UNAVAILABLE');
    if (!input?.design_projection_hash) throw new Error('DESIGN_AUTHORITY_PROJECTION_REQUIRED');
    const result = await this.transport.generate({ ...input, project_id: this.projectId });
    return {
      ...result,
      design_projection_hash: input.design_projection_hash,
      provider_authority: 'NON_AUTHORITATIVE_DESIGN_PROVIDER',
      requires_dial_admission: true,
    };
  }
}

export { GoogleStitchTransport };
