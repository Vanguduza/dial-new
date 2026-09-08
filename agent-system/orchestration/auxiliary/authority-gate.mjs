export const HAIF_AUTHORITY = 'NON_AUTHORITATIVE_AUXILIARY';
export const HAIF_EVIDENCE_AUTHORITY = 'NON_AUTHORITATIVE_AUXILIARY_EVIDENCE';
export const HAIF_BUDGET_POLICY = 'FREE_ONLY';

export const SHARED_ARCHETYPES = Object.freeze([
  'EXTRACT_STRUCTURED_FACTS', 'CLASSIFY', 'SUMMARIZE_BOUNDED',
  'LONG_CONTEXT_SYNTHESIS', 'CONTRADICTION_DETECTION', 'COMPARE_SOURCES',
  'CRITIQUE_PLAN', 'CLUSTER_LOGS', 'ROOT_CAUSE_HYPOTHESIS',
  'CONTEXT_COMPRESSION', 'MEMORY_CONSOLIDATION', 'VISUAL_HEURISTIC_CRITIQUE',
  'RESEARCH_PREPROCESS',
]);

export const DIAL_ARCHETYPES = Object.freeze([
  'SUPPLIER_RESEARCH', 'CATALOGUE_ENRICHMENT', 'PRODUCT_TAXONOMY',
  'SEARCH_QUERY_CLUSTER', 'CUSTOMER_INTENT_SANITIZED',
  'BUSINESS_ANOMALY_CANDIDATE', 'CARE_HISTORY_SYNTHESIS',
  'GROCERY_FEEDBACK_CLUSTER',
]);

export const DDE_ARCHETYPES = Object.freeze([
  'VEKL_EXTRACT', 'VEKL_SYNTHESIS', 'TRUTH_DOC_DRIFT_CANDIDATE',
  'ARCHITECTURE_COMPARE', 'CI_EVIDENCE_CLUSTER', 'SOURCE_INTELLIGENCE',
]);
const DENIED_INTENT = Object.freeze([
  /\b(write|edit|modify|patch|commit|push|merge|rebase)\b.{0,40}\b(repo|repository|source|code|file)/i,
  /\b(manager chair|orchestrate|manager runtime|development fallback)\b/i,
  /\b(deploy|release|production mutation|database mutation|settlement|reconciliation)\b/i,
  /\b(shell|powershell|bash|terminal command)\b/i,
]);

export function archetypesFor(project) {
  const local = project === 'dial' ? DIAL_ARCHETYPES : project === 'dde' ? DDE_ARCHETYPES : [];
  return new Set([...SHARED_ARCHETYPES, ...local]);
}

export function assertAuxiliaryAuthority(task, { expectedProject } = {}) {
  if (!task || typeof task !== 'object') throw new Error('HAIF task is required');
  if (!['dial', 'dde'].includes(task.project)) throw new Error('HAIF task project must be dial or dde');
  if (expectedProject && task.project !== expectedProject) {
    throw new Error(`HAIF tenant mismatch: expected ${expectedProject}, got ${task.project}`);
  }
  if (task.authority !== HAIF_AUTHORITY) throw new Error('HAIF authority must remain non-authoritative');
  if (task.budget_policy !== HAIF_BUDGET_POLICY) throw new Error('HAIF v1 permits FREE_ONLY budget policy');
  if (!archetypesFor(task.project).has(task.task_archetype)) throw new Error(`unsupported HAIF archetype: ${task.task_archetype}`);
  if (task.required_capabilities?.tools === true) throw new Error('HAIF v1 tools are disabled');
  if (task.allow_repository_writes === true) throw new Error('HAIF v1 repository writes are forbidden');
  const purpose = String(task.purpose ?? task.instruction ?? '');
  if (DENIED_INTENT.some((pattern) => pattern.test(purpose))) throw new Error('HAIF task crosses the non-authoritative v1 boundary');
  return task;
}
