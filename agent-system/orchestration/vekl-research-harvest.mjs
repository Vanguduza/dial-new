#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  UNION_ALPHA_DATA_CLASS,
  UNION_ALPHA_ROLES,
  validateUnionAlphaResult,
} from './providers/openrouter/union-alpha-research-adapter.mjs';
import {
  DEFAULT_CONTROL_HOME,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import { RESEARCH_DIMENSIONS, validateResearchContract } from './vekl-research-contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');
export const DEVELOPMENT_UNIT_REGISTRY =
  'agent-system/registries/DEVELOPMENT_UNIT_REGISTRY.json';
export const FEATURE_REGISTRY = 'agent-system/registries/FEATURE_REGISTRY.json';
const RESOURCE_REGISTRY =
  'agent-system/engineering-knowledge/registries/ENGINEERING_RESOURCE_REGISTRY.json';
const PROJECT_TRUTH = 'agent-system/canon/PROJECT_TRUTH.md';
export const RESEARCH_MISSION_SCHEMA = 1;
export const UNIT_BATCH_SIZE = 6;
export const RESEARCH_ROLES = UNION_ALPHA_ROLES; // historical name retained for artifact compatibility

const PLATFORM_GROUPS = Object.freeze([
  {
    id: 'WEB_FRONTEND',
    topic: 'Current guided multi-candidate frontend, design critics, quality packets, responsive UX, accessibility and browser verification engineering',
    technologies: ['Next.js', 'React', 'TypeScript', 'Playwright', 'Vitest', 'Zod'],
    source_ids: [
      'official.nextjs', 'official.react', 'official.typescript',
      'official.playwright', 'official.vitest', 'official.zod',
    ],
  },
  {
    id: 'DATA_AUTH',
    topic: 'Current PostgreSQL, Supabase, schema, transaction, RLS and authentication engineering',
    technologies: ['PostgreSQL', 'Supabase'],
    source_ids: ['official.postgresql', 'official.supabase'],
  },
  {
    id: 'MOBILE_ANDROID',
    topic: 'Current Android mobile, Compose, lifecycle, offline and secure client engineering',
    technologies: ['Android', 'Jetpack Compose', 'Kotlin'],
    source_ids: ['official.android.skills', 'official.google.skills', 'registry.maven'],
  },
  {
    id: 'MAPS_LOGISTICS',
    topic: 'Current mapping, geocoding, routing and route-optimization engineering',
    technologies: ['MapLibre', 'OSRM', 'VROOM', 'Nominatim'],
    source_ids: [
      'official.maplibre', 'official.osrm',
      'official.vroom', 'official.nominatim',
    ],
  },
  {
    id: 'OBSERVABILITY_QA',
    topic: 'Current observability, product telemetry, evaluation and software quality engineering',
    technologies: ['OpenTelemetry', 'PostHog', 'Promptfoo'],
    source_ids: [
      'official.opentelemetry', 'official.posthog', 'official.promptfoo',
    ],
  },
  {
    id: 'AI_AGENTIC',
    topic: 'Current AI gateway, model orchestration, agent tooling and verification engineering',
    technologies: ['LiteLLM', 'Anthropic', 'Google AI'],
    source_ids: [
      'official.litellm', 'official.anthropic.plugin-marketplace',
      'official.google.skills',
    ],
  },
  {
    id: 'AUTOMATION_CLOUD',
    topic: 'Current self-hosted n8n runtime architecture, signed events, idempotency, release qualification, cloud edge, deployment and recovery engineering',
    technologies: ['n8n', 'Cloudflare', 'Oracle Cloud'],
    source_ids: ['official.n8n', 'official.cloudflare', 'official.oracle'],
  },
  {
    id: 'MESSAGING_SUPPORT',
    topic: 'Current messaging, WhatsApp integration, customer support and channel reliability engineering',
    technologies: ['WhatsApp', 'Chatwoot'],
    source_ids: ['official.meta.whatsapp', 'official.chatwoot'],
  },
]);

function now() { return new Date().toISOString(); }
function sha(value) {
  return crypto.createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}
function readJsonFile(repoDir, rel) {
  return JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8'));
}
function gitHead(repoDir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoDir, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim();
  } catch {
    try {
      const gitDir = path.join(repoDir, '.git');
      const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
      if (/^[a-f0-9]{40}$/.test(head)) return head;
      if (head.startsWith('ref: ')) return fs.readFileSync(path.join(gitDir, head.slice(5)), 'utf8').trim();
    } catch {}
    return null;
  }
}
function gitCommitTime(repoDir) {
  try { return execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: repoDir, encoding: 'utf8', timeout: 10000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim(); }
  catch { return null; }
}
function projectTruthHash(repoDir) {
  return sha(fs.readFileSync(path.join(repoDir, PROJECT_TRUTH)));
}
function featureMap(repoDir) {
  return new Map(readJsonFile(repoDir, FEATURE_REGISTRY)
    .map((feature) => [feature.feature_id, feature]));
}
function resourceRows(repoDir) {
  return readJsonFile(repoDir, RESOURCE_REGISTRY);
}
function sourceHintsForIds(resources, ids) {
  const wanted = new Set(ids);
  return resources.filter((row) => wanted.has(row.source_id))
    .filter((row) => Array.isArray(row.seed_urls) && row.seed_urls[0])
    .slice(0, 10)
    .map((row) => ({
      source_id: row.source_id,
      authority: row.authority,
      url: row.seed_urls[0],
      technology: row.technologies?.[0] || null,
    }));
}
function genericModuleClass(unit, feature) {
  const apps = new Set(feature?.app_families || []);
  const security = new Set(unit.security_controls || []);
  if (security.has('S3') || security.has('S4')) return 'HIGH_ASSURANCE_SERVICE';
  if (apps.has('DIAL_CONSUMER') && apps.has('DIAL_WEB')) return 'MULTI_SURFACE_CLIENT_SERVICE';
  if (apps.has('DIAL_CONSUMER')) return 'MOBILE_CLIENT_SERVICE';
  if (apps.has('DIAL_WEB')) return 'WEB_CLIENT_SERVICE';
  return 'BACKEND_DOMAIN_SERVICE';
}
function technologyTagsFor(unit, feature) {
  const tags = new Set(['TypeScript', 'PostgreSQL', 'OpenTelemetry']);
  const apps = new Set(feature?.app_families || []);
  if (apps.has('DIAL_WEB')) {
    tags.add('React'); tags.add('Next.js'); tags.add('Playwright');
  }
  if (apps.has('DIAL_CONSUMER')) {
    tags.add('Android'); tags.add('Jetpack Compose');
  }
  if ((unit.security_controls || []).length) tags.add('Zod');
  return [...tags].sort();
}
function sourceIdsForTags(tags) {
  const ids = new Set(['official.postgresql', 'official.opentelemetry']);
  if (tags.includes('Next.js')) ids.add('official.nextjs');
  if (tags.includes('React')) ids.add('official.react');
  if (tags.includes('TypeScript')) ids.add('official.typescript');
  if (tags.includes('Playwright')) ids.add('official.playwright');
  if (tags.includes('Android')) ids.add('official.android.skills');
  if (tags.includes('Zod')) ids.add('official.zod');
  return [...ids];
}
function roleQuestions(moduleClass, tags) {
  const tech = tags.join(', ');
  const questions = {
    TECHNOLOGY_RESEARCHER: `Identify stable patterns, exact-version pitfalls and migrations for ${moduleClass} using ${tech}.`,
    REPOSITORY_RESEARCHER: `Identify trustworthy public reference implementations and maintainer issue lessons for ${moduleClass}.`,
    ARCHITECTURE_RESEARCHER: `Identify current architecture patterns and authority, consistency and determinism boundaries for ${moduleClass}.`,
    ARCHITECTURE_COMPARATOR: `Compare viable architectures, alternatives, trade-offs and avoidance conditions for ${moduleClass}.`,
    SECURITY_RESEARCHER: `Identify threats, secure defaults, authorization, privacy and supply-chain controls for ${moduleClass}.`,
    UX_PATTERN_RESEARCHER: `Identify accessible, responsive, degraded-state and professional UX patterns for ${moduleClass}.`,
    FRONTEND_RESEARCHER: `Identify frontend state, rendering, accessibility, browser and client integration patterns applicable to ${moduleClass}.`,
    FAILURE_MODE_RESEARCHER: `Identify failures, partial/offline behavior, retry/idempotency hazards and recovery for ${moduleClass}.`,
    OPERABILITY_RESEARCHER: `Identify observability, alerting, support, capacity, rollback and runbook requirements for ${moduleClass}.`,
    TESTING_RESEARCHER: `Identify deterministic unit, integration, security, failure and end-to-end verification for ${moduleClass}.`,
    PERFORMANCE_RESEARCHER: `Identify performance budgets, bottlenecks, measurement traps and safe optimization for ${moduleClass}.`,
    DEPLOYMENT_RESEARCHER: `Identify deployment, configuration, secret, migration, rollback and recovery practices for ${moduleClass}.`,
    INTEGRATION_RESEARCHER: `Identify contract, compatibility, event, API and dependency integration risks for ${moduleClass}.`,
    SOURCE_SYNTHESIZER: `Synthesize the strongest evidence for ${moduleClass}, separating fact from inference and flagging stale evidence.`,
    CONTRADICTION_ANALYST: `Identify conflicting sources or versions for ${moduleClass} and evidence needed to resolve them.`,
    ANTI_PATTERN_MINER: `Identify current anti-patterns, unsafe shortcuts, symptoms and safer replacements for ${moduleClass}.`,
    OFFICIAL_DOC_SYNTHESIZER: `Extract exact-version implementation and verification guidance from official documentation for ${moduleClass}.`,
    OPEN_SOURCE_DONOR_RESEARCHER: `Assess public donor implementations, licenses, versions, provenance and assimilation risks for ${moduleClass}.`,
  };
  return UNION_ALPHA_ROLES.map((role) => `${role}: ${questions[role]}`);
}
function searchQueriesFor(moduleClass, tags) {
  const primary = tags.slice(0, 3).join(' ');
  return [
    `${primary} ${moduleClass} current architecture security testing best practices`,
    `${primary} production failure modes migration issues maintainers`,
    `${primary} accessibility performance observability 2026`,
  ];
}
function unitSubject(unit, feature, resources) {
  const moduleClass = genericModuleClass(unit, feature);
  const tags = technologyTagsFor(unit, feature);
  const sourceIds = sourceIdsForTags(tags);
  return {
    provider_subject: {
      subject_id: sha(`unit|${unit.unit_lineage_id}|${unit.unit_revision_hash}`).slice(0, 24),
      topic: `Current engineering evidence for a ${moduleClass.toLowerCase().replaceAll('_', ' ')}`,
      module_class: moduleClass,
      technology_tags: tags,
      engineering_questions: roleQuestions(moduleClass, tags),
      role_scope: [...UNION_ALPHA_ROLES],
      source_hints: sourceHintsForIds(resources, sourceIds),
      search_queries: searchQueriesFor(moduleClass, tags),
      discovery_workload: {
        mode: 'OPEN_WORLD_BOUNDED',
        lifecycle: 'DISCOVERED_TO_QUALIFIED',
        trust_assignment: 'PROVENANCE_FAIL_CLOSED',
        required_outputs: ['candidate_sources', 'provenance', 'freshness', 'version', 'contradictions'],
        authority: 'NON_AUTHORITATIVE_DISCOVERY_EVIDENCE',
      },
    },
    binding: {
      unit_lineage_id: unit.unit_lineage_id,
      unit_revision_hash: unit.unit_revision_hash,
      feature_ids: [...(unit.feature_ids || [])],
      module: feature?.module || null,
      module_class: moduleClass,
    },
  };
}

export function buildResearchHarvestManifest({
  repoDir = DEFAULT_REPO,
  root = DEFAULT_CONTROL_HOME,
  missionId = null,
} = {}) {
  const registry = readJsonFile(repoDir, DEVELOPMENT_UNIT_REGISTRY);
  const graphPointer = readJson('knowledge/graph/current.json', null, root);
  const units = registry.units || [];
  const features = featureMap(repoDir);
  const resources = resourceRows(repoDir);
  if (units.length !== 309) {
    throw new Error(`VEKL_RESEARCH_EXPECTED_309_UNITS:observed=${units.length}`);
  }
  const resolvedMissionId = missionId ||
    `vekl-full-research-${sha(`${projectTruthHash(repoDir)}|${registry.project_truth_hash}`).slice(0, 20)}`;
  const subjects = units.map((unit) =>
    unitSubject(unit, features.get(unit.feature_ids?.[0]), resources));
  const unitBatches = [];
  for (let i = 0; i < subjects.length; i += UNIT_BATCH_SIZE) {
    const slice = subjects.slice(i, i + UNIT_BATCH_SIZE);
    const ordinal = String(unitBatches.length + 1).padStart(3, '0');
    unitBatches.push({
      batch_id: `unit-${ordinal}-${sha(slice.map((x) => x.provider_subject.subject_id)).slice(0, 12)}`,
      batch_kind: 'UNIT_RESEARCH',
      data_class: UNION_ALPHA_DATA_CLASS,
      subjects: slice.map((x) => x.provider_subject),
      bindings: slice.map((x) => ({
        subject_id: x.provider_subject.subject_id,
        ...x.binding,
      })),
    });
  }
  const platformSubjects = PLATFORM_GROUPS.map((group) => ({
    subject_id: sha(`platform|${group.id}`).slice(0, 24),
    topic: group.topic,
    module_class: `PLATFORM_${group.id}`,
    technology_tags: group.technologies,
    engineering_questions: roleQuestions(`PLATFORM_${group.id}`, group.technologies),
    role_scope: [...UNION_ALPHA_ROLES],
    source_hints: sourceHintsForIds(resources, group.source_ids),
    search_queries: searchQueriesFor(`PLATFORM_${group.id}`, group.technologies),
  }));
  const platformBatch = {
    batch_id: `platform-001-${sha(platformSubjects.map((x) => x.subject_id)).slice(0, 12)}`,
    batch_kind: 'PLATFORM_RESEARCH',
    data_class: UNION_ALPHA_DATA_CLASS,
    subjects: platformSubjects,
    bindings: platformSubjects.map((subject) => ({
      subject_id: subject.subject_id,
      unit_lineage_id: null,
      unit_revision_hash: null,
      feature_ids: [],
      module: 'SHARED_PLATFORM',
      module_class: subject.module_class,
    })),
  };
  const moduleClasses = [...new Set(subjects.map((row) => row.binding.module_class))].sort();
  const manifest = {
    schema_version: RESEARCH_MISSION_SCHEMA,
    mission_id: resolvedMissionId,
    authority: 'NON_AUTHORITATIVE_ENGINEERING_RESEARCH_MISSION',
    model_id: 'stealth/union-alpha',
    data_class: UNION_ALPHA_DATA_CLASS,
    repository_sha: gitHead(repoDir),
    project_truth_hash: projectTruthHash(repoDir),
    development_unit_registry_hash: sha(registry),
    project_truth_fingerprint: registry.project_truth_hash || projectTruthHash(repoDir),
    graph_generation_id: graphPointer?.graph_generation_id || registry.graph_generation_id || null,
    graph_revision_hash: graphPointer?.graph_revision_hash || registry.graph_revision_hash || null,
    feature_registry_hash: sha(readJsonFile(repoDir, FEATURE_REGISTRY)),
    frc_hash: sha(units.flatMap((unit) => unit.contract_fingerprints || []).sort()),
    security_hash: sha(units.map((unit) => [unit.unit_lineage_id, unit.security_controls || []])),
    product_experience_hash: sha(units.map((unit) => [unit.unit_lineage_id, unit.realization_facets || []])),
    unit_count: units.length,
    platform_subject_count: platformSubjects.length,
    unit_batch_count: unitBatches.length,
    module_classes: moduleClasses,
    required_roles: [...UNION_ALPHA_ROLES],
    provider_binding: { provider: 'openrouter', model_id: 'stealth/union-alpha', fallback: 'PROHIBITED', paid_inference: 'PROHIBITED' },
    execution_contract: {
      selection: 'PROVIDER_NEUTRAL_CREDENTIAL_GATED',
      active_provider: null,
      groq_activation: 'APPROVED_CREDENTIAL_REQUIRED',
      historical_result_policy: 'PRESERVE_AND_NEVER_FABRICATE',
      adapter: 'agent-system/orchestration/providers/research/research-provider-router.mjs',
    },
    source_requirements: { preferred: ['OFFICIAL_DOC', 'MAINTAINER_REPOSITORY', 'SECURITY_ADVISORY'], corroboration_only: ['COMMUNITY'], citation_required: true },
    prohibited_data_classes: ['PRIVATE_REPOSITORY_CONTENT', 'SECRET', 'CUSTOMER_DATA', 'PAYMENT_DATA', 'IDENTIFIABLE_HEALTH_DATA', 'PRODUCTION_IDENTIFIER'],
    output_schema: 'ResearchArtifact@1',
    retry_policy: { max_attempts: 4, retryable: ['RATE_LIMIT', 'PROVIDER_OUTAGE', 'TIMEOUT'], blocking: ['FREE_WINDOW_CLOSED', 'AUTH_REQUIRED', 'INVALID_OUTPUT'] },
    phases: [
      'PLANNED',
      'PLATFORM_RESEARCH',
      'UNIT_RESEARCH',
      'CONTRADICTION_REVIEW',
      'COVERAGE_AUDIT',
      'COMPLETE',
    ],
    expected_provider_calls: 1 + unitBatches.length + moduleClasses.length,
    platform_batches: [platformBatch],
    unit_batches: unitBatches,
    created_at: gitCommitTime(repoDir),
  };
  manifest.manifest_hash = sha(manifest);
  return manifest;
}

export function buildResearchCoverageManifest({ repoDir = DEFAULT_REPO, root = DEFAULT_CONTROL_HOME, missionId = null, providerState = 'FREE_WINDOW_CLOSED' } = {}) {
  const mission = buildResearchHarvestManifest({ repoDir, root, missionId });
  const registry = readJsonFile(repoDir, DEVELOPMENT_UNIT_REGISTRY);
  const blocking = providerState === 'FREE_WINDOW_CLOSED';
  const units = [...registry.units].sort((a, b) => a.unit_lineage_id.localeCompare(b.unit_lineage_id)).map((unit) => ({
    unit_lineage_id: unit.unit_lineage_id,
    unit_revision_hash: unit.unit_revision_hash,
    feature_ids: [...(unit.feature_ids || [])].sort(),
    dimensions: Object.fromEntries(RESEARCH_DIMENSIONS.map((dimension) => [dimension, {
      status: blocking ? 'FAILED_BLOCKING' : 'NOT_STARTED',
      reason: blocking ? 'UNION_ALPHA_FREE_WINDOW_CLOSED; paid Pareto and fallback substitution prohibited' : null,
      artifact_refs: [],
    }])),
  }));
  const coverage = {
    schema_version: 1,
    manifest_kind: 'ResearchCoverageManifest',
    mission_id: mission.mission_id,
    repository_sha: mission.repository_sha,
    project_truth_fingerprint: mission.project_truth_fingerprint,
    graph_generation_id: mission.graph_generation_id || 'UNAVAILABLE_IN_DU_REGISTRY',
    graph_revision_hash: mission.graph_revision_hash || 'UNAVAILABLE_IN_DU_REGISTRY',
    du_inventory: { count: units.length, registry_hash: mission.development_unit_registry_hash },
    feature_registry_hash: mission.feature_registry_hash,
    frc_hash: mission.frc_hash,
    security_hash: mission.security_hash,
    product_experience_hash: mission.product_experience_hash,
    provider_state: providerState,
    model_id: mission.model_id,
    generated_at: mission.created_at,
    units,
  };
  coverage.coverage_manifest_hash = sha(coverage);
  const check = validateResearchContract('ResearchCoverageManifest', coverage);
  if (!check.ok) throw new Error(`RESEARCH_COVERAGE_MANIFEST_INVALID:${check.errors.join(',')}`);
  return coverage;
}

export function buildContradictionBatches({
  manifest,
  completedRecords = [],
} = {}) {
  if (!manifest?.mission_id) throw new Error('RESEARCH_MANIFEST_REQUIRED');
  const byClass = new Map(manifest.module_classes.map((id) => [id, []]));
  for (const record of completedRecords) {
    if (record?.batch_kind !== 'UNIT_RESEARCH') continue;
    const bindingMap = new Map((record.subject_bindings || [])
      .map((binding) => [binding.subject_id, binding]));
    for (const subject of record.result?.subjects || []) {
      const binding = bindingMap.get(subject.subject_id);
      if (!binding?.module_class || !byClass.has(binding.module_class)) continue;
      byClass.get(binding.module_class).push({
        subject_id: subject.subject_id,
        synthesis: subject.cross_role_synthesis || {},
        role_unknowns: Object.fromEntries(UNION_ALPHA_ROLES.map((role) => [
          role, subject.roles?.[role]?.unknowns || [],
        ])),
      });
    }
  }
  return [...byClass.entries()].map(([moduleClass, summaries], index) => {
    const subjectId = sha(`contradiction|${manifest.mission_id}|${moduleClass}`).slice(0, 24);
    return {
      batch_id: `contradiction-${String(index + 1).padStart(2, '0')}-${sha(moduleClass).slice(0, 10)}`,
      batch_kind: 'CONTRADICTION_REVIEW',
      data_class: UNION_ALPHA_DATA_CLASS,
      subjects: [{
        subject_id: subjectId,
        topic: `Cross-batch contradiction review for ${moduleClass.toLowerCase().replaceAll('_', ' ')} engineering evidence`,
        module_class: moduleClass,
        technology_tags: [],
        engineering_questions: roleQuestions(moduleClass, []),
        role_scope: [...UNION_ALPHA_ROLES],
        source_hints: [],
        search_queries: [
          `${moduleClass} architecture security failure mode contradictory guidance`,
        ],
        prior_summary: JSON.stringify(summaries).slice(0, 7000),
      }],
      bindings: [{
        subject_id: subjectId,
        unit_lineage_id: null,
        unit_revision_hash: null,
        feature_ids: [],
        module: 'CROSS_UNIT_REVIEW',
        module_class: moduleClass,
      }],
    };
  });
}

function artifactDir(root, missionId) {
  return resolveControlPath(
    `knowledge/research/union-alpha/artifacts/${missionId}`,
    root,
  );
}
function artifactRecords(root, missionId) {
  const dir = artifactDir(root, missionId);
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export function finalizeUnionAlphaResearchMission({
  repoDir = DEFAULT_REPO,
  root = DEFAULT_CONTROL_HOME,
  missionId,
} = {}) {
  if (!missionId) throw new Error('RESEARCH_MISSION_ID_REQUIRED');
  const manifest = buildResearchHarvestManifest({ repoDir, root, missionId });
  const records = artifactRecords(root, missionId);
  const expectedUnits = new Map(readJsonFile(repoDir, DEVELOPMENT_UNIT_REGISTRY)
    .units.map((unit) => [unit.unit_lineage_id, unit]));
  const unitEvidence = new Map();
  let platformSubjects = 0;
  const contradictionClasses = new Set();
  const invalid = [];
  for (const record of records) {
    if (!record.result || record.result.schema_version !== 1) {
      invalid.push(`${record.batch_id}:RESULT_MISSING`);
      continue;
    }
    if (record.batch_kind === 'PLATFORM_RESEARCH') {
      platformSubjects += record.result.subjects?.length || 0;
    }
    if (record.batch_kind === 'CONTRADICTION_REVIEW') {
      for (const binding of record.subject_bindings || []) {
        if (binding.module_class) contradictionClasses.add(binding.module_class);
      }
    }
    if (record.batch_kind !== 'UNIT_RESEARCH') continue;
    const localSubjects = new Map((record.result.subjects || [])
      .map((subject) => [subject.subject_id, subject]));
    for (const binding of record.subject_bindings || []) {
      if (!binding.unit_lineage_id) continue;
      const unit = expectedUnits.get(binding.unit_lineage_id);
      const subject = localSubjects.get(binding.subject_id);
      if (!unit || unit.unit_revision_hash !== binding.unit_revision_hash || !subject) {
        invalid.push(`${record.batch_id}:${binding.subject_id}:BINDING_INVALID`);
        continue;
      }
      const check = validateUnionAlphaResult({
        schema_version: 1,
        batch_id: record.batch_id,
        subjects: [subject],
      }, {
        batch_id: record.batch_id,
        subjects: [{ subject_id: binding.subject_id }],
      });
      if (!check.ok) {
        invalid.push(`${record.batch_id}:${binding.subject_id}:${check.reason}`);
        continue;
      }
      unitEvidence.set(binding.unit_lineage_id, {
        schema_version: 1,
        status: 'RESEARCH_READY',
        authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
        mission_id: missionId,
        model_id: record.model_id,
        unit_lineage_id: binding.unit_lineage_id,
        unit_revision_hash: binding.unit_revision_hash,
        feature_ids: binding.feature_ids || [],
        batch_id: record.batch_id,
        subject_id: binding.subject_id,
        artifact_evidence_hash: record.evidence_hash,
        research: subject,
        completed_at: record.completed_at,
      });
    }
  }
  const missingUnits = [...expectedUnits.keys()].filter((id) => !unitEvidence.has(id));
  const missingContradictions = manifest.module_classes
    .filter((id) => !contradictionClasses.has(id));
  const checks = {
    exact_unit_count: expectedUnits.size === 309,
    all_units_researched: missingUnits.length === 0,
    platform_research_complete:
      platformSubjects >= manifest.platform_subject_count,
    all_roles_required: manifest.required_roles.length === UNION_ALPHA_ROLES.length,
    contradiction_review_complete: missingContradictions.length === 0,
    no_invalid_artifacts: invalid.length === 0,
  };
  const passed = Object.values(checks).every(Boolean);
  const coverage = {
    schema_version: 1,
    mission_id: missionId,
    state: passed ? 'COMPLETE' : 'COVERAGE_INCOMPLETE',
    authority: 'NON_AUTHORITATIVE_ENGINEERING_RESEARCH_COVERAGE',
    model_id: 'stealth/union-alpha',
    repository_sha: manifest.repository_sha,
    project_truth_hash: manifest.project_truth_hash,
    development_unit_registry_hash: manifest.development_unit_registry_hash,
    expected_unit_count: expectedUnits.size,
    researched_unit_count: unitEvidence.size,
    platform_subject_count: platformSubjects,
    required_roles: manifest.required_roles,
    contradiction_classes_expected: manifest.module_classes,
    contradiction_classes_complete: [...contradictionClasses].sort(),
    checks,
    missing_units: missingUnits.slice(0, 309),
    missing_contradiction_classes: missingContradictions,
    invalid_artifacts: invalid.slice(0, 200),
    artifact_count: records.length,
    completed_at: passed ? now() : null,
    evaluated_at: now(),
  };
  coverage.coverage_hash = sha(coverage);
  if (passed) {
    const shared = new Map();
    for (const [unitId, record] of unitEvidence) {
      const artifactHash = sha(record.research);
      const sharedId = `SRA-${artifactHash.slice(0, 32)}`;
      const row = shared.get(sharedId) || {
        schema_version: 1,
        shared_artifact_id: sharedId,
        artifact_hash: artifactHash,
        authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
        mission_id: missionId,
        provider: 'openrouter',
        model_id: record.model_id,
        applicability: { unit_lineage_ids: [], mapping: 'EXACT_CONTENT_HASH_AND_VERIFIED_UNIT_BINDING' },
        claims: record.research,
        sources: { artifact_evidence_hashes: [] },
        versions: [],
        freshness: { observed_at: record.completed_at, status: 'CURRENT_AT_OBSERVATION' },
        invalidation: ['UNIT_REVISION_CHANGE', 'PROJECT_TRUTH_CHANGE', 'SOURCE_VERSION_CHANGE', 'GRAPH_GENERATION_CHANGE'],
        admission: { state: 'ADMITTED', coverage_hash: coverage.coverage_hash },
        polarities: ['POSITIVE', 'ANTI_PATTERN', 'CAUTION', 'ALTERNATIVE', 'DEPRECATED', 'SECURITY_WARNING'],
      };
      row.applicability.unit_lineage_ids.push(unitId);
      row.sources.artifact_evidence_hashes.push(record.artifact_evidence_hash);
      shared.set(sharedId, row);
    }
    for (const row of shared.values()) {
      row.applicability.unit_lineage_ids.sort();
      row.sources.artifact_evidence_hashes = [...new Set(row.sources.artifact_evidence_hashes)].sort();
      writeJsonAtomic(`knowledge/research/union-alpha/shared/${row.shared_artifact_id}.json`, row, root);
    }
    for (const [unitId, record] of unitEvidence) {
      record.coverage_hash = coverage.coverage_hash;
      record.research_hash = sha(record.research);
      record.shared_artifact_refs = [`SRA-${record.research_hash.slice(0, 32)}`];
      delete record.research;
      writeJsonAtomic(
        `knowledge/research/union-alpha/by-unit/${unitId}.json`,
        record,
        root,
      );
    }
  }
  writeJsonAtomic(
    `knowledge/research/union-alpha/missions/${missionId}/coverage.json`,
    coverage,
    root,
  );
  writeJsonAtomic('knowledge/research/union-alpha/current.json', coverage, root);
  return coverage;
}

export function researchHarvestStatus({
  root = DEFAULT_CONTROL_HOME,
} = {}) {
  return {
    current: readJson('knowledge/research/union-alpha/current.json', null, root),
  };
}

export const finalizeResearchMission = finalizeUnionAlphaResearchMission;

async function main() {
  const command = process.argv[2] || 'manifest';
  if (command === 'manifest') {
    console.log(JSON.stringify(buildResearchHarvestManifest(), null, 2));
    return;
  }
  if (command === 'coverage') {
    console.log(JSON.stringify(buildResearchCoverageManifest({ providerState: process.argv[3] || 'FREE_WINDOW_CLOSED' }), null, 2));
    return;
  }
  if (command === 'finalize') {
    console.log(JSON.stringify(finalizeUnionAlphaResearchMission({
      missionId: process.argv[3],
    }), null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
