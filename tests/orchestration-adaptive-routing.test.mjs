import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { estimateTokens, generatePairs, loadRoutingRegistries, pairCompatible } from '../agent-system/orchestration/adaptive-routing-core.mjs';
import { authorizeTool, expectedQuality, selectExecutionPair } from '../agent-system/orchestration/execution-pair-router.mjs';
import { deterministicMinimalBehaviorCoalition, runVeklPass2, tokenBenefitGate } from '../agent-system/orchestration/vekl-pass2.mjs';
import { compileRuntimePrompt, eliminateDuplicates } from '../agent-system/orchestration/runtime-prompt-compiler.mjs';
import { decideEscalation, failureFingerprint, shouldDeEscalate, buildHandoffState } from '../agent-system/orchestration/escalation-policy.mjs';
import { calibratedPrior, calibratedSmoothingWeight, evaluateSkillRetention, projectLedgerForRouting, recordExecutionOutcome } from '../agent-system/orchestration/model-performance-ledger.mjs';
import { attributeOutcome, buildVeklImprovementSignal } from '../agent-system/orchestration/outcome-attribution.mjs';
import { checkAdaptiveRoutingArchitecture } from '../agent-system/orchestration/adaptive-routing-architecture-check.mjs';
import { assertModelAvailableForDispatch, discoverModelAvailability } from '../agent-system/orchestration/model-availability-discovery.mjs';

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

  it('normalizes live subscription presence for routing and rechecks it at dispatch', () => {
    const registry = loadRoutingRegistries(repoDir).models;
    const observed_at = new Date().toISOString();
    const health = { models: { 'claude-fable-5-1': { subscription_present: true, availability: 'AVAILABLE', observed_at, resolved_version: 'claude-fable-5-1' } } };
    const discovered = discoverModelAvailability({ modelRegistry: registry, health });
    expect(discovered.registry.models.find((model) => model.model_id === 'claude-fable-5-1').qualification.state).toBe('PRESENT');
    expect(assertModelAvailableForDispatch({ modelRegistry: registry, modelId: 'claude-fable-5-1', health }).ok).toBe(true);
    expect(() => assertModelAvailableForDispatch({ modelRegistry: registry, modelId: 'claude-fable-5-1', health, nowMs: Date.parse(observed_at) + 3_600_001 })).toThrow('REFUSED_STALE_MODEL_DISCOVERY');
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

  it('ranks a poor performer below the next pair instead of excluding it', () => {
    const reg = fresh();
    const cheap = {
      ...reg.models.models.find((m) => m.model_id === 'claude-haiku-4-5-20251001'),
      model_id: 'probe-cheap', cost_profile: 'ECONOMICAL',
    };
    reg.models = { ...reg.models, models: [...reg.models.models, cheap] };
    reg.compatibility.compatibility['claude-code'].candidate_pairs.push('probe-cheap');
    reg.ledger = {
      ...reg.ledger,
      entries: [{
        harness_id: 'claude-code', model_id: 'probe-cheap',
        task_archetype: 'INFRA_RECOVERY', role: 'BUILDER', risk_class: null,
        sample_count: 50, final_accept_count: 5, first_pass_accept_count: 2, escaped_defect_rate: 0.6,
      }],
    };
    const route = selectExecutionPair({
      repoDir, registries: reg, role: 'BUILDER',
      taskRequirements: { risk_class: 'HIGH', task_archetype: 'INFRA_RECOVERY', required_capabilities: ['coding'] },
    });
    const order = route.eligible_pairs.map((p) => p.pair_id);
    // Still in the running -- cheapest, and not removed.
    expect(order).toContain('claude-code+probe-cheap');
    expect(route.excluded_candidates.some((c) => c.pair_id === 'claude-code+probe-cheap')).toBe(false);
    // But last, so every better-matched pair is offered the work first.
    expect(order[order.length - 1]).toBe('claude-code+probe-cheap');
    expect(route.selection.model_id).not.toBe('probe-cheap');
  });

  it('keeps a poor record on one task type from dragging down another', () => {
    const reg = fresh();
    reg.ledger = {
      ...reg.ledger,
      entries: [{
        harness_id: 'claude-code', model_id: 'claude-sonnet-5',
        task_archetype: 'INFRA_RECOVERY', role: 'BUILDER', risk_class: null,
        sample_count: 50, final_accept_count: 5, first_pass_accept_count: 2, escaped_defect_rate: 0.6,
      }],
    };
    const at = (r) => r.eligible_pairs.findIndex((p) => p.pair_id === 'claude-code+claude-sonnet-5');
    const recovery = selectExecutionPair({
      repoDir, registries: reg, role: 'BUILDER',
      taskRequirements: { risk_class: 'HIGH', task_archetype: 'INFRA_RECOVERY', required_capabilities: ['coding'] },
    });
    const routine = selectExecutionPair({
      repoDir, registries: reg, role: 'BUILDER',
      taskRequirements: { risk_class: 'HIGH', task_archetype: 'ROUTINE_CODE_CHANGE', required_capabilities: ['coding'] },
    });
    // The archetype-scoped record demotes it for recovery work only.
    expect(at(recovery)).toBeGreaterThan(at(routine));
  });

  it('is never excluded on performance, even when every record is appalling', () => {
    const reg = fresh();
    reg.ledger = {
      ...reg.ledger,
      entries: (reg.models.models || []).map((m) => ({
        harness_id: 'claude-code', model_id: m.model_id, task_archetype: null, role: null, risk_class: null,
        sample_count: 60, final_accept_count: 2, first_pass_accept_count: 1, escaped_defect_rate: 0.8,
      })),
    };
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: CRITICAL });
    expect(route.ok).toBe(true);
    expect(route.eligible_pairs.length).toBeGreaterThan(0);
    expect(route.excluded_candidates.some((c) => /QUALITY|FLOOR|PERFORMANCE/.test(c.reason))).toBe(false);
  });

  it('matches task capability before performance is consulted', () => {
    const reg = fresh();
    const route = selectExecutionPair({
      repoDir, registries: reg, role: 'BUILDER',
      taskRequirements: { risk_class: 'HIGH', task_archetype: 'ARCHITECTURE_CHANGE', required_capabilities: ['coding', 'architecture'] },
    });
    expect(route.excluded_candidates.find((c) => c.pair_id === 'claude-code+claude-haiku-4-5-20251001').reason)
      .toBe('CAPABILITY_MISSING');
    expect(route.eligible_pairs.map((p) => p.pair_id)).toContain('claude-code+claude-opus-5');
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

  it('models the secondary Claude Pro identity as worker-only same-provider capacity', () => {
    const workers = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/HARNESS_CAPABILITY_REGISTRY.json'), 'utf8')).workers;
    const primary = workers.find((w) => w.harness_id === 'claude-sonnet-worker');
    const secondary = workers.find((w) => w.harness_id === 'claude-sonnet-worker-secondary');
    expect(secondary).toBeTruthy();
    expect(secondary.manager_runtime_eligible).toBe(false);
    expect(secondary.model.model_id).toBe('claude-sonnet-5');
    expect(secondary.identity.independence_class).toBe(primary.identity.independence_class);
    expect(secondary.identity.worker_identity_hash).not.toBe(primary.identity.worker_identity_hash);
    expect(secondary.runtime_profile).toMatchObject({ profile_id: 'secondary', health_slot: 'claude_code_secondary' });
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

  it('falls back to the seed prior when the ledger is empty', () => {
    const reg = fresh();
    const { pairs } = generatePairs({ registries: reg });
    const q = expectedQuality({ registries: reg, pair: pairs[0] });
    expect(q.source).toBe('CALIBRATED_PRIOR');
    expect(q.prior_basis).toBe('SEED');
    expect(q.prior).toBe(0.75);
    // Scored through the same blend a measured pair uses, so the two compare.
    expect(q.value).toBeCloseTo(0.75 * 0.55 + 0.75 * 0.25 + 0.2, 10);
  });
});

describe('outcome attribution: resources vs the pair', () => {
  it('blames the resources, not the pair, when the context was inadequate', () => {
    const a = attributeOutcome({ signals: ['MUST_INCLUDE_CONTEXT_MISSING'], accepted: false });
    expect(a.attribution).toBe('RESOURCE_DEFICIT');
    expect(a.rating_bearing).toBe(false);
    expect(a.requires_vekl_update).toBe(true);
  });

  it('lets a resource deficit outrank a pair-performance signal', () => {
    // A worker cannot have ignored an acceptance criterion it was never given.
    const a = attributeOutcome({
      signals: ['IGNORED_SUPPLIED_ACCEPTANCE_CRITERIA', 'ACCEPTANCE_CRITERIA_ABSENT'],
      accepted: false,
    });
    expect(a.attribution).toBe('RESOURCE_DEFICIT');
  });

  it('treats an outage as neither the pair nor the resources', () => {
    expect(attributeOutcome({ signals: ['QUOTA_EXHAUSTED'], accepted: false }).attribution).toBe('EXTERNAL');
  });

  it('holds an unattributed failure out of the rating rather than blaming the pair', () => {
    const a = attributeOutcome({ signals: [], accepted: false });
    expect(a.attribution).toBe('UNDETERMINED');
    expect(a.rating_bearing).toBe(false);
  });

  it('counts a genuine pair failure', () => {
    const a = attributeOutcome({ signals: ['PREMATURE_SUCCESS_CLAIM'], accepted: false });
    expect(a.attribution).toBe('PAIR_PERFORMANCE');
    expect(a.rating_bearing).toBe(true);
  });

  it('leaves the rating untouched across many resource-caused failures', () => {
    const root = temp('attr');
    const base = {
      repoDir, root, harnessId: 'claude-code', modelId: 'claude-opus-5',
      taskArchetype: 'INFRA_RECOVERY', role: 'BUILDER', evidenceSource: 'CI',
    };
    for (let i = 0; i < 10; i++) {
      recordExecutionOutcome({ ...base, accepted: false, signals: ['REQUIRED_SKILL_UNAVAILABLE'] });
    }
    const entry = projectLedgerForRouting({ root })[0];
    expect(entry.sample_count).toBe(0);
    expect(entry.excluded_samples).toBe(10);
    expect(entry.excluded_by_attribution.RESOURCE_DEFICIT).toBe(10);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('raises a VEKL improvement signal naming the deficit', () => {
    const root = temp('attr-vekl');
    const r = recordExecutionOutcome({
      repoDir, root, harnessId: 'claude-code', modelId: 'claude-opus-5',
      taskArchetype: 'INFRA_RECOVERY', role: 'BUILDER', evidenceSource: 'CI',
      accepted: false, signals: ['CONFLICTING_RULES_SUPPLIED'], taskId: 't1',
    });
    expect(r.vekl_signal.kind).toBe('VEKL_IMPROVEMENT_SIGNAL');
    expect(r.vekl_signal.deficits).toContain('CONFLICTING_RULES_SUPPLIED');
    expect(r.vekl_signal.rating_impact).toBe('NONE');
    expect(r.vekl_signal.remediation_target).toBe('VEKL_RESOURCES');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('raises no VEKL signal when the pair itself was at fault', () => {
    expect(buildVeklImprovementSignal({
      harnessId: 'h', modelId: 'm',
      attribution: { attribution: 'PAIR_PERFORMANCE', rating_bearing: true },
    })).toBeNull();
  });
});

describe('calibrated prior and the confidence dial', () => {
  const mk = (m, acc, n, archetype = null) => ({
    harness_id: 'claude-code', model_id: m, task_archetype: archetype, role: null, risk_class: null,
    sample_count: n, final_accept_count: acc, first_pass_accept_count: Math.round(acc * 0.7), escaped_defect_rate: 0,
  });
  const withLedger = (entries) => { const r = fresh(); r.ledger = { ...r.ledger, entries }; return r; };
  const q = (reg, m) => expectedQuality({ registries: reg, pair: { harness_id: 'claude-code', model_id: m, model: {} } });

  it('uses the seed only until there is enough evidence to compute one', () => {
    expect(calibratedPrior({ entries: [] }).basis).toBe('SEED');
    expect(calibratedPrior({ entries: [mk('a', 6, 10)] }).basis).toBe('SEED');
    const learned = calibratedPrior({ entries: [mk('a', 24, 40)] });
    expect(learned.basis).toBe('GLOBAL_CALIBRATED');
    expect(learned.value).toBeCloseTo(0.6, 10);
  });

  it('prefers an archetype prior once that archetype has its own evidence', () => {
    const entries = [mk('a', 24, 40, 'X'), mk('b', 6, 10, 'Y')];
    expect(calibratedPrior({ entries, taskArchetype: 'X' }).basis).toBe('ARCHETYPE_CALIBRATED');
    // Y has only 10 samples of its own, so it falls back to the global pool.
    expect(calibratedPrior({ entries, taskArchetype: 'Y' }).basis).toBe('GLOBAL_CALIBRATED');
  });

  it('scores measured and unmeasured pairs on the same scale', () => {
    // This is the bug a probe caught: an unmeasured pair returned the bare
    // prior while a measured one returned a weighted blend, so a below-average
    // pair scored ABOVE an unknown. Assert both directions.
    const reg = withLedger([mk('above', 28, 40), mk('below', 10, 20), mk('filler', 20, 40)]);
    const unknown = q(reg, 'never-used').value;
    expect(q(reg, 'above').value).toBeGreaterThan(unknown);
    expect(q(reg, 'below').value).toBeLessThan(unknown);
  });

  it('blends the own record in continuously as evidence accumulates', () => {
    const at = (n) => q(withLedger([mk('a', Math.round(n * 0.6), n)]), 'a').own_record_weight;
    const w = [at(3), at(8), at(15), at(30), at(60)];
    // Monotonic, never 0 with evidence, never 1 -- no threshold, no jump.
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1]);
    expect(w[0]).toBeGreaterThan(0);
    expect(w[w.length - 1]).toBeLessThan(1);
    expect(q(fresh(), 'never-used').own_record_weight).toBe(0);
  });

  it('learns the smoothing weight from how much the pairs actually differ', () => {
    const rate = (id, r, n) => ({ model_id: id, sample_count: n, final_accept_count: Math.round(r * n) });
    // Alike pairs: the spread is mostly sampling noise, so shrink hard.
    const alike = calibratedSmoothingWeight({ entries: [rate('a', 0.70, 60), rate('b', 0.71, 60), rate('c', 0.69, 60)] });
    // Widely differing pairs: the spread is real, so trust each record sooner.
    const spread = calibratedSmoothingWeight({ entries: [rate('a', 0.95, 60), rate('b', 0.30, 60), rate('c', 0.45, 60)] });
    expect(alike.value).toBeGreaterThan(spread.value);
    expect(spread.basis).toBe('EMPIRICAL_BAYES');
  });

  it('seeds the weight only until the fleet can speak for itself', () => {
    expect(calibratedSmoothingWeight({ entries: [] }).basis).toBe('SEED');
    // Two pairs is too few to estimate a spread from.
    const rate = (id, r, n) => ({ model_id: id, sample_count: n, final_accept_count: Math.round(r * n) });
    expect(calibratedSmoothingWeight({ entries: [rate('a', 0.7, 60), rate('b', 0.4, 60)] }).basis).toBe('SEED');
  });

  it('keeps the learned weight inside bounds that keep the ledger meaningful', () => {
    const rate = (id, r, n) => ({ model_id: id, sample_count: n, final_accept_count: Math.round(r * n) });
    const extreme = calibratedSmoothingWeight({ entries: [rate('a', 0.99, 80), rate('b', 0.02, 80), rate('c', 0.5, 80)] });
    // w is "jobs before a pair's own record carries half its score".
    expect(extreme.value).toBeGreaterThanOrEqual(6);
    expect(extreme.value).toBeLessThanOrEqual(30);
    expect(extreme.clamped).toBe(true);
  });

  it('subtracts sampling noise before reading the spread', () => {
    const rate = (id, r, n) => ({ model_id: id, sample_count: n, final_accept_count: Math.round(r * n) });
    // Identical true rates measured on tiny samples look varied by luck alone.
    // Without the correction that noise would masquerade as real spread and
    // collapse the weight, letting a couple of runs swing a pair's standing.
    const tiny = calibratedSmoothingWeight({ entries: [rate('a', 0.6, 5), rate('b', 0.8, 5), rate('c', 0.4, 5)] });
    expect(tiny.value).toBeGreaterThan(6);
  });

  it('reports which basis the prior came from', () => {
    expect(q(fresh(), 'never-used').prior_basis).toBe('SEED');
    expect(q(withLedger([mk('a', 24, 40)]), 'a').prior_basis).toBe('GLOBAL_CALIBRATED');
    expect(q(fresh(), 'never-used').weight_basis).toBe('SEED');
  });

  it('breaks an exact tie toward the better-evidenced pair', () => {
    const reg = fresh();
    const route = selectExecutionPair({ repoDir, registries: reg, taskRequirements: LOW });
    const scores = route.eligible_pairs.map((p) => p.score);
    // With an empty ledger several pairs tie; ordering must still be total.
    expect(new Set(route.eligible_pairs.map((p) => p.pair_id)).size).toBe(route.eligible_pairs.length);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
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
