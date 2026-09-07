import crypto from 'node:crypto';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, writeJsonAtomic } from './state-store.mjs';
import { assertNoSecretMaterial } from './feature-memory.mjs';

const FORBIDDEN = [
  /\b(product requirement|new feature requirement|binding product scope)\b/i,
  /\b(ledger rule|payment rule|payable value|settlement authority|price setter)\b/i,
  /\b(clinical policy|health policy|claims authority|medical decision)\b/i,
  /\b(expand permission|authority expansion|source of truth|replace source of truth)\b/i,
  /\b(migrate (?:to|from) (?:gcp|google cloud|oracle|cloudflare|supabase))\b/i,
  /\b(mark .* complete|advance .* gate|production green)\b/i,
];

function now() { return new Date().toISOString(); }
function bounded(value, max = 8000) { return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max); }

export function proposeLearnedSkill({
  root = DEFAULT_CONTROL_HOME,
  featureId = null,
  taskClass,
  title,
  lesson,
  evidenceRefs = [],
  sourceActivationIds = [],
  riskTags = [],
} = {}) {
  ensureControlLayout(root);
  const normalizedLesson = bounded(lesson, 12000);
  if (!normalizedLesson) throw new Error('learned-skill lesson is required');
  assertNoSecretMaterial({ title, lesson: normalizedLesson, evidenceRefs }, 'learned skill candidate');
  const conflict = FORBIDDEN.find((pattern) => pattern.test(normalizedLesson));
  if (conflict) throw new Error('learned-skill candidate crosses a canonical/authority boundary and must become an ADR/owner decision instead');
  const id = `lsk_${crypto.randomUUID().replaceAll('-', '')}`;
  const candidate = {
    schema_version: 1,
    candidate_id: id,
    state: 'PROPOSED',
    authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
    feature_id: featureId,
    task_class: bounded(taskClass, 160),
    title: bounded(title, 240),
    lesson: normalizedLesson,
    evidence_refs: Array.isArray(evidenceRefs) ? evidenceRefs.slice(0, 30).map((x) => bounded(x, 500)) : [],
    source_activation_ids: Array.isArray(sourceActivationIds) ? sourceActivationIds.slice(0, 20).map((x) => bounded(x, 180)) : [],
    risk_tags: Array.isArray(riskTags) ? riskTags.slice(0, 30).map((x) => bounded(x, 120)) : [],
    promotion_required: ['STATIC_SCAN_PASSED', 'EVAL_PASSED', 'MANAGER_REVIEWED', 'APPROVED'],
    vendor_mutation_allowed: false,
    created_at: now(),
  };
  writeJsonAtomic(`knowledge/learned/staged/${id}.json`, candidate, root);
  appendJsonl('events/engineering-knowledge.jsonl', { event: 'LEARNED_SKILL_PROPOSED', candidate_id: id, feature_id: featureId, task_class: candidate.task_class, at: candidate.created_at }, root);
  return candidate;
}
