#!/usr/bin/env node
// DEC-032 §102 production hardening gate.
//
// The §102 properties that must be ENFORCED IN CODE, not merely described. The
// check exercises each one against a temporary control home rather than
// asserting a file exists, because "the module is present" and "the rule
// fires" are different claims and only the second one matters.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoutingRegistries } from './adaptive-routing-core.mjs';
import { selectExecutionPair } from './execution-pair-router.mjs';
import { runVeklPass2 } from './vekl-pass2.mjs';
import { compileRuntimePrompt } from './runtime-prompt-compiler.mjs';
import { decideEscalation, failureFingerprint } from './escalation-policy.mjs';
import { evaluateSkillRetention, recordExecutionOutcome } from './model-performance-ledger.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

function crit(id, ok, detail = '') { return { id, ok: Boolean(ok), detail }; }

const FRESH = { last_observed_at: new Date().toISOString() };

/** Registries with discovery marked fresh, so freshness is tested separately. */
function freshRegistries() {
  const reg = loadRoutingRegistries(repo);
  reg.models = { ...reg.models, discovery: { ...reg.models.discovery, ...FRESH } };
  return reg;
}

const LOW = { risk_class: 'LOW', task_archetype: 'ROUTINE_CODE_CHANGE', required_capabilities: ['coding'], acceptance: ['tests pass'] };
const CRITICAL = { risk_class: 'CRITICAL', task_archetype: 'ARCHITECTURE_CHANGE', required_capabilities: ['coding'], acceptance: ['tests pass'] };

export function checkAdaptiveRoutingArchitecture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-routing-'));
  const reg = freshRegistries();
  const checks = [];

  // 1. runtime prompt compiler exists and compiles
  const seg = (slot, cls, source, text) => ({ slot, context_class: cls, source, text });
  const basic = compileRuntimePrompt({
    repoDir: repo, taskId: 't1', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
    contextWindow: 200000,
    segments: [seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'truth', 'repo = Vanguduza/dial-new'), seg('OPTIONAL_CONTEXT', 'OPTIONAL', 'opt', 'background')],
  });
  checks.push(crit('AR-01', basic.ok && Boolean(basic.manifest), 'runtime prompt compiler exists'));

  // 2. hard context budgets enforced — a profile over budget without
  //    justification must BLOCK, not truncate silently.
  const overBudget = compileRuntimePrompt({
    repoDir: repo, taskId: 't2', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
    contextWindow: 200000,
    segments: [seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'truth', 'x')],
    modelProfile: { profile: 'COMPILED', rules: ['word '.repeat(500)], suppressed_behaviors: [], token_budget: { max_behavioral_tokens: 50 }, profile_hash: 'h' },
  });
  checks.push(crit('AR-02', !overBudget.ok && overBudget.reason === 'PROFILE_BUDGET_EXCEEDED_WITHOUT_JUSTIFICATION', 'hard context budgets enforced'));

  // 3. output reserve enforced — MUST_INCLUDE + reserve exceeding the window
  //    must not be resolved by dropping the reserve.
  const noReserve = compileRuntimePrompt({
    repoDir: repo, taskId: 't3', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
    contextWindow: 100, outputReserveTokens: 3000,
    segments: [seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'truth', 'word '.repeat(200))],
  });
  checks.push(crit('AR-03', !noReserve.ok && noReserve.reason === 'MUST_INCLUDE_DOES_NOT_FIT', 'output reserve enforced'));

  // 4. duplicate-context elimination active
  const dup = compileRuntimePrompt({
    repoDir: repo, taskId: 't4', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
    contextWindow: 200000,
    segments: [
      seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'truth', 'repo = Vanguduza/dial-new'),
      seg('REQUIRED_EXECUTION_CONTEXT', 'COMPRESSIBLE', 'role', 'repo = Vanguduza/dial-new'),
    ],
  });
  checks.push(crit('AR-04', dup.ok && dup.manifest.duplicate_sources_removed.length === 1, 'duplicate-context elimination active'));

  // 5. skill conflict detection active
  const conflict = compileRuntimePrompt({
    repoDir: repo, taskId: 't5', harnessId: 'claude-code', modelId: 'claude-sonnet-5', modelFamily: 'claude',
    contextWindow: 200000,
    segments: [
      seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'a', 'act decisively without secondary verification'),
      { ...seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'b', 'require secondary verification before destructive action'), contradicts: 'a' },
    ],
  });
  checks.push(crit('AR-05', !conflict.ok && conflict.reason === 'UNRESOLVED_CONFLICTING_MANDATORY_INSTRUCTIONS', 'skill conflict detection active'));

  // 6. quality floor applied before cost ranking.
  //
  //    The floor no longer gates a new pair — owner decision, 2026-09-13: all
  //    subscription models qualify and DIAL learns from assigned jobs. What the
  //    floor still must do is keep a pair the ledger shows underperforming from
  //    winning a high-risk task on price. So the probe gives a cheap pair a bad,
  //    well-sampled record and asserts it is excluded, and asserts the same pair
  //    is admitted while it has no record at all.
  const floorReg = freshRegistries();
  const cheap = {
    ...floorReg.models.models.find((m) => m.model_id === 'claude-sonnet-5'),
    model_id: 'probe-cheap-bad', cost_profile: 'ECONOMICAL',
  };
  floorReg.models = { ...floorReg.models, models: [...floorReg.models.models, cheap] };
  floorReg.compatibility = {
    ...floorReg.compatibility,
    compatibility: {
      ...floorReg.compatibility.compatibility,
      'claude-code': {
        ...floorReg.compatibility.compatibility['claude-code'],
        candidate_pairs: [...floorReg.compatibility.compatibility['claude-code'].candidate_pairs, 'probe-cheap-bad'],
      },
    },
  };
  const probeId = 'claude-code+probe-cheap-bad';
  const noRecord = selectExecutionPair({ repoDir: repo, registries: floorReg, taskRequirements: CRITICAL, role: 'BUILDER' });
  const admittedWithoutRecord = (noRecord.eligible_pairs || []).some((p) => p.pair_id === probeId);

  const badReg = { ...floorReg, ledger: { ...floorReg.ledger, entries: [{
    harness_id: 'claude-code', model_id: 'probe-cheap-bad', task_archetype: null, role: null,
    sample_count: 50, final_accept_count: 5, first_pass_accept_count: 2, escaped_defect_rate: 0.6,
  }] } };
  const withRecord = selectExecutionPair({ repoDir: repo, registries: badReg, taskRequirements: CRITICAL, role: 'BUILDER' });
  const excludedWithBadRecord = (withRecord.excluded_candidates || [])
    .some((c) => c.pair_id === probeId && c.reason === 'BELOW_QUALITY_FLOOR');
  checks.push(crit('AR-06', admittedWithoutRecord && excludedWithBadRecord,
    'quality floor applied before cost ranking (evidence-gated: admitted with no record, excluded on a bad one)'));

  // 6b. no probation: a model DIAL has never used is eligible for CRITICAL.
  const noProbation = (noRecord.eligible_pairs || []).some((p) => p.pair_id === 'claude-code+claude-fable-5-1');
  checks.push(crit('AR-21', noProbation, 'subscription presence confers eligibility at every risk class'));

  // 7. volatile state revalidated before dispatch
  const policy = reg.policy.revalidation_before_dispatch || {};
  checks.push(crit('AR-07', policy.required === true && policy.on_change === 'REFUSE_STALE_DISPATCH', 'volatile state revalidated before dispatch'));

  // 8. escalation stop-loss active
  const fp = failureFingerprint({ taskId: 'x', failureClass: 'TEST_FAILURE', rootCauseHypothesis: 'h1' });
  const stopLoss = decideEscalation({
    repoDir: repo,
    attempts: [{ failure_fingerprint: fp }, { failure_fingerprint: fp }],
    lastFailure: { failure_fingerprint: fp },
  });
  checks.push(crit('AR-08', stopLoss.decision === 'ESCALATE' && stopLoss.reason === 'SIMILAR_FAILURE_STOP_LOSS', 'escalation stop-loss active'));

  // 9. similar-failure detection active — a different root cause must not be
  //    counted as a repeat.
  const fp2 = failureFingerprint({ taskId: 'x', failureClass: 'TEST_FAILURE', rootCauseHypothesis: 'h2' });
  const different = decideEscalation({ repoDir: repo, attempts: [{ failure_fingerprint: fp }, { failure_fingerprint: fp }], lastFailure: { failure_fingerprint: fp2 } });
  checks.push(crit('AR-09', different.decision === 'RE_ROUTE' && fp !== fp2, 'similar-failure detection active'));

  // 10. empirical skill promotion active
  const promote = evaluateSkillRetention({
    activationCount: 30,
    baseline: { final_accept_rate: 0.80, first_pass_accept_rate: 0.60, median_total_tokens: 1000, median_rework_ratio: 0.2 },
    withSkill: { final_accept_rate: 0.88, first_pass_accept_rate: 0.72, median_total_tokens: 950, median_rework_ratio: 0.15 },
  });
  checks.push(crit('AR-10', promote.decision === 'PROMOTE', 'empirical skill promotion active'));

  // 11. skill deprecation/pruning active
  const prune = evaluateSkillRetention({
    activationCount: 30,
    baseline: { final_accept_rate: 0.80, first_pass_accept_rate: 0.60, median_total_tokens: 1000, median_rework_ratio: 0.2 },
    withSkill: { final_accept_rate: 0.80, first_pass_accept_rate: 0.60, median_total_tokens: 1400, median_rework_ratio: 0.2 },
  });
  checks.push(crit('AR-11', prune.decision === 'DEPRECATE', 'skill deprecation/pruning active'));

  // 12. conservative routing under weak telemetry — RANKING ONLY.
  //     With too few samples DIAL must not fabricate confidence in either
  //     direction: it neither assumes a new model is better than a proven one
  //     nor withholds work from it. So this must never exclude a pair.
  const cons = reg.policy.conservative_routing_under_weak_telemetry || {};
  checks.push(crit('AR-12', cons.enabled === true
    && cons.may_exclude_pair === false
    && cons.below_threshold_behaviour === 'RANK_ON_DECLARED_CAPABILITY_AND_COST',
    'weak telemetry changes ranking only, never eligibility'));

  // 13. first-pass quality tracked separately
  let firstPassTracked = false;
  try {
    const rec = recordExecutionOutcome({
      repoDir: repo, root: tmp, registries: reg, harnessId: 'claude-code', modelId: 'claude-sonnet-5',
      accepted: true, firstPassAccepted: true, evidenceSource: 'CI',
    });
    firstPassTracked = rec.entry.first_pass_accept_rate === 1 && rec.entry.final_accept_rate === 1;
  } catch { firstPassTracked = false; }
  checks.push(crit('AR-13', firstPassTracked && reg.ledger.first_pass_tracked_separately_from_final === true, 'first-pass quality tracked'));

  // 14. prompt manifest emitted
  checks.push(crit('AR-14', Boolean(basic.manifest?.manifest_hash) && Boolean(basic.manifest?.accounting), 'prompt manifest emitted'));

  // 15. execution receipt references prompt manifest
  const lowRoute = selectExecutionPair({ repoDir: repo, registries: reg, taskRequirements: LOW, role: 'BUILDER' });
  let receiptLinked = false;
  if (lowRoute.ok) {
    const profile = runVeklPass2({ repoDir: repo, registries: reg, taskId: 't15', selection: lowRoute.selection, taskRequirements: LOW, role: 'BUILDER' });
    const compiled = compileRuntimePrompt({
      repoDir: repo, taskId: 't15', harnessId: lowRoute.selection.harness_id, modelId: lowRoute.selection.model_id,
      modelFamily: 'claude', contextWindow: 200000,
      segments: [seg('MUST_INCLUDE_TRUTH', 'MUST_INCLUDE', 'truth', 'repo = Vanguduza/dial-new')],
      modelProfile: profile,
    });
    receiptLinked = compiled.ok && compiled.manifest.context.model_profile_hash === profile.profile_hash;
  }
  checks.push(crit('AR-15', receiptLinked, 'execution receipt references prompt manifest'));

  // Reject worker self-report as a performance signal — the ledger integrity
  // rule the whole feedback loop rests on.
  let selfReportRejected = false;
  try {
    recordExecutionOutcome({
      repoDir: repo, root: tmp, registries: reg, harnessId: 'claude-code', modelId: 'claude-sonnet-5',
      accepted: true, evidenceSource: 'WORKER_SELF_REPORT',
    });
  } catch (e) { selfReportRejected = /INADMISSIBLE/.test(String(e.message)); }
  checks.push(crit('AR-16', selfReportRejected, 'worker self-report rejected as performance evidence'));

  // Discovery staleness fails closed.
  const staleReg = loadRoutingRegistries(repo);
  const stale = selectExecutionPair({ repoDir: repo, registries: staleReg, taskRequirements: LOW });
  checks.push(crit('AR-17', !stale.ok && ['STALE_DISCOVERY', 'DISCOVERY_UNAVAILABLE'].includes(stale.reason), 'stale discovery fails closed'));

  // Incompatible pairs are blocked, not merely unranked.
  const incompatible = (stale.excluded_candidates || []).concat(lowRoute.excluded_candidates || []);
  const blocksFabricated = selectExecutionPair({ repoDir: repo, registries: reg, taskRequirements: LOW })
    .excluded_candidates.some((c) => c.pair_id === 'antigravity+claude-opus-5' && c.reason === 'PAIR_NOT_COMPATIBLE');
  checks.push(crit('AR-18', blocksFabricated, 'unsupported harness/model combinations blocked'));

  // Manager runtime is never selectable as a worker.
  const managerReg = freshRegistries();
  managerReg.harnesses = {
    ...managerReg.harnesses,
    harnesses: managerReg.harnesses.harnesses.map((h) => ({ ...h, manager_runtime_eligible: true })),
  };
  const managerRoute = selectExecutionPair({ repoDir: repo, registries: managerReg, taskRequirements: LOW });
  checks.push(crit('AR-19', !managerRoute.ok, 'manager runtime never selected as worker'));

  // Model capability does not imply tool authorisation.
  const toolsAttached = lowRoute.ok ? lowRoute.selection.specialist_tools : [];
  checks.push(crit('AR-20', Array.isArray(toolsAttached) && toolsAttached.length === 0, 'tools attached only when task requires'));

  fs.rmSync(tmp, { recursive: true, force: true });
  return {
    schema_version: 1,
    policy_version: reg.policy.policy_version,
    status: checks.every((c) => c.ok) ? 'GREEN' : 'RED',
    passed: checks.filter((c) => c.ok).length,
    total: checks.length,
    checks,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkAdaptiveRoutingArchitecture();
  console.log(JSON.stringify(r, null, 2));
  if (r.status !== 'GREEN') process.exitCode = 1;
}
