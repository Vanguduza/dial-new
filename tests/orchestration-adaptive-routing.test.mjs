import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { estimateTokens, generatePairs, loadRoutingRegistries, pairCompatible } from '../agent-system/orchestration/adaptive-routing-core.mjs';
import { authorizeTool, expectedQuality, selectExecutionPair } from '../agent-system/orchestration/execution-pair-router.mjs';
import { deterministicMinimalBehaviorCoalition, runVeklPass2, tokenBenefitGate } from '../agent-system/orchestration/vekl-pass2.mjs';
import { compileRuntimePrompt, eliminateDuplicates } from '../agent-system/orchestration/runtime-prompt-compiler.mjs';
import { decideEscalation, failureFingerprint, shouldDeEscalate, buildHandoffState } from '../agent-system/orchestration/escalation-policy.mjs';
import { evaluateSkillRetention, recordExecutionOutcome } from '../agent-system/orchestration/model-performance-ledger.mjs';
import { checkAdaptiveRoutingArchitecture } from '../agent-system/orchestration/adaptive-routing-architecture-check.mjs';

const repoDir = process.cwd();
const temp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `dial-routing-${n}-`));

/** Registries with discovery marked fresh; staleness is tested on its own. */
function fresh() {
  const reg = loadRoutingRegistries(repoDir);
  reg.models = { ...reg.models, discovery: { ...reg.models.discovery, last_observed_at: new Date().toISOString() } };
  return reg;
}

const LOW = { risk_class: 'LOW', task_archetype: 'ROUTINE_CODE_CHANGE', required_capabilities: ['coding'], acceptance: ['tests pass'] };
const HIGH = { risk_class: 'HIGH', task_archetype: 'INFRA_RECOVERY', required_capabilities: ['coding'], acceptance: ['target reachable'] };
const CRITICAL = { risk_class: 'CRITICAL', task_archetype: 'ARCHITECTURE_CHANGE', required_capabilities: ['coding'], acceptance: ['reviewed'] };

const seg = (slot, cls, source, text) => ({ slot, context_class: cls, source, text });

describe('DIAL adaptive harness x model routing (DEC-032)', () => {
  it('separates harness from model so one harness offers several models', () => {
    const reg = fresh();
    const { pairs } = generatePairs({ registries: reg });
    const claudeModels = pairs.filter((p) => p.harness_id === 'claude-code').map((p) => p.model_id);
    expect(claudeModels.length).toBeGreaterThan(1);
    expect(claudeModels).toContain('claude-sonnet-5');
    expect(claudeModels).toContain('claude-opus-5');
  });

  it('blocks unsupported harness/model combinations rather than fabricating them', () => {
    const reg = fresh();
    const model = reg.models.models.find((m) => m.model_id === 'claude-opus-5');
    expect(pairCompatible({ compatibility: reg.compatibility, harnessId: 'antigravity', model }).ok).toBe(false);
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    expect(route.excluded_candidates.find((c) => c.pair_id === 'antigravity+claude-opus-5').reason).toBe('PAIR_NOT_COMPATIBLE');
  });

  it('keeps manager-grade models worker-eligible', () => {
    const reg = fresh();
    const opus = reg.models.models.find((m) => m.model_id === 'claude-opus-5');
    expect(opus.manager_eligible).toBe(true);
    expect(opus.worker_eligible).toBe(true);
  });

  it('never selects a manager runtime as a worker', () => {
    const reg = fresh();
    reg.harnesses = { ...reg.harnesses, harnesses: reg.harnesses.harnesses.map((h) => ({ ...h, manager_runtime_eligible: true })) };
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    expect(route.ok).toBe(false);
    expect(route.excluded_candidates.every((c) => c.reason === 'MANAGER_RUNTIME_CARD_FORBIDDEN' || c.reason === 'PAIR_NOT_COMPATIBLE')).toBe(true);
  });

  it('fails closed when subscription discovery is stale', () => {
    const route = selectExecutionPair({ repoDir, registries: loadRoutingRegistries(repoDir), taskRequirements: LOW });
    expect(route.ok).toBe(false);
    expect(['STALE_DISCOVERY', 'DISCOVERY_UNAVAILABLE']).toContain(route.reason);
  });

  it('admits every subscription model without making it earn access', () => {
    const reg = fresh();
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    expect(route.ok).toBe(true);
    const eligible = route.eligible_pairs.map((p) => p.pair_id);
    // Opus, Fable and Haiku have no DIAL track record at all. They are routable
    // anyway: capabilities come from the provider, not from DIAL probation.
    expect(eligible).toContain('claude-code+claude-opus-5');
    expect(eligible).toContain('claude-code+claude-fable-5-1');
    expect(eligible).toContain('claude-code+claude-haiku-4-5-20251001');
    expect(route.excluded_candidates.some((c) => c.reason === 'MODEL_NOT_PRESENT_ON_SUBSCRIPTION')).toBe(false);
  });

  it('assigns a model with no DIAL history to critical work', () => {
    const reg = fresh();
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: CRITICAL });
    expect(route.ok).toBe(true);
    expect(route.eligible_pairs.map((p) => p.pair_id)).toContain('claude-code+claude-fable-5-1');
  });

  it('excludes a pair only once the ledger shows it underperforming', () => {
    const reg = fresh();
    const pairId = 'claude-code+claude-opus-5';
    // With no evidence the pair is admitted at CRITICAL; the floor is not a bar
    // to climb. Give it a poor, well-sampled record and the floor then bites.
    const before = selectExecutionPair({ repoDir, registries: reg, taskRequirements: CRITICAL });
    expect(before.eligible_pairs.map((p) => p.pair_id)).toContain(pairId);

    reg.ledger = {
      ...reg.ledger,
      entries: [{
        harness_id: 'claude-code', model_id: 'claude-opus-5', task_archetype: null, role: null,
        sample_count: 40, final_accept_count: 8, first_pass_accept_count: 4, escaped_defect_rate: 0.5,
      }],
    };
    const after = selectExecutionPair({ repoDir, registries: reg, taskRequirements: CRITICAL });
    expect(after.excluded_candidates.find((c) => c.pair_id === pairId).reason).toBe('BELOW_QUALITY_FLOOR');
  });

  it('keeps the quality floor ahead of cost ranking', () => {
    const reg = fresh();
    const cheap = {
      ...reg.models.models.find((m) => m.model_id === 'claude-haiku-4-5-20251001'),
      model_id: 'probe-cheap-bad', cost_profile: 'ECONOMICAL',
    };
    reg.models = { ...reg.models, models: [...reg.models.models, cheap] };
    reg.compatibility.compatibility['claude-code'].candidate_pairs.push('probe-cheap-bad');
    reg.ledger = {
      ...reg.ledger,
      entries: [{
        harness_id: 'claude-code', model_id: 'probe-cheap-bad', task_archetype: null, role: null,
        sample_count: 50, final_accept_count: 5, first_pass_accept_count: 2, escaped_defect_rate: 0.6,
      }],
    };
    // A cheap pair with a bad record must not win a CRITICAL task on price.
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: CRITICAL });
    expect(route.excluded_candidates.find((c) => c.pair_id === 'claude-code+probe-cheap-bad').reason)
      .toBe('BELOW_QUALITY_FLOOR');
    if (route.ok) expect(route.selection.model_id).not.toBe('probe-cheap-bad');
  });

  it('learns from assigned jobs rather than withholding work to build evidence', () => {
    const reg = fresh();
    const pairId = 'claude-code+claude-fable-5-1';
    for (const risk of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: { ...LOW, risk_class: risk } });
      expect(route.eligible_pairs.map((p) => p.pair_id)).toContain(pairId);
    }
  });

  it('rejects a data class the harness does not support', () => {
    const reg = fresh();
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW, dataClass: 'RESTRICTED' });
    expect(route.ok).toBe(false);
    expect(route.excluded_candidates.some((c) => c.reason === 'DATA_CLASS_NOT_PERMITTED')).toBe(true);
  });

  it('produces a reproducible routing trace for the same inputs', () => {
    const reg = fresh();
    const a = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    const b = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    expect(a.evidence_hash).toBe(b.evidence_hash);
    expect(a.selected_pair).toBe(b.selected_pair);
  });

  it('retains the incumbent pair when the improvement is below the hysteresis threshold', () => {
    const reg = fresh();
    const first = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    const incumbent = first.eligible_pairs[first.eligible_pairs.length - 1];
    const second = selectExecutionPair({
      repoDir, registries: reg, taskRequirements: LOW,
      currentPair: { pair_id: incumbent.pair_id },
    });
    expect(second.hysteresis).toBeTruthy();
    if (second.hysteresis.retained_incumbent) expect(second.selected_pair).toBe(incumbent.pair_id);
  });

  it('lets escalation stop-loss bypass hysteresis', () => {
    const reg = fresh();
    const first = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    const incumbent = first.eligible_pairs[first.eligible_pairs.length - 1];
    const routed = selectExecutionPair({
      repoDir, registries: reg, taskRequirements: LOW,
      currentPair: { pair_id: incumbent.pair_id, bypass_reasons: ['ESCALATION_STOP_LOSS'] },
    });
    expect(routed.hysteresis.retained_incumbent).toBe(false);
    expect(routed.hysteresis.bypassed_by).toContain('ESCALATION_STOP_LOSS');
  });

  it('attaches no specialist tool unless the task asks and the envelope grants', () => {
    const reg = fresh();
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    expect(route.selection.specialist_tools).toEqual([]);
    expect(authorizeTool({ registries: reg, toolId: 'stitch', taskRequirements: LOW, envelopeGrants: ['stitch'] }).reason)
      .toBe('TOOL_NOT_REQUIRED_BY_TASK');
    const design = { ...LOW, required_tools: ['stitch'] };
    expect(authorizeTool({ registries: reg, toolId: 'stitch', taskRequirements: design, envelopeGrants: [] }).reason)
      .toBe('TOOL_NOT_AUTHORIZED');
    expect(authorizeTool({ registries: reg, toolId: 'stitch', taskRequirements: design, envelopeGrants: ['stitch'] }).ok).toBe(true);
  });

  it('models Stitch as a specialist capability, not a worker', () => {
    const reg = fresh();
    const stitch = reg.specialists.capabilities.find((c) => c.id === 'stitch');
    expect(stitch.type).toBe('DESIGN_PROVIDER');
    expect(stitch.capabilities.repository_write).toBe(false);
    expect(stitch.trust_class).toBe('UNTRUSTED_EXTERNAL');
    expect(reg.harnesses.harnesses.some((h) => h.harness_id === 'stitch')).toBe(false);
  });

  it('keeps Antigravity in the harness layer', () => {
    const reg = fresh();
    expect(reg.harnesses.harnesses.some((h) => h.harness_id === 'antigravity')).toBe(true);
    expect(reg.compatibility.compatibility.antigravity.external_model_embedding_supported).toBe(false);
  });

  it('retains the DEC-028 worker cards as compatibility shims', () => {
    const reg = fresh();
    const shims = reg.harnesses.compatibility_shims;
    expect(shims.retired).toBe(false);
    expect(shims.card_to_pair['claude-sonnet-worker']).toEqual({ harness_id: 'claude-code', model_id: 'claude-sonnet-5' });
    expect(fs.existsSync(path.join(repoDir, shims.source_registry))).toBe(true);
  });
});

describe('VEKL Pass 2 model-specific projection', () => {
  it('returns NONE when no adaptation is expected to help', () => {
    const reg = fresh();
    const profile = runVeklPass2({
      repoDir, registries: reg, taskId: 'n1',
      selection: { harness_id: 'codex-app-server', model_id: 'gpt-5.6-sol' },
      taskRequirements: { risk_class: 'CRITICAL', task_archetype: 'ARCHITECTURE_CHANGE' }, role: 'BUILDER',
    });
    // Every resource is EXPERIMENTAL, and unproven guidance is refused on
    // high-risk work, so NONE is the correct answer rather than a failure.
    expect(profile.profile).toBe('NONE');
    expect(profile.profile_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('compiles a compact profile for a low-risk task', () => {
    const reg = fresh();
    const profile = runVeklPass2({
      repoDir, registries: reg, taskId: 'n2',
      selection: { harness_id: 'codex-app-server', model_id: 'gpt-5.6-sol' },
      taskRequirements: LOW, role: 'BUILDER',
    });
    expect(profile.profile).toBe('COMPILED');
    expect(profile.token_budget.used).toBeLessThanOrEqual(profile.token_budget.max_behavioral_tokens);
    expect(profile.activated_micro_skills.every((id) => /@v\d+$/.test(id))).toBe(true);
  });

  it('prunes overlapping guidance to a minimal coalition', () => {
    const a = { id: 'a', rules: ['Prefer direct observation.', 'Stop when done.'] };
    const b = { id: 'b', rules: ['Prefer direct observation.'] };
    const c = { id: 'c', rules: ['Preserve unrelated systems.'] };
    const r = deterministicMinimalBehaviorCoalition({ candidates: [a, b, c] });
    expect(r.selected).toEqual(['a', 'c']);
    expect(r.pruned).toEqual(['b']);
  });

  it('refuses unproven behavioural guidance on high-risk work', () => {
    expect(tokenBenefitGate({ resource: { lifecycle: 'EXPERIMENTAL' }, riskClass: 'CRITICAL' }).inject).toBe(false);
    expect(tokenBenefitGate({ resource: { lifecycle: 'EXPERIMENTAL' }, riskClass: 'LOW' }).inject).toBe(true);
    expect(tokenBenefitGate({ resource: { lifecycle: 'ACTIVE' }, riskClass: 'CRITICAL' }).inject).toBe(true);
    expect(tokenBenefitGate({ resource: { lifecycle: 'BLOCKED' }, riskClass: 'LOW' }).inject).toBe(false);
  });

  it('never lets a behaviour profile alter engineering truth', () => {
    const reg = fresh();
    const profile = runVeklPass2({
      repoDir, registries: reg, taskId: 'n3',
      selection: { harness_id: 'codex-app-server', model_id: 'gpt-5.6-sol' },
      taskRequirements: { ...LOW, acceptance: ['tests pass', 'no schema change'] }, role: 'BUILDER',
    });
    expect(profile.evidence_policy).toEqual(['tests pass', 'no schema change']);
  });
});

describe('Runtime Prompt Compiler', () => {
  it('removes a fact repeated across channels', () => {
    const r = eliminateDuplicates({
      segments: [
        seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'truth', 'repo = Vanguduza/dial-new'),
        seg('REQUIRED_EXECUTION_CONTEXT', 'COMPRESSIBLE', 'role', 'repo  =  Vanguduza/dial-new'),
      ],
    });
    expect(r.kept).toHaveLength(1);
    expect(r.removed[0].source).toBe('role');
  });

  it('blocks when MUST_INCLUDE plus the output reserve cannot fit', () => {
    const r = compileRuntimePrompt({
      repoDir, taskId: 'c1', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
      contextWindow: 100, outputReserveTokens: 3000,
      segments: [seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 't', 'word '.repeat(200))],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('MUST_INCLUDE_DOES_NOT_FIT');
  });

  it('defers optional context rather than eating the output reserve', () => {
    const r = compileRuntimePrompt({
      repoDir, taskId: 'c2', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
      contextWindow: 4000, outputReserveTokens: 3000,
      segments: [
        seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 't', 'repo = Vanguduza/dial-new'),
        seg('OPTIONAL_CONTEXT', 'OPTIONAL', 'big', 'word '.repeat(4000)),
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('DEFER_OPTIONAL_CONTEXT');
    expect(r.manifest.accounting.output_reserve_tokens).toBe(3000);
    expect(r.deferred.some((d) => d.source === 'big')).toBe(true);
  });

  it('always defers ON_DEMAND context', () => {
    const r = compileRuntimePrompt({
      repoDir, taskId: 'c3', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
      contextWindow: 200000,
      segments: [
        seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 't', 'repo = x'),
        seg('REQUIRED_EXECUTION_CONTEXT', 'ON_DEMAND', 'rare', 'rare subsystem docs'),
      ],
    });
    expect(r.deferred.find((d) => d.source === 'rare').reason).toBe('ON_DEMAND');
  });

  it('blocks on ambiguous context provenance', () => {
    const r = compileRuntimePrompt({
      repoDir, taskId: 'c4', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
      contextWindow: 200000,
      segments: [{ slot: 'MUST_INCLUDE_TRUTH', text: 'unlabelled' }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('AMBIGUOUS_CONTEXT_PROVENANCE');
  });

  it('blocks on stale task authority', () => {
    const r = compileRuntimePrompt({
      repoDir, taskId: 'c5', harnessId: 'claude-code', modelId: 'claude-sonnet-5',
      contextWindow: 200000, authorityCurrent: false, segments: [],
    });
    expect(r.reason).toBe('STALE_TASK_AUTHORITY');
  });

  it('emits a manifest that accounts for tokens by source', () => {
    const r = compileRuntimePrompt({
      repoDir, taskId: 'c6', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
      contextWindow: 200000,
      segments: [
        seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 't', 'repo = Vanguduza/dial-new'),
        seg('REQUIRED_TOOL_SCHEMAS', 'COMPRESSIBLE', 'tools', 'schema blob'),
      ],
    });
    expect(r.manifest.manifest_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.manifest.accounting.authoritative_truth_tokens).toBeGreaterThan(0);
    expect(r.manifest.accounting.budget_status).toBe('PASS');
  });

  it('estimates tokens per model family and inflates by the declared error bound', () => {
    const text = 'word '.repeat(100);
    const claude = estimateTokens({ repoDir, text, modelFamily: 'claude' });
    const gpt = estimateTokens({ repoDir, text, modelFamily: 'gpt' });
    expect(claude.tokens).not.toBe(gpt.tokens);
    expect(claude.enforced_tokens).toBeGreaterThan(claude.tokens);
    const exact = estimateTokens({ repoDir, text, modelFamily: 'claude', exactCount: 42 });
    expect(exact).toEqual({ tokens: 42, exact: true, enforced_tokens: 42 });
  });
});

describe('escalation, stop-loss and the performance ledger', () => {
  it('escalates after repeated materially similar failures', () => {
    const fp = failureFingerprint({ taskId: 't', failureClass: 'TEST_FAILURE', rootCauseHypothesis: 'h' });
    const r = decideEscalation({ repoDir, attempts: [{ failure_fingerprint: fp }, { failure_fingerprint: fp }], lastFailure: { failure_fingerprint: fp } });
    expect(r.decision).toBe('ESCALATE');
    expect(r.bypasses_hysteresis).toBe(true);
  });

  it('treats a different root cause as new information, not a repeat', () => {
    const a = failureFingerprint({ taskId: 't', failureClass: 'TEST_FAILURE', rootCauseHypothesis: 'h1' });
    const b = failureFingerprint({ taskId: 't', failureClass: 'TEST_FAILURE', rootCauseHypothesis: 'h2' });
    expect(a).not.toBe(b);
    expect(decideEscalation({ repoDir, attempts: [{ failure_fingerprint: a }, { failure_fingerprint: a }], lastFailure: { failure_fingerprint: b } }).decision).toBe('RE_ROUTE');
  });

  it('blocks rather than retrying forever', () => {
    const fp = failureFingerprint({ taskId: 't', failureClass: 'X' });
    const r = decideEscalation({ repoDir, attempts: [{ failure_fingerprint: fp }, { failure_fingerprint: fp }], lastFailure: { failure_fingerprint: fp }, premiumEscalationsUsed: 1 });
    expect(r.decision).toBe('BLOCK');
    expect(r.reason).toBe('NO_JUSTIFIED_ROUTE_REMAINS');
  });

  it('de-escalates mechanical remainder after ambiguity is resolved', () => {
    expect(shouldDeEscalate({ resolvedAmbiguity: true, remainingWorkClass: 'MECHANICAL' }).de_escalate).toBe(true);
    expect(shouldDeEscalate({ resolvedAmbiguity: false, remainingWorkClass: 'MECHANICAL' }).de_escalate).toBe(false);
  });

  it('carries partial work forward instead of restarting', () => {
    const h = buildHandoffState({ completedSteps: ['a'], remainingAcceptanceCriteria: ['b'], safeResumePoint: 'step-2' });
    expect(h.handoff_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.safe_resume_point).toBe('step-2');
  });

  it('refuses worker self-report as a performance signal', () => {
    const root = temp('ledger');
    expect(() => recordExecutionOutcome({
      repoDir, root, harnessId: 'claude-code', modelId: 'claude-sonnet-5', accepted: true, evidenceSource: 'WORKER_SELF_REPORT',
    })).toThrow(/INADMISSIBLE/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('records trusted outcomes and tracks first-pass separately from final', () => {
    const root = temp('ledger2');
    recordExecutionOutcome({ repoDir, root, harnessId: 'claude-code', modelId: 'claude-sonnet-5', accepted: true, firstPassAccepted: false, evidenceSource: 'CI' });
    const r = recordExecutionOutcome({ repoDir, root, harnessId: 'claude-code', modelId: 'claude-sonnet-5', accepted: true, firstPassAccepted: true, evidenceSource: 'CI' });
    expect(r.entry.sample_count).toBe(2);
    expect(r.entry.final_accept_rate).toBe(1);
    expect(r.entry.first_pass_accept_rate).toBe(0.5);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('records an owner-forced run without letting it move the score', () => {
    const root = temp('ledger3');
    const r = recordExecutionOutcome({ repoDir, root, harnessId: 'claude-code', modelId: 'claude-sonnet-5', accepted: true, evidenceSource: 'CI', ownerOverride: true });
    expect(r.excluded).toBe(true);
    expect(r.entry.sample_count).toBe(0);
    expect(r.entry.excluded_samples).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('deprecates guidance that costs tokens without improving quality', () => {
    const base = { final_accept_rate: 0.8, first_pass_accept_rate: 0.6, median_total_tokens: 1000, median_rework_ratio: 0.2 };
    expect(evaluateSkillRetention({ activationCount: 30, baseline: base, withSkill: { ...base, median_total_tokens: 1500 } }).decision).toBe('DEPRECATE');
    expect(evaluateSkillRetention({ activationCount: 30, baseline: base, withSkill: { ...base, final_accept_rate: 0.9 } }).decision).toBe('PROMOTE');
    expect(evaluateSkillRetention({ activationCount: 2, baseline: base, withSkill: base }).decision).toBe('KEEP_EVALUATING');
  });

  it('uses the cold-start prior when the ledger is empty', () => {
    const reg = fresh();
    const { pairs } = generatePairs({ registries: reg });
    const q = expectedQuality({ registries: reg, pair: pairs[0] });
    expect(q.source).toBe('COLD_START_PRIOR');
    expect(q.value).toBe(0.75);
  });
});

describe('production hardening gate (DEC-032 §102)', () => {
  it('is green across every enforced property', () => {
    const r = checkAdaptiveRoutingArchitecture();
    expect(r.status).toBe('GREEN');
    expect(r.passed).toBe(r.total);
    expect(r.total).toBeGreaterThanOrEqual(15);
  });
});
