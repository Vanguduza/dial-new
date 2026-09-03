import { archiveJson, readJson, writeJsonAtomic } from './state-store.mjs';
import { appendFeatureMemory, updateFeatureSummary } from './feature-memory.mjs';

const MAX_TEXT = 4000;
const MAX_LIST = 24;

function cleanText(value, limit = MAX_TEXT) {
  if (value == null) return null;
  const text = String(value).replace(/\u0000/g, '').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function cleanList(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_LIST).map((value) => cleanText(value, 800)).filter(Boolean);
}

export function buildHandoffCapsule(checkpoint, input = {}) {
  if (!checkpoint) throw new Error('checkpoint is required');
  return {
    schema_version: 1,
    feature_id: checkpoint.feature_id ?? null,
    objective: cleanText(input.objective),
    previous_manager: checkpoint.manager ?? input.previous_manager ?? null,
    repository: {
      commit: checkpoint.repository?.commit ?? null,
      branch: checkpoint.repository?.branch ?? null,
      dirty: Boolean(checkpoint.repository?.dirty),
      dirty_paths: checkpoint.repository?.dirty_paths ?? [],
    },
    target_gate: checkpoint.target_gate ?? null,
    last_green_gate: checkpoint.gates?.last_green ?? null,
    completed: cleanList(input.completed),
    active_unit: cleanText(input.active_unit ?? checkpoint.execution?.atomic_unit, 500),
    remaining: cleanList(input.remaining),
    important_decisions: cleanList(input.important_decisions),
    known_risks: cleanList(input.known_risks),
    failures: cleanList(input.failures),
    evidence_refs: cleanList(input.evidence_refs),
    next_action: cleanText(input.next_action ?? checkpoint.execution?.next_unit, 1200),
    session_refs: cleanList(input.session_refs),
    authority_warning: 'This capsule is continuity context only. Verify it against DIAL canon, registries, Git state, tests and evidence before acting.',
    created_at: new Date().toISOString(),
  };
}

function name(featureId) {
  return `${featureId || 'unscoped'}.json`;
}

function handoffMemoryText(capsule) {
  return [
    capsule.objective ? `Objective: ${capsule.objective}` : null,
    capsule.completed?.length ? `Completed: ${capsule.completed.join('; ')}` : null,
    capsule.active_unit ? `Active unit: ${capsule.active_unit}` : null,
    capsule.remaining?.length ? `Remaining: ${capsule.remaining.join('; ')}` : null,
    capsule.important_decisions?.length ? `Decisions: ${capsule.important_decisions.join('; ')}` : null,
    capsule.known_risks?.length ? `Risks: ${capsule.known_risks.join('; ')}` : null,
    capsule.failures?.length ? `Failures: ${capsule.failures.join('; ')}` : null,
    capsule.next_action ? `Next: ${capsule.next_action}` : null,
  ].filter(Boolean).join('\n');
}

export function saveHandoffCapsule(capsule, root) {
  const activeRel = `capsules/active/${name(capsule.feature_id)}`;
  archiveJson(activeRel, `capsules/archive/${capsule.feature_id || 'unscoped'}`, root);
  writeJsonAtomic(activeRel, capsule, root);
  writeJsonAtomic('state/active-capsule.json', {
    feature_id: capsule.feature_id,
    path: activeRel,
    created_at: capsule.created_at,
  }, root);

  if (capsule.feature_id) {
    const text = handoffMemoryText(capsule);
    if (text) {
      appendFeatureMemory(capsule.feature_id, {
        type: 'HANDOFF',
        text,
        refs: [activeRel, ...(capsule.evidence_refs ?? [])],
        source: 'handoff-capsule',
        manager: capsule.previous_manager ?? null,
      }, root);
      updateFeatureSummary(capsule.feature_id, text, root);
    }
  }
  return capsule;
}

export function loadHandoffCapsule(featureId = null, root) {
  if (featureId) return readJson(`capsules/active/${name(featureId)}`, null, root);
  const pointer = readJson('state/active-capsule.json', null, root);
  return pointer?.path ? readJson(pointer.path, null, root) : null;
}
