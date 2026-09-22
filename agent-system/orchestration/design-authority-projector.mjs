import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const ANTI_PATTERN_REL = 'agent-system/registries/DESIGN_ANTI_PATTERN_REGISTRY.json';

// Provenance describes whether DIAL is designing natively, designing natively with
// non-authoritative external-reference inspiration, or repairing a locked baseline.
// External repositories never create a port/preserve mode under DEC-039.
export const DESIGN_PROVENANCE_MODES = Object.freeze(['NEW_DIAL_DESIGN', 'REFERENCE_INSPIRED_DIAL_NATIVE', 'LOCKED_BASELINE_REPAIR']);
export const LEGACY_DESIGN_PROVENANCE_ALIASES = Object.freeze({ DONOR_ADAPT: 'REFERENCE_INSPIRED_DIAL_NATIVE', DONOR_PRESERVE: 'REFERENCE_INSPIRED_DIAL_NATIVE' });
function canonicalDesignMode(mode){ return LEGACY_DESIGN_PROVENANCE_ALIASES[mode] || mode; }
export const DESIGN_ITERATION_PHASES = Object.freeze(['EXPLORE', 'CONVERGE', 'RECONSTRUCT']);

// The baseline six. Kept as a literal as well as in the registry: the registry
// may add, and a gate proves it never removes, but the projector must still
// emit these if the registry file is ever unreadable.
export const ENFORCED_BASELINE_PATTERNS = Object.freeze(['FAKE_DATA', 'PLACEHOLDER_HELPER_TEXT', 'DEAD_CONTROLS', 'GENERIC_AI_UI', 'DONOR_BRAND_AUTHORITY', 'RAW_TECHNICAL_IDS']);

export function loadDesignAntiPatterns(repoDir = DEFAULT_REPO) {
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(repoDir, ANTI_PATTERN_REL), 'utf8'));
    const baseline = (registry.enforced_baseline || []).map((x) => x.pattern_id);
    const additional = (registry.guided_additional || []).map((x) => x.pattern_id);
    const missing = ENFORCED_BASELINE_PATTERNS.filter((x) => !baseline.includes(x));
    if (missing.length) throw new Error(`DESIGN_ANTI_PATTERN_REGISTRY dropped enforced patterns: ${missing.join(', ')}`);
    return {
      registry_version: registry.registry_version,
      enforced_baseline: baseline,
      guided_additional: additional,
      severity_by_pattern: Object.fromEntries([...(registry.enforced_baseline || []), ...(registry.guided_additional || [])].map((x) => [x.pattern_id, x.severity])),
      blocking_severities: registry.blocking_severities || ['BLOCKING'],
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      registry_version: null,
      enforced_baseline: [...ENFORCED_BASELINE_PATTERNS],
      guided_additional: [],
      severity_by_pattern: Object.fromEntries(ENFORCED_BASELINE_PATTERNS.map((x) => [x, 'BLOCKING'])),
      blocking_severities: ['BLOCKING'],
    };
  }
}

export function projectDesignAuthority({
  unitMap,
  designMode = 'NEW_DIAL_DESIGN',
  lockedBaseline = null,
  donorTransformationHash = null,
  // Guided-generation inputs. When `designIterationPhase` is null the projection
  // is byte-identical to the pre-guided one, so existing packets, stored hashes
  // and donor checks are untouched.
  designIterationPhase = null,
  repoDir = DEFAULT_REPO,
} = {}) {
  if (!unitMap?.product_experience_map?.applicable) throw new Error('Product Experience knowledge required for design projection');
  const canonicalMode = canonicalDesignMode(designMode);
  if (!DESIGN_PROVENANCE_MODES.includes(canonicalMode)) throw new Error(`unknown design provenance mode: ${designMode}`);
  if (designIterationPhase !== null && !DESIGN_ITERATION_PHASES.includes(designIterationPhase)) {
    throw new Error(`unknown design iteration phase: ${designIterationPhase}`);
  }
  const base = {
    schema_version: 1,
    unit_lineage_id: unitMap.unit_lineage_id,
    unit_revision_hash: unitMap.unit_revision_hash,
    authority_refs: unitMap.product_experience_map.design_authorities || unitMap.design_authorities || [],
    product_experience_knowledge_hash: unitMap.product_experience_map.knowledge_hash,
    design_mode: canonicalMode,
    legacy_design_mode_input: canonicalMode === designMode ? null : designMode,
    locked_baseline: lockedBaseline,
    external_reference_context_hash: donorTransformationHash,
    donor_transformation_hash: null,
    prohibited_patterns: [...ENFORCED_BASELINE_PATTERNS],
    authority: 'DERIVED_DESIGN_PROJECTION',
  };
  if (designIterationPhase === null) return { ...base, projection_hash: hashObject(base) };

  const antiPatterns = loadDesignAntiPatterns(repoDir);
  const guided = {
    ...base,
    design_provenance_mode: canonicalMode,
    design_iteration_phase: designIterationPhase,
    prohibited_patterns: antiPatterns.enforced_baseline,
    guided_prohibited_patterns: antiPatterns.guided_additional,
    anti_pattern_registry_version: antiPatterns.registry_version,
  };
  return { ...guided, projection_hash: hashObject(guided) };
}

export function renderDesignMarkdown(p) {
  const lines = [
    `# DIAL Design Authority Projection`,
    `Generated projection — not design authority.`,
    `Unit: ${p.unit_lineage_id}@${p.unit_revision_hash}`,
    `Projection: ${p.projection_hash}`,
    `Mode: ${p.design_mode}`,
    `Product Experience: ${p.product_experience_knowledge_hash}`,
    `Prohibited: ${(p.prohibited_patterns || []).join(', ')}`,
  ];
  if (p.design_iteration_phase) {
    lines.splice(5, 0, `Iteration phase: ${p.design_iteration_phase}`);
    lines.push(`Guided prohibited: ${(p.guided_prohibited_patterns || []).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
