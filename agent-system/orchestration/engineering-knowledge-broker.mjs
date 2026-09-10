import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoActiveWork } from './checkpoint-store.mjs';
import { resolveEngineeringSkills } from './skill-resolver.mjs';
import { activationSummary, loadSkillActivationForPacket, persistSkillActivation, verifySkillActivation } from './skill-activation-store.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, readJson } from './state-store.mjs';
import { loadEngineeringSkillRegistry, loadSkillConflictRegistry, validateEngineeringSkillRegistry } from './skill-registry.mjs';
import { resolveEngineeringResources } from './engineering-resource-resolver.mjs';
import { loadEngineeringResourceRegistry, loadEngineeringResourceSources, validateEngineeringResourceRegistries } from './engineering-resource-registry.mjs';
import { buildContextCapsules } from './context-capsule-builder.mjs';
import { checkDevelopmentUnitRegistry } from './development-unit-planner.mjs';
import { buildUnitKnowledgeMap } from './unit-knowledge-map-builder.mjs';
import { checkKnowledgeBinding, createExecutionKnowledgeBinding } from './knowledge-admission-guard.mjs';
import { findUnit, hashObject, projectTruthHash } from './knowledge-graph-core.mjs';
import { persistKnowledgeResolutionTrace } from './knowledge-resolution-trace.mjs';
import { buildWorkerKnowledgeDelivery } from './knowledge-worker-delivery.mjs';
import { checkKnowledgeExemption, persistKnowledgeExemption } from './knowledge-exemption.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const FEATURE_RE = /\b[A-Z][A-Z0-9_-]*-F\d{3}\b/;

function now() { return new Date().toISOString(); }

function resolveFeature({ repoDir, instruction, metadata }) {
  const explicit = String(metadata?.feature_id || instruction || '').match(FEATURE_RE)?.[0];
  if (explicit) return explicit;
  return loadRepoActiveWork(repoDir)?.feature_id ?? null;
}

export function resolvePacketEngineeringKnowledge({
  repoDir = DEFAULT_REPO,
  root = DEFAULT_CONTROL_HOME,
  packetId,
  instruction = '',
  metadata = {},
  previousActivationId = null,
  reResolutionReason = null,
} = {}) {
  ensureControlLayout(root);
  if (!packetId) throw new Error('packetId is required for VEKL resolution');
  const registryCheck = validateEngineeringSkillRegistry(repoDir);
  if (!registryCheck.ok) throw new Error(`VEKL skill registry invalid: ${registryCheck.failures.join('; ')}`);
  const resourceRegistryCheck = validateEngineeringResourceRegistries(repoDir);
  if (!resourceRegistryCheck.ok) throw new Error(`VEKL resource registry invalid: ${resourceRegistryCheck.failures.join('; ')}`);
  const featureId = resolveFeature({ repoDir, instruction, metadata });
  const affectedPaths = Array.isArray(metadata?.affected_paths) ? metadata.affected_paths : [];
  const skillPlan = resolveEngineeringSkills({ repoDir, featureId, instruction, affectedPaths, metadata });
  let featureRecord = null;
  if (featureId) {
    try {
      const rows = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/FEATURE_REGISTRY.json'), 'utf8'));
      featureRecord = Array.isArray(rows) ? rows.find((row) => row.feature_id === featureId) ?? null : null;
    } catch {}
  }
  const requestedExemption = String(metadata?.knowledge_exemption_archetype || '').trim() || null;
  const exemption = requestedExemption ? persistKnowledgeExemption({ repoDir, root, packetId, archetype: requestedExemption, featureId, affectedPaths, metadata }) : null;
  let unitMap = null;
  let graphResolution = null;
  let unitRecord = null;
  if (featureId && !exemption) {
    const unitRegistryCheck = checkDevelopmentUnitRegistry(repoDir);
    if (!unitRegistryCheck.ok) throw new Error(`VEKL Development Unit registry drift: expected ${unitRegistryCheck.expected_hash}, observed ${unitRegistryCheck.actual_hash || 'missing'}`);
    const mapped = buildUnitKnowledgeMap({ repoDir, root, featureId, instruction, affectedPaths, availableTools: metadata?.available_tools || [] });
    unitMap = mapped.map;
    graphResolution = mapped.graph;
    unitRecord = findUnit(repoDir, unitMap.unit_lineage_id);
  }
  const resourcePlan = exemption ? {
    policy_version: 'vekl-2.2-rev2', task_classes: skillPlan.task_classes || [], selected_resources: [], rejected: [], ranked_candidates: [],
    invariants: { explicit_knowledge_exemption: true, hard_eligibility_bypassed_only_by_policy: true },
  } : resolveEngineeringResources({
    repoDir, root, instruction, affectedPaths, featureRecord,
    maxResources: Number(metadata?.max_resources || 8),
    availableTools: metadata?.available_tools || [],
    eligibleResourceIds: graphResolution?.eligible_resource_ids || null,
    resourceBindingHints: graphResolution?.resource_binding_hints || {},
  });
  const knowledgeContext = unitMap ? {
    scope: 'DEVELOPMENT_UNIT',
    project_truth_hash: projectTruthHash(repoDir),
    feature_id: featureId,
    unit_lineage_id: unitMap.unit_lineage_id,
    unit_revision_hash: unitMap.unit_revision_hash,
    unit_map_hash: unitMap.map_hash,
    graph_generation_id: graphResolution.graph_generation_id,
    graph_revision_hash: graphResolution.graph_revision_hash,
    graph_neighbourhood_hash: graphResolution.graph_neighbourhood_hash,
    determinism_envelope_hash: graphResolution.determinism_envelope_hash,
    knowledge_route_policy_hash: graphResolution.knowledge_route_policy_hash,
    technical_stack_fingerprint: unitRecord?.technical_stack_fingerprint || null,
    contract_fingerprints: [...new Set([...(unitRecord?.contract_fingerprints || [])])].sort(),
    knowledge_readiness_state: unitMap.knowledge_readiness_state,
  } : exemption ? {
    scope: 'POLICY_EXEMPTION', project_truth_hash: projectTruthHash(repoDir), feature_id: featureId,
    knowledge_readiness_state: 'EXEMPT_BY_POLICY', knowledge_exemption: exemption.knowledge_exemption,
    exemption_hash: exemption.exemption_hash,
  } : {
    scope: 'UNSCOPED_PLANNING',
    feature_id: null,
    requires_feature_reresolution_before_material_work: true,
  };
  const unitAdmissible = !unitMap || ['READY', 'EXEMPT_BY_POLICY'].includes(unitMap.knowledge_readiness_state);
  const plan = {
    ...skillPlan,
    policy_version: (unitMap || exemption) ? 'vekl-2.2-rev2' : (resourcePlan.policy_version || 'vekl-2.1'),
    resolution_state: exemption ? 'EXEMPT_BY_POLICY' : (unitMap && !unitAdmissible ? `KNOWLEDGE_${unitMap.knowledge_readiness_state}` : skillPlan.resolution_state),
    execution_allowed: skillPlan.execution_allowed !== false && unitAdmissible,
    selected_resources: resourcePlan.selected_resources,
    resource_rejected: [...(resourcePlan.rejected || []), ...(graphResolution?.excluded || [])],
    resource_task_classes: resourcePlan.task_classes,
    ranked_candidates: graphResolution?.candidates || resourcePlan.ranked_candidates || [],
    withheld_challenge_resources: (graphResolution?.excluded || []).filter((x) => x.reason === 'OPEN_PROJECT_TRUTH_CHALLENGE_WITHHELD').map((x) => x.resource_id),
    research_forecast_id: readJson('knowledge/research/current-forecast.json', null, root)?.forecast_id ?? null,
    knowledge_context: knowledgeContext,
  };
  const manifest = persistSkillActivation({
    packetId,
    missionId: metadata?.mission_id ?? null,
    featureIds: featureId ? [featureId] : [],
    plan,
    root,
    previousActivationId,
    reResolutionReason,
  });
  if (unitMap && graphResolution) {
    const capsuleDelivery = buildContextCapsules({ root, packetId, unitMap, graphResolution, skillPlan: plan });
    createExecutionKnowledgeBinding({ repoDir, root, packetId, unitMap, graphResolution, activationManifest: manifest, capsuleDelivery });
    const workerDelivery = buildWorkerKnowledgeDelivery({ packetId, manifest, instruction, root });
    persistKnowledgeResolutionTrace({
      root, packetId, missionId: metadata?.mission_id ?? null, unitMap, graphResolution,
      skillPlan: plan, activationManifest: manifest, capsuleDelivery,
      workerDeliveryHash: workerDelivery.worker_delivery_hash,
      instructionHash: hashObject({ instruction: String(instruction || '') }),
    });
  }
  for (const rejected of plan.rejected || []) {
    if (String(rejected.reason || '').startsWith('CONFLICT:')) {
      appendJsonl('events/engineering-knowledge.jsonl', { event: 'SKILL_CONFLICT_DETECTED', packet_id: packetId, feature_id: featureId, activation_id: manifest.activation_id, skill_id: rejected.skill_id, conflict_id: rejected.conflict?.conflict_id ?? String(rejected.reason).slice('CONFLICT:'.length), reason: rejected.conflict?.reason ?? rejected.reason, at: now() }, root);
    } else if (String(rejected.reason || '').startsWith('NOT_APPROVED:')) {
      appendJsonl('events/engineering-knowledge.jsonl', { event: 'SKILL_UNAVAILABLE', packet_id: packetId, feature_id: featureId, activation_id: manifest.activation_id, skill_id: rejected.skill_id, reason: rejected.reason, at: now() }, root);
    }
  }
  appendJsonl('events/engineering-knowledge.jsonl', {
    event: manifest.execution_allowed === false ? 'ENGINEERING_KNOWLEDGE_RESOLUTION_BLOCKED' : 'ENGINEERING_KNOWLEDGE_RESOLUTION_GATE_PASSED', packet_id: packetId,
    feature_id: featureId, activation_id: manifest.activation_id, resolution_state: manifest.resolution_state,
    selected_skill_count: manifest.skills.length, selected_resource_count: (manifest.resources || []).length, missing_mandatory_task_classes: manifest.missing_mandatory_task_classes || [], policy_version: manifest.policy_version, at: now(),
  }, root);
  return manifest;
}

export function ensurePacketEngineeringKnowledge({ repoDir = DEFAULT_REPO, root = DEFAULT_CONTROL_HOME, packetId, instruction = '', metadata = {} } = {}) {
  const current = loadSkillActivationForPacket(packetId, root);
  if (current) {
    const check = verifySkillActivation(current, root, repoDir);
    if (!check.ok) throw new Error(`VEKL activation invalid for packet ${packetId}: ${check.failures.join('; ')}`);
    if (current.knowledge_context?.unit_lineage_id) {
      const admission = checkKnowledgeBinding({ repoDir, root, packetId });
      if (!admission.ok) throw new Error(`VEKL stale knowledge binding for packet ${packetId}: ${admission.reasons.join('; ')}`);
    } else if (current.knowledge_context?.scope === 'POLICY_EXEMPTION') {
      const exemptionCheck = checkKnowledgeExemption({ repoDir, root, packetId });
      if (!exemptionCheck.ok) throw new Error(`VEKL stale knowledge exemption for packet ${packetId}: ${exemptionCheck.reasons.join('; ')}`);
    }
    return current;
  }
  return resolvePacketEngineeringKnowledge({ repoDir, root, packetId, instruction, metadata });
}

export function reResolvePacketEngineeringKnowledge({ repoDir = DEFAULT_REPO, root = DEFAULT_CONTROL_HOME, packetId, instruction, metadata = {}, reason } = {}) {
  const previous = loadSkillActivationForPacket(packetId, root);
  const why = String(reason || '').trim();
  if (!why) throw new Error('audited VEKL re-resolution requires a reason');
  return resolvePacketEngineeringKnowledge({ repoDir, root, packetId, instruction, metadata, previousActivationId: previous?.activation_id ?? null, reResolutionReason: why });
}

export function engineeringKnowledgeStatus({ repoDir = DEFAULT_REPO, root = DEFAULT_CONTROL_HOME, packetId = null } = {}) {
  const registry = loadEngineeringSkillRegistry(repoDir);
  const resourceRegistry = loadEngineeringResourceRegistry(repoDir);
  const sourceRegistry = loadEngineeringResourceSources(repoDir);
  const conflicts = loadSkillConflictRegistry(repoDir);
  const active = packetId ? loadSkillActivationForPacket(packetId, root) : (() => {
    const mission = readJson('state/active-mission.json', null, root);
    const missionRecord = mission?.mission_id ? readJson(`missions/${mission.mission_id}.json`, null, root) : null;
    return missionRecord?.last_packet_id ? loadSkillActivationForPacket(missionRecord.last_packet_id, root) : null;
  })();
  return {
    policy_version: 'vekl-2.2-rev2',
    authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
    registry: {
      total: registry.length,
      approved: registry.filter((r) => ['APPROVED', 'ACTIVE'].includes(r.approval_state)).length,
      discovered_or_qualifying: registry.filter((r) => !['APPROVED', 'ACTIVE', 'REVOKED', 'DEPRECATED', 'SUPERSEDED'].includes(r.approval_state)).length,
      revoked: registry.filter((r) => r.approval_state === 'REVOKED').length,
    },
    resources: { total: resourceRegistry.length, sources: sourceRegistry.length, reference_approved: resourceRegistry.filter((r) => ['REFERENCE_APPROVED','DISCOVERY_APPROVED','POLICY_APPROVED_CONDITIONAL','APPROVED','ACTIVE'].includes(r.status)).length },
    conflicts: conflicts.length,
    ahead_of_work_research: readJson('knowledge/research/current-forecast.json', null, root),
    active_activation: activationSummary(active),
  };
}

export function loadSkillRegistryRecord(skillId, repoDir = DEFAULT_REPO) {
  return loadEngineeringSkillRegistry(repoDir).find((r) => r.skill_id === skillId) ?? null;
}

export function readSkillSnapshotBody(skillId, { repoDir = DEFAULT_REPO, root = DEFAULT_CONTROL_HOME } = {}) {
  const record = loadSkillRegistryRecord(skillId, repoDir);
  if (!record) throw new Error(`unknown skill: ${skillId}`);
  if (!['APPROVED', 'ACTIVE'].includes(record.approval_state)) return { ...record, body: null, reason: `NOT_APPROVED:${record.approval_state}` };
  const target = path.resolve(root, record.snapshot_rel);
  const vendor = path.resolve(root, 'knowledge/vendor');
  if (!target.startsWith(`${vendor}${path.sep}`)) throw new Error('snapshot outside DIAL vendor root');
  const body = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8');
  return { ...record, body };
}
