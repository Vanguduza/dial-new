import fs from 'node:fs';
import { mkdtempSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveEngineeringSkills } from '../agent-system/orchestration/skill-resolver.mjs';
import { hashSkillDirectory, persistSkillActivation, verifySkillActivation } from '../agent-system/orchestration/skill-activation-store.mjs';
import { executeHermesInstruction } from '../agent-system/orchestration/hermes-runtime-executor.mjs';
import { proposeLearnedSkill } from '../agent-system/orchestration/learned-skill-curator.mjs';
import { recordSkillOutcome, summarizeSkillOutcomes } from '../agent-system/orchestration/skill-outcome-recorder.mjs';
import { readFeatureMemory } from '../agent-system/orchestration/feature-memory.mjs';
import { ensureControlLayout, readJson } from '../agent-system/orchestration/state-store.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function approvedSkill(overrides = {}) {
  return {
    schema_version: 1,
    skill_id: 'google.android.jetpack-compose.adaptive',
    display_name: 'Android Adaptive Compose',
    provider: 'google-android',
    upstream_repo: 'android/skills',
    research_reference_commit: 'research-sha',
    production_pin: 'prod-sha',
    source_path: 'jetpack-compose/adaptive',
    content_hash: 'fixture-hash',
    license: 'Apache-2.0',
    authority: 'ENGINEERING_GUIDANCE_ONLY',
    approval_state: 'APPROVED',
    risk_class: 'MEDIUM',
    task_classes: ['ANDROID_UI_IMPLEMENTATION', 'ANDROID_RESPONSIVE_LAYOUT'],
    eligible_modules: ['DIAL_CONSUMER'],
    path_triggers: ['apps/**-android/**'],
    forbidden_effects: ['CHANGE_PRODUCT_REQUIREMENTS'],
    requires_tools: [],
    conflict_tags: [],
    eval_suite: 'android-adaptive-v1',
    snapshot_rel: 'knowledge/vendor/google-android/prod-sha/jetpack-compose-adaptive',
    runtime_name: 'dial-google-android-adaptive',
    last_verified_at: new Date().toISOString(),
    ...overrides,
  };
}
function createSnapshot(root, skill = approvedSkill()) {
  const target = path.join(root, skill.snapshot_rel);
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, 'SKILL.md'), '# Adaptive Compose\nUse adaptive Compose APIs only after DIAL screen/FRC authority is known.\n');
  const hash = hashSkillDirectory(target).value;
  chmodSync(path.join(target, 'SKILL.md'), 0o444);
  chmodSync(target, 0o555);
  return { ...skill, content_hash: hash };
}
function makeRepo(featureId = 'TEST-F001') {
  const repo = temp('vekl-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  mkdirSync(path.join(repo, 'agent-system/bin'), { recursive: true });
  mkdirSync(path.join(repo, 'agent-system/engineering-knowledge/registries'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), JSON.stringify([{ feature_id: featureId }]));
  writeFileSync(path.join(repo, 'agent-system/registries/ACTIVE_WORK.json'), JSON.stringify({ feature_id: featureId, worktree: null, target_gate: 'DOMAIN_TESTED' }));
  writeFileSync(path.join(repo, 'agent-system/bin/context-get.mjs'), `console.log('CANONICAL ${featureId}');\n`);
  for (const [name, value] of [
    ['ENGINEERING_SKILL_REGISTRY.json', []],
    ['SKILL_CONFLICT_REGISTRY.json', []],
    ['SKILL_BUNDLE_REGISTRY.json', []],
    ['SKILL_PERFORMANCE_REGISTRY.json', { schema_version: 1, skills: {} }],
  ]) writeFileSync(path.join(repo, 'agent-system/engineering-knowledge/registries', name), JSON.stringify(value));
  return repo;
}

describe('VEKL deterministic skill resolution', () => {
  it('does not activate discovered-but-unqualified Android knowledge', () => {
    const skill = approvedSkill({ approval_state: 'DISCOVERED', production_pin: null, content_hash: null, snapshot_rel: null, runtime_name: null });
    const plan = resolveEngineeringSkills({
      instruction: 'Implement an adaptive Android Compose screen for a foldable.',
      affectedPaths: ['apps/consumer-android/src/main/Foo.kt'],
      registry: [skill], conflicts: [], bundles: [], performanceRegistry: { skills: {} },
    });
    expect(plan.selected_skills).toEqual([]);
    expect(plan.resolution_state).toBe('MANDATORY_APPROVED_SKILL_UNAVAILABLE');
    expect(plan.execution_allowed).toBe(false);
    expect(plan.rejected[0].reason).toBe('NOT_APPROVED:DISCOVERED');
  });

  it('selects the minimal approved Android skill and not unrelated knowledge', () => {
    const adaptive = approvedSkill();
    const analytics = approvedSkill({ skill_id: 'google.analytics.data-api', display_name: 'GA', provider: 'google', task_classes: ['GA_ANALYTICS_ADAPTER'], path_triggers: [], runtime_name: 'dial-google-ga' });
    const plan = resolveEngineeringSkills({
      instruction: 'Implement responsive Android Compose UI for tablet and foldable.',
      affectedPaths: ['apps/consumer-android/src/main/Foo.kt'],
      registry: [adaptive, analytics], conflicts: [], bundles: [], performanceRegistry: { skills: {} }, maxSkills: 3,
    });
    expect(plan.selected_skills.map((s) => s.skill_id)).toEqual(['google.android.jetpack-compose.adaptive']);
    expect(plan.task_classes).toContain('ANDROID_RESPONSIVE_LAYOUT');
  });

  it('blocks a Google Maps replacement even when it would otherwise score highly', () => {
    const maps = approvedSkill({ skill_id: 'google.maps.routing', display_name: 'Google Maps Routing', provider: 'google', task_classes: ['DELIVERY_MAPS'], path_triggers: ['packages/delivery/**'], runtime_name: 'dial-google-maps' });
    const plan = resolveEngineeringSkills({
      instruction: 'Replace the delivery routing map with Google Maps routing.',
      affectedPaths: ['packages/delivery/maps.ts'],
      registry: [maps],
      conflicts: [{ conflict_id: 'SKC-MAPS-001', skill_pattern: 'google.maps.*', dial_scope: ['DELIVERY_MAPS'], state: 'BLOCK_AUTOMATIC_ACTIVATION', reason: 'locked MapLibre/Nominatim/OSRM/VROOM', exception: 'Owner-approved architecture evaluation only.' }],
      bundles: [], performanceRegistry: { skills: {} },
    });
    expect(plan.selected_skills).toEqual([]);
    expect(plan.rejected[0].reason).toBe('CONFLICT:SKC-MAPS-001');
  });
});

describe('VEKL immutable activation and failover symmetry', () => {
  it('persists an exact manifest and refuses a modified vendor snapshot', () => {
    const root = temp('vekl-control'); ensureControlLayout(root);
    const skill = createSnapshot(root);
    const manifest = persistSkillActivation({ packetId: 'packet-12345678', missionId: 'dial-development-root', featureIds: ['TEST-F001'], plan: { policy_version: 'vekl-1.0', task_classes: ['ANDROID_UI_IMPLEMENTATION'], resolution_state: 'SELECTED_APPROVED_SKILLS', selected_skills: [{ ...skill, upstream_commit: skill.production_pin, reason: 'fixture', mode: 'GUIDANCE_ONLY' }], rejected: [], relevant_bundles: ['dial-android-screen'] }, root });
    expect(verifySkillActivation(manifest, root).ok).toBe(true);
    chmodSync(path.join(root, skill.snapshot_rel), 0o755); chmodSync(path.join(root, skill.snapshot_rel, 'SKILL.md'), 0o644);
    writeFileSync(path.join(root, skill.snapshot_rel, 'SKILL.md'), '# tampered\n');
    expect(verifySkillActivation(manifest, root).ok).toBe(false);
  });

  it('gives Sol and Sonnet the same persisted activation provenance on failover', async () => {
    const root = temp('vekl-control'); ensureControlLayout(root);
    const repo = makeRepo();
    const skill = createSnapshot(root);
    const manifest = persistSkillActivation({ packetId: 'packet-87654321', missionId: 'dial-development-root', featureIds: ['TEST-F001'], plan: { policy_version: 'vekl-1.0', task_classes: ['ANDROID_UI_IMPLEMENTATION'], resolution_state: 'SELECTED_APPROVED_SKILLS', selected_skills: [{ ...skill, upstream_commit: skill.production_pin, reason: 'fixture', mode: 'GUIDANCE_ONLY' }], rejected: [], relevant_bundles: [] }, root });
    let primaryActivation = null; let fallbackInput = null;
    const result = await executeHermesInstruction({
      repoDir: repo, root, packetId: 'packet-87654321', skillActivation: manifest, instruction: 'Continue TEST-F001 Android UI.',
      primaryRunner: async (input) => { primaryActivation = input.skillActivation; return { ok: false, state: 'PROCESS_FAILED', resolved_model: 'gpt-5.6-sol' }; },
      ensureFallback: async () => ({ eligible: true }),
      contextBuilder: async () => ({ context: 'CANONICAL TEST-F001' }),
      fallbackRunner: async (input) => { fallbackInput = input; return { event: { resolved_model: 'claude-sonnet-5' }, output: { result: 'continued' } }; },
    });
    expect(primaryActivation.activation_id).toBe(manifest.activation_id);
    expect(fallbackInput.skillActivation.activation_id).toBe(manifest.activation_id);
    expect(fallbackInput.skillBundle).toContain(manifest.activation_id);
    expect(fallbackInput.skillBundle).toContain(skill.content_hash);
    expect(result.skill_activation_id).toBe(manifest.activation_id);
  });
});

describe('VEKL learning remains non-authoritative', () => {
  it('stages a safe procedural lesson and rejects product/authority mutation', () => {
    const root = temp('vekl-control'); ensureControlLayout(root);
    const candidate = proposeLearnedSkill({ root, featureId: 'TEST-F001', taskClass: 'ANDROID_DEVICE_VERIFICATION', title: 'Device verification sequence', lesson: 'Run the existing DIAL build, install the test APK, capture synthetic-device screenshot evidence, then run the FRC-mapped tests.', evidenceRefs: ['test-run:1'] });
    expect(candidate.state).toBe('PROPOSED');
    expect(readJson(`knowledge/learned/staged/${candidate.candidate_id}.json`, null, root).authority).toBe('NON_AUTHORITATIVE_ENGINEERING_GUIDANCE');
    expect(() => proposeLearnedSkill({ root, taskClass: 'MONEY', title: 'Bad lesson', lesson: 'Create a new ledger rule and mark the payment feature complete.' })).toThrow(/authority boundary/);
  });

  it('records observable outcome telemetry separately from gate truth', () => {
    const root = temp('vekl-control'); ensureControlLayout(root);
    const manifest = persistSkillActivation({ packetId: 'packet-outcome1', missionId: 'dial-development-root', featureIds: ['TEST-F001'], plan: { policy_version: 'vekl-1.0', task_classes: ['GENERAL_DEVELOPMENT'], resolution_state: 'NO_EXTERNAL_SKILL_REQUIRED', selected_skills: [], rejected: [], relevant_bundles: [] }, root });
    const outcome = recordSkillOutcome({ activationId: manifest.activation_id, packetId: 'packet-outcome1', outcome: 'GREEN', tests: { passed: 4, failed: 0 }, root });
    expect(outcome.authority).toBe('NON_AUTHORITATIVE_PROCESS_TELEMETRY');
    expect(outcome.skill_metrics.usefulness).toBe('UNASSESSED');
    expect(readFeatureMemory('TEST-F001', {}, root).records.at(-1).type).toBe('SKILL_OUTCOME');
    expect(summarizeSkillOutcomes(root).outcome_count).toBe(1);
  });
});
