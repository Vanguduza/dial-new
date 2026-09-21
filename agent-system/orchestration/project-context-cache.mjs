import { DEFAULT_CONTROL_HOME, readJson, writeJsonAtomic } from './state-store.mjs';
import { hashObject, writeContentAddressedJson } from './knowledge-graph-core.mjs';

function now() { return new Date().toISOString(); }
function projectSlug(project) {
  const value = String(project || 'dial').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(value)) throw new Error(`invalid project: ${project}`);
  return value;
}
function profile(value) {
  const p = String(value || 'IMPLEMENTATION').toUpperCase();
  if (!['REVIEW', 'IMPLEMENTATION', 'ARCHITECTURE', 'DEEP_AUDIT'].includes(p)) throw new Error(`unsupported context profile: ${value}`);
  return p;
}

export function estimateTokens(value, charsPerToken = 4) {
  const chars = typeof value === 'string' ? value.length : JSON.stringify(value ?? '').length;
  return Math.ceil(chars / Math.max(1, Number(charsPerToken) || 4));
}

export function buildContextCacheIdentity({
  project = 'dial',
  featureId = null,
  projectTruthHash = null,
  repositorySha = null,
  graphRevisionHash = null,
  memoryCursor = null,
  contextProfile = 'IMPLEMENTATION',
  skillActivationHash = null,
  repositoryUnderstandingHash = null,
} = {}) {
  const body = {
    schema_version: 1,
    project: projectSlug(project),
    feature_id: featureId ?? null,
    project_truth_hash: projectTruthHash ?? null,
    repository_sha: repositorySha ?? null,
    graph_revision_hash: graphRevisionHash ?? null,
    memory_cursor: memoryCursor ?? null,
    context_profile: profile(contextProfile),
    skill_activation_hash: skillActivationHash ?? null,
    repository_understanding_hash: repositoryUnderstandingHash ?? null,
  };
  return { ...body, context_fingerprint: hashObject(body) };
}

function indexRel(project, fingerprint) {
  return `context-cache/index/${projectSlug(project)}/${fingerprint}.json`;
}

export function getCachedContext({ project = 'dial', contextFingerprint } = {}, root = DEFAULT_CONTROL_HOME) {
  if (!contextFingerprint) return null;
  const pointer = readJson(indexRel(project, contextFingerprint), null, root);
  if (!pointer?.object_rel) return null;
  const object = readJson(pointer.object_rel, null, root);
  if (!object || object.context_fingerprint !== contextFingerprint) return null;
  writeCacheStat(project, 'hit', root);
  return object;
}

export function putCachedContext({
  identity,
  sections,
  rendered,
  charsPerToken = 4,
} = {}, root = DEFAULT_CONTROL_HOME) {
  if (!identity?.context_fingerprint) throw new Error('context identity with fingerprint is required');
  const sectionHashes = Object.fromEntries(
    Object.entries(sections || {}).map(([key, value]) => [key, hashObject(value)]),
  );
  const record = {
    schema_version: 1,
    ...identity,
    sections,
    section_hashes: sectionHashes,
    rendered: String(rendered || ''),
    estimated_tokens: estimateTokens(rendered, charsPerToken),
    created_at: now(),
  };
  const stored = writeContentAddressedJson('context-cache/objects', record, { root, prefix: 'context' });
  writeJsonAtomic(indexRel(identity.project, identity.context_fingerprint), {
    schema_version: 1,
    project: identity.project,
    context_fingerprint: identity.context_fingerprint,
    object_rel: stored.rel,
    object_hash: stored.hash,
    estimated_tokens: record.estimated_tokens,
    created_at: record.created_at,
  }, root);
  writeCacheStat(identity.project, stored.created ? 'miss_store' : 'dedupe_store', root);
  return { ...record, object_rel: stored.rel, object_hash: stored.hash, created: stored.created };
}

function writeCacheStat(project, event, root) {
  const rel = `context-cache/stats/${projectSlug(project)}.json`;
  const stats = readJson(rel, {
    schema_version: 1,
    project: projectSlug(project),
    hits: 0,
    miss_stores: 0,
    dedupe_stores: 0,
    delta_deliveries: 0,
    full_deliveries: 0,
    estimated_tokens_saved: 0,
    updated_at: null,
  }, root);
  if (event === 'hit') stats.hits += 1;
  if (event === 'miss_store') stats.miss_stores += 1;
  if (event === 'dedupe_store') stats.dedupe_stores += 1;
  if (event === 'delta') stats.delta_deliveries += 1;
  if (event === 'full') stats.full_deliveries += 1;
  stats.updated_at = now();
  writeJsonAtomic(rel, stats, root);
  return stats;
}

export function composeContextDelta({
  current,
  previous = null,
  charsPerToken = 4,
} = {}, root = DEFAULT_CONTROL_HOME) {
  if (!current?.context_fingerprint) throw new Error('current context record is required');
  if (!previous?.context_fingerprint || !previous?.sections) {
    writeCacheStat(current.project, 'full', root);
    return {
      mode: 'FULL',
      base_context_fingerprint: null,
      context_fingerprint: current.context_fingerprint,
      sections: current.sections,
      rendered: current.rendered,
      estimated_tokens: current.estimated_tokens ?? estimateTokens(current.rendered, charsPerToken),
      estimated_tokens_saved: 0,
    };
  }

  const changed = {};
  for (const [key, value] of Object.entries(current.sections || {})) {
    if (current.section_hashes?.[key] !== previous.section_hashes?.[key]) changed[key] = value;
  }
  const removed = Object.keys(previous.sections || {}).filter((key) => !(key in (current.sections || {})));
  const deltaBody = {
    mode: 'DELTA',
    base_context_fingerprint: previous.context_fingerprint,
    context_fingerprint: current.context_fingerprint,
    changed_sections: changed,
    removed_sections: removed,
  };
  const rendered = [
    'DIAL SHARED CONTEXT DELTA',
    `Base: ${previous.context_fingerprint}`,
    `Current: ${current.context_fingerprint}`,
    ...Object.entries(changed).map(([key, value]) => `\n--- ${key} ---\n${typeof value === 'string' ? value : JSON.stringify(value)}`),
    removed.length ? `\nRemoved sections: ${removed.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const deltaTokens = estimateTokens(rendered, charsPerToken);
  const fullTokens = current.estimated_tokens ?? estimateTokens(current.rendered, charsPerToken);
  const saved = Math.max(0, fullTokens - deltaTokens);

  const statsRel = `context-cache/stats/${projectSlug(current.project)}.json`;
  const stats = writeCacheStat(current.project, 'delta', root);
  stats.estimated_tokens_saved = Number(stats.estimated_tokens_saved || 0) + saved;
  writeJsonAtomic(statsRel, stats, root);

  return { ...deltaBody, rendered, estimated_tokens: deltaTokens, estimated_tokens_saved: saved };
}

export function readContextCacheStats(project = 'dial', root = DEFAULT_CONTROL_HOME) {
  return readJson(`context-cache/stats/${projectSlug(project)}.json`, {
    schema_version: 1,
    project: projectSlug(project),
    hits: 0,
    miss_stores: 0,
    dedupe_stores: 0,
    delta_deliveries: 0,
    full_deliveries: 0,
    estimated_tokens_saved: 0,
    updated_at: null,
  }, root);
}
