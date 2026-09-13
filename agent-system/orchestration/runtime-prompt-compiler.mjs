// Runtime Prompt Compiler (DEC-032 §86-90, §100-101).
//
// Sits between VEKL Pass 2 and dispatch. It turns every selected execution
// input into the smallest valid runtime context WITHOUT altering authoritative
// meaning. It is an execution control mechanism, not a source of truth: it may
// compress presentation, never engineering meaning.
//
// The constraint that shapes the whole module is §52: compression must reduce
// tokens without deleting authority. So MUST_INCLUDE content is never dropped
// and never compressed below safety — if it does not fit, the compiler BLOCKS
// rather than quietly shipping a prompt missing a guardrail.
import { DEFAULT_REPO_DIR, estimateTokens, hashObject, loadRoutingPolicy, nowIso, sha256 } from './adaptive-routing-core.mjs';

export const CONTEXT_CLASSES = Object.freeze(['MUST_INCLUDE', 'COMPRESSIBLE', 'ON_DEMAND', 'OPTIONAL']);
export const OUTCOMES = Object.freeze(['PASS', 'COMPRESS_MORE', 'DEFER_OPTIONAL_CONTEXT', 'RESELECT_MODEL_WITH_LARGER_CONTEXT', 'BLOCK']);

const PRIORITY = Object.freeze([
  'MUST_INCLUDE_TRUTH', 'ACCEPTANCE_CRITERIA', 'REQUIRED_EXECUTION_CONTEXT',
  'REQUIRED_TOOL_SCHEMAS', 'MODEL_SPECIFIC_PROFILE', 'OUTPUT_RESERVE', 'OPTIONAL_CONTEXT',
]);

function normaliseFact(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Duplicate elimination (§88). The same fact must not be transmitted through
 * Project Truth, task instructions, the role profile, the worker skill and the
 * execution summary. First occurrence by priority order wins; later identical
 * occurrences are removed and counted.
 */
export function eliminateDuplicates({ segments = [] } = {}) {
  const seen = new Map();
  const kept = [];
  const removed = [];
  const ordered = [...segments].sort((a, b) => {
    const pa = PRIORITY.indexOf(a.slot);
    const pb = PRIORITY.indexOf(b.slot);
    return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  });
  for (const segment of ordered) {
    const key = normaliseFact(segment.text);
    if (!key) continue;
    if (seen.has(key)) {
      removed.push({ slot: segment.slot, source: segment.source, duplicate_of: seen.get(key) });
      continue;
    }
    seen.set(key, segment.source || segment.slot);
    kept.push(segment);
  }
  return { kept, removed };
}

/**
 * Rejects mandatory instructions that contradict each other (§100). Two
 * MUST_INCLUDE segments asserting opposite requirements cannot both be
 * honoured, and picking one silently is how a safety rule gets dropped.
 */
export function detectConflicts({ segments = [], declaredConflicts = [] } = {}) {
  const unresolved = [];
  const mandatory = segments.filter((s) => s.context_class === 'MUST_INCLUDE');
  for (const conflict of declaredConflicts) {
    const a = mandatory.find((s) => s.source === conflict.a);
    const b = mandatory.find((s) => s.source === conflict.b);
    if (a && b && conflict.resolution !== 'BOTH_COMPATIBLE') {
      unresolved.push({ a: conflict.a, b: conflict.b, resolution: conflict.resolution });
    }
  }
  for (const segment of mandatory) {
    if (segment.contradicts) {
      const other = mandatory.find((s) => s.source === segment.contradicts);
      if (other) unresolved.push({ a: segment.source, b: other.source, resolution: 'UNRESOLVED_MANDATORY_CONTRADICTION' });
    }
  }
  return { ok: unresolved.length === 0, unresolved };
}

/**
 * Compiles the runtime prompt.
 *
 * `segments` each carry a slot (priority), a context_class and text. The
 * compiler never invents or rewrites text; it selects, deduplicates and defers.
 */
export function compileRuntimePrompt({
  repoDir = DEFAULT_REPO_DIR,
  taskId,
  unitRevisionHash = null,
  harnessId,
  modelId,
  modelFamily = 'default',
  contextWindow,
  segments = [],
  modelProfile = null,
  outputReserveTokens = null,
  authorityCurrent = true,
  declaredConflicts = [],
} = {}) {
  const policy = loadRoutingPolicy(repoDir);
  const reserve = Number(outputReserveTokens ?? policy.default_output_reserve_tokens ?? 3000);
  const window = Number(contextWindow ?? 0);

  const fail = (outcome, reason, extra = {}) => ({
    ok: false, outcome, reason, task_id: taskId, harness_id: harnessId, model_id: modelId,
    compiled_at: nowIso(), ...extra,
  });

  if (!authorityCurrent) return fail('BLOCK', 'STALE_TASK_AUTHORITY');

  // Provenance must be unambiguous before anything is included: a segment
  // whose origin is unknown cannot be classified, and an unclassified segment
  // cannot be safely deferred or kept.
  const unprovenanced = segments.filter((s) => !s.source || !CONTEXT_CLASSES.includes(s.context_class));
  if (unprovenanced.length) {
    return fail('BLOCK', 'AMBIGUOUS_CONTEXT_PROVENANCE', { segments: unprovenanced.map((s) => s.slot || 'UNKNOWN') });
  }

  const conflicts = detectConflicts({ segments, declaredConflicts });
  if (!conflicts.ok) return fail('BLOCK', 'UNRESOLVED_CONFLICTING_MANDATORY_INSTRUCTIONS', { unresolved: conflicts.unresolved });

  // Model-specific profile budget.
  const profileText = modelProfile && modelProfile.profile === 'COMPILED'
    ? [...(modelProfile.rules || []), ...(modelProfile.suppressed_behaviors || [])].join('\n') : '';
  const profileEst = estimateTokens({ repoDir, text: profileText, modelFamily });
  const profileLimit = Number(modelProfile?.token_budget?.max_behavioral_tokens ?? 0);
  if (profileText && profileEst.enforced_tokens > profileLimit && !modelProfile?.budget_justification) {
    return fail('BLOCK', 'PROFILE_BUDGET_EXCEEDED_WITHOUT_JUSTIFICATION', {
      profile_tokens: profileEst.enforced_tokens, profile_limit: profileLimit,
    });
  }

  const { kept, removed } = eliminateDuplicates({ segments });
  const duplicateTokens = removed.reduce((sum, r) => {
    const seg = segments.find((s) => s.source === r.source && s.slot === r.slot);
    return sum + (seg ? estimateTokens({ repoDir, text: seg.text, modelFamily }).enforced_tokens : 0);
  }, 0);

  const measured = kept.map((s) => ({ ...s, est: estimateTokens({ repoDir, text: s.text, modelFamily }) }));
  const mustInclude = measured.filter((s) => s.context_class === 'MUST_INCLUDE');
  const compressible = measured.filter((s) => s.context_class === 'COMPRESSIBLE');
  const onDemand = measured.filter((s) => s.context_class === 'ON_DEMAND');
  const optional = measured.filter((s) => s.context_class === 'OPTIONAL');

  const mustTokens = mustInclude.reduce((n, s) => n + s.est.enforced_tokens, 0);
  const floor = mustTokens + profileEst.enforced_tokens + reserve;

  // MUST_INCLUDE plus the output reserve is the irreducible floor. Below it,
  // no amount of deferral helps — a bigger context window is the only fix.
  if (window > 0 && floor > window) {
    return fail(window >= reserve ? 'RESELECT_MODEL_WITH_LARGER_CONTEXT' : 'BLOCK', 'MUST_INCLUDE_DOES_NOT_FIT', {
      must_include_tokens: mustTokens, output_reserve_tokens: reserve, context_window: window,
    });
  }

  // ON_DEMAND is deferred by definition; OPTIONAL then COMPRESSIBLE are added
  // only while the output reserve stays whole.
  let used = floor;
  const included = [...mustInclude];
  const deferred = [...onDemand.map((s) => ({ source: s.source, slot: s.slot, tokens: s.est.enforced_tokens, reason: 'ON_DEMAND' }))];

  for (const segment of [...compressible, ...optional]) {
    if (window > 0 && used + segment.est.enforced_tokens > window) {
      deferred.push({ source: segment.source, slot: segment.slot, tokens: segment.est.enforced_tokens, reason: 'BUDGET' });
      continue;
    }
    used += segment.est.enforced_tokens;
    included.push(segment);
  }

  const deferredTokens = deferred.reduce((n, d) => n + d.tokens, 0);
  const outcome = deferred.some((d) => d.reason === 'BUDGET') ? 'DEFER_OPTIONAL_CONTEXT' : 'PASS';

  const bySlot = (slot) => included.filter((s) => s.slot === slot).reduce((n, s) => n + s.est.enforced_tokens, 0);
  const accounting = {
    authoritative_truth_tokens: bySlot('MUST_INCLUDE_TRUTH') + bySlot('ACCEPTANCE_CRITERIA'),
    execution_context_tokens: bySlot('REQUIRED_EXECUTION_CONTEXT'),
    model_profile_tokens: profileEst.enforced_tokens,
    role_context_tokens: bySlot('ROLE_CONTEXT'),
    tool_schema_tokens: bySlot('REQUIRED_TOOL_SCHEMAS'),
    retained_history_tokens: bySlot('HISTORY'),
    output_reserve_tokens: reserve,
    duplicate_context_removed_tokens: duplicateTokens,
    optional_context_deferred_tokens: deferredTokens,
    budget_status: outcome === 'PASS' ? 'PASS' : outcome,
  };

  const manifestContent = {
    schema_version: 1,
    task_id: taskId,
    unit_revision_hash: unitRevisionHash,
    harness_id: harnessId,
    model_id: modelId,
    context: {
      authoritative_truth_hash: sha256(mustInclude.map((s) => s.text).join('\n')),
      execution_context_hash: sha256(included.filter((s) => s.context_class !== 'MUST_INCLUDE').map((s) => s.text).join('\n')),
      model_profile_hash: modelProfile?.profile_hash ?? null,
      role_projection_hash: sha256(included.filter((s) => s.slot === 'ROLE_CONTEXT').map((s) => s.text).join('\n')),
    },
    token_budget: {
      input_limit: window || null,
      output_reserve: reserve,
      behavior_profile_limit: profileLimit,
    },
    accounting,
    verification: {
      stale_check: 'PASS',
      conflict_check: 'PASS',
      budget_check: outcome === 'PASS' ? 'PASS' : 'DEFERRED',
    },
    included_sources: included.map((s) => s.source).sort(),
    deferred_sources: deferred.map((d) => d.source).sort(),
    duplicate_sources_removed: removed.map((r) => r.source).sort(),
    compiled_at: nowIso(),
  };

  return {
    ok: true,
    outcome,
    prompt_segments: included.map(({ est, ...s }) => s),
    model_profile: modelProfile,
    deferred,
    manifest: { ...manifestContent, manifest_hash: hashObject({ ...manifestContent, compiled_at: null }) },
  };
}
