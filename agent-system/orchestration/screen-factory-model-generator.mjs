import { compactCompileScreenPacket, SCREEN_COMPOSITION_BATCH_POLICY } from './screen-factory-batch-composer.mjs';

export const SCREEN_GENERATOR_POLICY = 'OPENROUTER_COMPACT_BATCH_COMPOSITION_DSL_V1_FAIL_CLOSED';

// Screen Factory v4 generation intentionally delegates only composition/hierarchy to the model.
// HTML, CSS, state maps, evidence maps, bindings and interaction contracts are compiled locally
// from the canonical screen contract and the locked Dial Health component system.
export async function compileScreenPacket(options = {}) {
  const result = await compactCompileScreenPacket(options);
  return { ...result, policy: SCREEN_GENERATOR_POLICY, composition_policy: SCREEN_COMPOSITION_BATCH_POLICY };
}
