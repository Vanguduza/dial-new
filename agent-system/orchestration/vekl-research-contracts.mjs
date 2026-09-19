import crypto from 'node:crypto';

export const RESEARCH_DIMENSIONS = Object.freeze([
  'TECHNOLOGY','REPOSITORY','ARCHITECTURE','SECURITY','UX','FRONTEND',
  'FAILURE_MODES','OPERABILITY','TESTING','PERFORMANCE','DEPLOYMENT',
  'INTEGRATION','SOURCES','CONTRADICTIONS','ANTI_PATTERNS','OFFICIAL_DOCS','DONORS',
]);
export const COVERAGE_STATUSES = Object.freeze([
  'NOT_STARTED','RUNNING','SOURCE_READY','SYNTHESIZED','VERIFIED','ADMITTED',
  'NOT_APPLICABLE','DEFERRED_WITH_REASON','FAILED_RETRYABLE','FAILED_BLOCKING',
]);
export const RESEARCH_POLARITIES = Object.freeze([
  'POSITIVE','ANTI_PATTERN','CAUTION','ALTERNATIVE','DEPRECATED','SECURITY_WARNING',
]);
export const RESEARCH_SCHEMAS = Object.freeze({
  ResearchCoverageManifest: { schema_version: 1, required: ['repository_sha','project_truth_fingerprint','graph_generation_id','graph_revision_hash','du_inventory','feature_registry_hash','frc_hash','security_hash','product_experience_hash','units'] },
  ResearchMission: { schema_version: 1, required: ['mission_id','repository_sha','project_truth_hash','model_id','data_class','required_roles','provider_binding','source_requirements','prohibited_data_classes','retry_policy'] },
  ResearchArtifact: { schema_version: 1, required: ['artifact_id','mission_id','provider','model_id','request_hash','source_hash','response_hash','claims','sources','data_class','egress','validation','verification','admission'] },
  SharedResearchArtifact: { schema_version: 1, required: ['shared_artifact_id','artifact_hash','applicability','claims','sources','versions','freshness','invalidation'] },
});

const SHA = /^[a-f0-9]{64}$/;
const nonempty = (v) => typeof v === 'string' && v.length > 0;
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

export function validateResearchContract(kind, value) {
  const schema = RESEARCH_SCHEMAS[kind];
  if (!schema) return { ok: false, errors: [`UNKNOWN_SCHEMA:${kind}`] };
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push('OBJECT_REQUIRED');
  if (value?.schema_version !== schema.schema_version) errors.push('SCHEMA_VERSION_INVALID');
  for (const field of schema.required) if (value?.[field] == null) errors.push(`REQUIRED:${field}`);
  if (kind === 'ResearchCoverageManifest') {
    if (!Array.isArray(value?.units)) errors.push('UNITS_REQUIRED');
    for (const unit of value?.units || []) for (const dimension of RESEARCH_DIMENSIONS) {
      const row = unit.dimensions?.[dimension];
      if (!row || !COVERAGE_STATUSES.includes(row.status)) errors.push(`DIMENSION_STATUS:${unit.unit_lineage_id}:${dimension}`);
      if (row?.status === 'DEFERRED_WITH_REASON' && !nonempty(row.reason)) errors.push(`DEFER_REASON:${unit.unit_lineage_id}:${dimension}`);
    }
  }
  if (kind === 'ResearchArtifact') {
    for (const field of ['request_hash','source_hash','response_hash']) if (!SHA.test(value?.[field] || '')) errors.push(`HASH:${field}`);
    if (value?.data_class !== 'PUBLIC_RESEARCH_ONLY' || value?.egress !== 'PUBLIC_RESEARCH_ONLY') errors.push('EGRESS_CLASS_INVALID');
    for (const claim of value?.claims || []) {
      if (!nonempty(claim.claim) || !['FACTUAL','INFERENTIAL'].includes(claim.classification) || !Array.isArray(claim.source_refs)) errors.push('CLAIM_INVALID');
    }
  }
  if (kind === 'SharedResearchArtifact' && !Array.isArray(value?.applicability?.unit_lineage_ids)) errors.push('APPLICABILITY_REQUIRED');
  return { ok: errors.length === 0, errors };
}

export function assertResearchContract(kind, value) {
  const result = validateResearchContract(kind, value);
  if (!result.ok) throw new Error(`${kind}_INVALID:${result.errors.join(',')}`);
  return value;
}

export function deterministicApplicability(sharedArtifact, units) {
  const tags = new Set(sharedArtifact?.applicability?.technology_tags || []);
  return units.filter((unit) => {
    if ((sharedArtifact?.applicability?.unit_lineage_ids || []).includes(unit.unit_lineage_id)) return true;
    return (unit.research_tags || []).some((tag) => tags.has(tag));
  }).map((unit) => unit.unit_lineage_id).sort();
}

export function researchArtifactHash(value) { return hash(value); }
