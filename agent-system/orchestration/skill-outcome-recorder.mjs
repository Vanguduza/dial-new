import fs from 'node:fs';
import { appendFeatureMemory } from './feature-memory.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';
import { activationSummary, loadSkillActivation } from './skill-activation-store.mjs';

function now() { return new Date().toISOString(); }

export function recordSkillOutcome({
  activationId,
  packetId,
  outcome = 'UNASSESSED',
  tests = {},
  reviewFindings = {},
  skillMetrics = {},
  root = DEFAULT_CONTROL_HOME,
} = {}) {
  ensureControlLayout(root);
  const activation = loadSkillActivation(activationId, root);
  if (!activation) throw new Error(`unknown skill activation: ${activationId}`);
  if (activation.packet_id !== packetId) throw new Error('skill outcome packet does not match activation');
  const normalized = String(outcome || '').toUpperCase();
  if (!['GREEN', 'RED', 'BLOCKED', 'UNASSESSED'].includes(normalized)) throw new Error(`unsupported skill outcome: ${outcome}`);
  const record = {
    schema_version: 1,
    activation_id: activation.activation_id,
    packet_id: activation.packet_id,
    feature_ids: activation.feature_ids || [],
    task_classes: activation.task_classes || [],
    skills: activationSummary(activation)?.selected_skills || [],
    outcome: normalized,
    tests: tests && typeof tests === 'object' ? tests : {},
    review_findings: reviewFindings && typeof reviewFindings === 'object' ? reviewFindings : {},
    skill_metrics: { usefulness: 'UNASSESSED', ...((skillMetrics && typeof skillMetrics === 'object') ? skillMetrics : {}) },
    authority: 'NON_AUTHORITATIVE_PROCESS_TELEMETRY',
    recorded_at: now(),
  };
  appendJsonl('knowledge/evidence/outcomes/outcomes.jsonl', record, root);
  appendJsonl('events/skill-outcomes.jsonl', { event: 'SKILL_OUTCOME_RECORDED', activation_id: activationId, packet_id: packetId, outcome: normalized, skill_ids: record.skills.map((s) => s.skill_id), at: record.recorded_at }, root);
  writeJsonAtomic(`knowledge/evidence/outcomes/latest/${packetId}.json`, record, root);
  for (const featureId of record.feature_ids) {
    try {
      appendFeatureMemory(featureId, {
        type: 'SKILL_OUTCOME',
        text: `VEKL ${activation.activation_id} outcome=${normalized}; skills=${record.skills.map((s) => s.skill_id).join(', ') || 'none'}; usefulness remains evidence-assessed, never model-praised.`,
        refs: [`packet:${packetId}`, `activation:${activation.activation_id}`],
        source: 'VEKL_SKILL_OUTCOME',
      }, root);
    } catch {}
  }
  return record;
}

export function summarizeSkillOutcomes(root = DEFAULT_CONTROL_HOME) {
  const target = `${root}/knowledge/evidence/outcomes/outcomes.jsonl`;
  let rows = [];
  try {
    rows = fs.readFileSync(target, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch { rows = []; }
  const skills = {};
  for (const row of rows) {
    for (const skill of row.skills || []) {
      const item = skills[skill.skill_id] ?? { activations: 0, green: 0, red: 0, blocked: 0, unassessed: 0 };
      item.activations += 1;
      const key = String(row.outcome || 'UNASSESSED').toLowerCase();
      if (key in item) item[key] += 1;
      skills[skill.skill_id] = item;
    }
  }
  return { schema_version: 1, authority: 'NON_AUTHORITATIVE_PROCESS_TELEMETRY', skill_count: Object.keys(skills).length, outcome_count: rows.length, skills, observed_at: now() };
}

