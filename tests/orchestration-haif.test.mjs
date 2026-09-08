import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { HERMES_RUNTIME_POLICY } from '../agent-system/orchestration/hermes-runtime-router.mjs';
import { assertAuxiliaryAuthority } from '../agent-system/orchestration/auxiliary/authority-gate.mjs';
import { assertDeterministicInputSafe, assertAssembledRequestSafe, protectAggregateRows, generalizeAggregateRows } from '../agent-system/orchestration/auxiliary/data-classification.mjs';
import { buildAuxiliaryTask, submitAuxiliaryTask } from '../agent-system/orchestration/auxiliary/task-gateway.mjs';
import { claimNextTask, beginAttempt, persistProviderResponse, persistTaskExecutionPlan, checkpointRunningTask, recoverExpiredLeases, cacheKeyForTask } from '../agent-system/orchestration/auxiliary/task-store.mjs';
import { reserveQuota, settleQuota, readAllocationLedger } from '../agent-system/orchestration/auxiliary/quota-allocator.mjs';
import { acquireProviderRateSlot, settleProviderRateSlot, providerRateStatus } from '../agent-system/orchestration/auxiliary/rate-limiter.mjs';
import { selectDiverseRoutes } from '../agent-system/orchestration/auxiliary/diversity-coordinator.mjs';
import { compareEvidencePackets, premiumAdjudicationCandidate } from '../agent-system/orchestration/auxiliary/conflict-engine.mjs';
import { normalizeCatalogModel, freeChatModels } from '../agent-system/orchestration/providers/xkiro/xkiro-catalog.mjs';
import { usageEquivalent } from '../agent-system/orchestration/providers/xkiro/xkiro-usage.mjs';
import { buildXKiroRequest } from '../agent-system/orchestration/providers/xkiro/xkiro-client.mjs';
import { qualifyXKiroTenant } from '../agent-system/orchestration/providers/xkiro/xkiro-qualification.mjs';
import { eliteCandidateIds, isEliteFreeCandidate } from '../agent-system/orchestration/providers/xkiro/elite-model-policy.mjs';
import { qualificationCandidates } from '../agent-system/orchestration/providers/xkiro/xkiro-model-router.mjs';
import { benchmarkEliteModels } from '../agent-system/orchestration/providers/xkiro/elite-benchmark.mjs';
import { loadPerformanceLedger } from '../agent-system/orchestration/auxiliary/model-performance-ledger.mjs';
import { isDirectEntrypoint } from '../agent-system/orchestration/auxiliary/haif-tenant-daemon.mjs';
import { r2ConfigFromEnv, r2ConfigStatus, r2ObjectKey, putR2Evidence } from '../agent-system/orchestration/auxiliary/r2-evidence-store.mjs';
import { runOneAuxiliaryTask } from '../agent-system/orchestration/auxiliary/tenant-service.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function publicTask(project = 'dial', archetype = project === 'dial' ? 'SUPPLIER_RESEARCH' : 'VEKL_SYNTHESIS') {
  return buildAuxiliaryTask({
    project, taskArchetype: archetype, purpose: 'Compare admitted public evidence.',
    evidence: { source_id: 's1', text: 'Public manufacturer documentation.' },
    evidenceRefs: ['s1'], dataClass: 'PUBLIC', diversity: 'S1',
  });
}
function headers(values = {}) { return { get(name) { return values[String(name).toLowerCase()] ?? null; } }; }
function response(status, body, hdrs = {}) {
  return { ok: status >= 200 && status < 300, status, headers: headers(hdrs), async json() { return body; } };
}

describe('HAIF authority and data boundary', () => {
  it('never becomes a third Hermes development runtime', () => {
    expect(HERMES_RUNTIME_POLICY.map((x) => x.requested_model)).toEqual(['gpt-5.6-sol', 'claude-sonnet-5']);
    expect(JSON.stringify(HERMES_RUNTIME_POLICY).toLowerCase()).not.toContain('xkiro');
  });

  it('rejects repository mutation, manager work and non-free routing', () => {
    const task = publicTask(); task.purpose = 'commit repository source code';
    expect(() => assertAuxiliaryAuthority(task, { expectedProject: 'dial' })).toThrow(/boundary/);
    const manager = publicTask(); manager.purpose = 'occupy manager chair';
    expect(() => assertAuxiliaryAuthority(manager)).toThrow(/boundary/);
    const paid = publicTask(); paid.budget_policy = 'PAID_ALLOWED';
    expect(() => assertAuxiliaryAuthority(paid)).toThrow(/FREE_ONLY/);
  });

  it('fails closed on secrets and restricted input and protects sparse cohorts', () => {
    const root = temp('haif-data');
    expect(() => assertDeterministicInputSafe({ dataClass: 'PUBLIC', evidence: 'API_KEY=secretvalue123456', root })).toThrow(/secret/);
    expect(() => assertDeterministicInputSafe({ dataClass: 'RESTRICTED', evidence: 'safe', root })).toThrow(/RESTRICTED/);
    expect(() => assertDeterministicInputSafe({ dataClass: 'INTERNAL_SANITIZED', evidence: 'safe', root })).toThrow(/governance/);
    expect(protectAggregateRows([{ region: 'A', count: 2 }, { region: 'B', count: 8 }], { dimensionKeys: ['region'] }))
      .toEqual([{ region: '[SUPPRESSED]', count: '<5', suppressed: true }, { region: 'B', count: 8 }]);
  });

  it('runs a final assembled-request egress DLP pass', () => {
    const root = temp('haif-egress'); const task = publicTask();
    const body = buildXKiroRequest({ task, modelId: 'vendor/free-model' });
    expect(assertAssembledRequestSafe({ task, requestBody: body, root }).safe).toBe(true);
    body.messages.push({ role: 'user', content: 'Bearer abcdefghijklmnopqrstuvwxyz' });
    expect(() => assertAssembledRequestSafe({ task, requestBody: body, root })).toThrow(/egress DLP/);
  });

  it('generalizes sanitized aggregates and rejects row-level identifiers', () => {
    const rows = generalizeAggregateRows(
      [{ region: 'Harare CBD', month_end: '2026-09-08T15:22:11Z', age_band: '35-39', count: 8 }],
      { timestampKeys: ['month_end'], quasiIdentifierKeys: ['age_band'] },
    );
    expect(rows[0].month_end).toBe('2026-09');
    expect(rows[0].age_band).toBe('[GENERALIZED]');
    const root = temp('haif-internal');
    fs.mkdirSync(path.join(root, 'operations/auxiliary'), { recursive: true });
    writeFileSync(path.join(root, 'operations/auxiliary/provider-governance.json'), JSON.stringify({ state: 'APPROVED', non_public_authorized: true, valid_until: '2099-01-01T00:00:00Z' }));
    expect(() => assertDeterministicInputSafe({ dataClass: 'INTERNAL_SANITIZED', evidence: [{ customer_id: 'c1', count: 10 }], root })).toThrow(/identifier/);
  });
});

describe('HAIF restart safety and account quota', () => {
  it('uses idempotent task identity and deterministic cache keys', () => {
    const root = temp('haif-task'); const task = publicTask();
    const options = { project: task.project, taskArchetype: task.task_archetype, purpose: task.purpose, evidence: task.evidence, evidenceRefs: task.evidence_refs, dataClass: task.data_class };
    const first = submitAuxiliaryTask(options, { root, expectedProject: 'dial' });
    const second = submitAuxiliaryTask(options, { root, expectedProject: 'dial' });
    expect(second.reused).toBe(true);
    expect(second.task.task_id).toBe(first.task.task_id);
    expect(cacheKeyForTask(second.task)).toBe(cacheKeyForTask(first.task));
  });

  it('parks an uncertain provider outcome after worker loss rather than blind replay', () => {
    const root = temp('haif-recovery'); const task = publicTask();
    submitAuxiliaryTask({ project: 'dial', taskArchetype: 'SUPPLIER_RESEARCH', purpose: task.purpose, evidence: task.evidence, evidenceRefs: task.evidence_refs }, { root, expectedProject: 'dial' });
    const claimed = claimNextTask({ root, workerId: 'test', leaseMs: 1 });
    const attempt = beginAttempt(claimed, { root, requestBody: { stable: true }, modelId: 'vendor/free' });
    const attemptPath = path.join(root, 'operations/auxiliary/attempts', `${attempt.attempt_id}.json`);
    const record = JSON.parse(fs.readFileSync(attemptPath, 'utf8')); record.started_at = new Date(Date.now() - 180000).toISOString();
    writeFileSync(attemptPath, JSON.stringify(record));
    const recovered = recoverExpiredLeases({ root, nowMs: Date.now() + 10_000 });
    expect(recovered[0].action).toBe('PARK_UNCERTAIN_PROVIDER_OUTCOME');
  });

  it('reconciles a persisted provider response after worker loss without repeating inference', async () => {
    const root = temp('haif-reconcile'); const providerRoot = path.join(root, 'provider');
    const keyFile = path.join(root, 'secrets/xkiro-api.key'); fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    writeFileSync(keyFile, 'sk-xt-test-secret-123456789\n', { mode: 0o600 });
    const submitted = submitAuxiliaryTask({
      project: 'dial', taskArchetype: 'SUPPLIER_RESEARCH', purpose: 'Compare admitted public evidence.',
      evidence: { source_id: 's1', text: 'Public manufacturer documentation.' }, evidenceRefs: ['s1'],
    }, { root, expectedProject: 'dial' });
    let claimed = claimNextTask({ root, workerId: 'dead-worker', leaseMs: 1 });
    const route = { model_id: 'minimax/minimax-m3:free', route_provider: 'xkiro', provider_family: 'minimax', base_model_family: 'minimax', independence_class: 'family:minimax' };
    claimed = persistTaskExecutionPlan(claimed, { root, routes: [route], strategy: 'S1', diversityStrength: 'SINGLE', catalogSnapshotId: 'cat-1', usageSnapshotId: 'usage-1' });
    const attempt = beginAttempt({ ...claimed, attempt_id: '11111111-1111-4111-8111-111111111111' }, {
      root, requestBody: { model: route.model_id, messages: [] }, modelId: route.model_id, route,
      catalogSnapshotId: 'cat-1', usageSnapshotId: 'usage-1', egressSha256: 'a'.repeat(64),
    });
    persistProviderResponse(attempt.attempt_id, { root, status: 200, providerRequestId: 'provider-1', payload: {
      id: 'provider-1', model: route.model_id,
      choices: [{ message: { content: JSON.stringify({ claims: [{ claim: 'Public fact', evidence_refs: ['s1'], confidence: 1 }], contradictions: [], unknowns: [], recommended_followups: [] }) } }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    } });
    checkpointRunningTask(submitted.task.task_id, { lease_expires_at: new Date(Date.now() - 1000).toISOString() }, root);
    let providerCalls = 0;
    const result = await runOneAuxiliaryTask({ project: 'dial', root, providerRoot, keyFile, fetchImpl: async () => { providerCalls += 1; throw new Error('provider must not be called during reconciliation'); } });
    expect(result.state).toBe('COMPLETED');
    expect(result.reconciled).toBe(true);
    expect(providerCalls).toBe(0);
    expect(result.task.evidence.packets).toHaveLength(1);
    expect(result.task.evidence.packets[0].model).toBe(route.model_id);
  });

  it('keeps quota ledgers account-local instead of sharing DIAL and DDE capacity', () => {
    const dialRoot = temp('haif-dial-account'); const ddeRoot = temp('haif-dde-account');
    const usage = { free_tokens: { limit_per_day: 5_000_000, used_today: 0, remaining: 5_000_000 } };
    const a = reserveQuota({ project: 'dial', estimatedTokens: 1000, usagePayload: usage, accountRoot: dialRoot, taskId: 'd1' });
    const b = reserveQuota({ project: 'dde', estimatedTokens: 2000, usagePayload: usage, accountRoot: ddeRoot, taskId: 'e1' });
    expect(a.admitted).toBe(true); expect(b.admitted).toBe(true);
    expect(readAllocationLedger(dialRoot).account_scope).toBe('dial');
    expect(readAllocationLedger(ddeRoot).account_scope).toBe('dde');
    settleQuota({ reservationId: a.reservation_id, actualTokens: 100, accountRoot: dialRoot });
    expect(readAllocationLedger(ddeRoot).actual).toBe(0);
  });
  it('enforces account-local RPM, TPM and concurrency ceilings', () => {
    const root = temp('haif-rate');
    const policy = { max_requests_per_minute: 2, max_tokens_per_minute: 100, max_concurrency: 1 };
    const first = acquireProviderRateSlot({ accountRoot: root, estimatedTokens: 40, requestId: 'r1', policy, nowMs: 100000 });
    expect(first.admitted).toBe(true);
    const concurrent = acquireProviderRateSlot({ accountRoot: root, estimatedTokens: 40, requestId: 'r2', policy, nowMs: 100001 });
    expect(concurrent.reason).toBe('PROVIDER_CONCURRENCY_LIMIT');
    settleProviderRateSlot({ accountRoot: root, reservationId: first.reservation_id, actualTokens: 40, nowMs: 100010 });
    const second = acquireProviderRateSlot({ accountRoot: root, estimatedTokens: 50, requestId: 'r2', policy, nowMs: 100020 });
    expect(second.admitted).toBe(true);
    settleProviderRateSlot({ accountRoot: root, reservationId: second.reservation_id, actualTokens: 50, nowMs: 100030 });
    const rpm = acquireProviderRateSlot({ accountRoot: root, estimatedTokens: 1, requestId: 'r3', policy, nowMs: 100040 });
    expect(rpm.reason).toBe('PROVIDER_RPM_LIMIT');
    expect(providerRateStatus(root, { policy, nowMs: 100040 }).tokens_last_minute).toBe(90);
  });
});

describe('HAIF diversity and evidence conflict', () => {
  const route = (id, family, klass) => ({
    model_id: id, access_tier: 'free', haif_status: 'APPROVED', approved_archetypes: ['SUPPLIER_RESEARCH'],
    context_length: 200000, capabilities: { reasoning: true, tools: false, vision: false },
    base_model_family: family, independence_class: klass, health_state: 'CLOSED', performance: { SUPPLIER_RESEARCH: { score: 1 } },
  });

  it('prefers distinct independence classes for S2/S3', () => {
    const picked = selectDiverseRoutes([route('a','family-a','class-a'), route('b','family-b','class-b'), route('c','family-c','class-c')], { archetype: 'SUPPLIER_RESEARCH', strategy: 'S3', requiredCapabilities: { reasoning: true } });
    expect(picked.routes).toHaveLength(3);
    expect(picked.diversity_strength).toBe('STRONG');
  });

  it('does not equate model agreement with truth and emits typed S4 candidates only', () => {
    const packets = [
      { task_id: 't', model: 'a', independence_class: 'class-a', input_evidence_refs: ['s1'], claims: [{ claim_key: 'k', claim: 'yes', evidence_refs: ['s1'] }] },
      { task_id: 't', model: 'b', independence_class: 'class-b', input_evidence_refs: ['s2'], claims: [{ claim_key: 'k', claim: 'no', evidence_refs: ['s2'] }] },
    ];
    const conflict = compareEvidencePackets(packets);
    expect(conflict.model_agreement_is_truth).toBe(false);
    expect(conflict.premium_adjudication_required).toBe(true);
    const candidate = premiumAdjudicationCandidate({ project: 'dial', taskId: 't', packets, conflict });
    expect(candidate.type).toBe('PREMIUM_ADJUDICATION_CANDIDATE');
    expect(candidate.route_requirement).toBe('EXISTING_AUTHORIZED_PROJECT_ROUTER_ONLY');
    expect(candidate.direct_premium_credentials_allowed).toBe(false);
  });
});

describe('xKiro elite-only contract and qualification', () => {
  it('normalizes free catalogue metadata without granting approval', () => {
    const model = normalizeCatalogModel({ id: 'vendor/model:free', access_tier: 'free', context_length: 100000, max_output_tokens: 4096, capabilities: { reasoning: true, tools: true, vision: false }, pricing: { input: 0, output: 0 }, owned_by: 'vendor' });
    expect(model.access_tier).toBe('free');
    expect(model.haif_status).toBe('DISCOVERED');
    expect(model.independence_class).toBe('family:vendor');
    expect(freeChatModels({ models: [model] })).toHaveLength(1);
  });

  it('restricts qualification to the explicit elite candidate set', () => {
    expect(eliteCandidateIds()).toContain('minimax/minimax-m3:free');
    expect(isEliteFreeCandidate('weak/free-model')).toBe(false);
    const catalog = { models: [
      normalizeCatalogModel({ id: 'weak/free-model', access_tier: 'free', context_length: 100000, max_output_tokens: 4096, capabilities: {}, owned_by: 'weak' }),
      normalizeCatalogModel({ id: 'minimax/minimax-m3:free', access_tier: 'free', context_length: 1000000, max_output_tokens: 65536, capabilities: { reasoning: true }, owned_by: 'minimax' }),
    ] };
    expect(qualificationCandidates(catalog).map((x) => x.model_id)).toEqual(['minimax/minimax-m3:free']);
  });

  it('treats usage equality as an observation, not key identity', () => {
    const a = { plan: null, free_tokens: { limit_per_day: 5, used_today: 1, remaining: 4 } };
    expect(usageEquivalent(a, structuredClone(a))).toBe(true);
  });

  it('qualifies only a FREE_ONLY public elite route and persists no key material', async () => {
    const root = temp('haif-qualify'); const providerRoot = path.join(root, 'operations/auxiliary/provider');
    const keyFile = path.join(root, 'secrets/xkiro-api.key'); fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    writeFileSync(keyFile, 'sk-xt-test-secret-123456789\n', { mode: 0o600 });
    const fetchImpl = async (url) => {
      if (String(url).endsWith('/models')) return response(200, { object: 'list', data: [{ id: 'minimax/minimax-m3:free', access_tier: 'free', context_length: 1000000, max_output_tokens: 65536, capabilities: { reasoning: true }, pricing: { input: 0, output: 0 }, owned_by: 'minimax' }] });
      if (String(url).endsWith('/usage')) return response(200, { object: 'usage', plan: null, windows: [], free_tokens: { used_today: 0, limit_per_day: 5000000, remaining: 5000000 }, wallet: { balance_usd: '0.000000', held_usd: '0.000000' } });
      if (String(url).endsWith('/chat/completions')) return response(200, { id: 'req1', model: 'minimax/minimax-m3:free', choices: [{ message: { content: '{"claims":[],"contradictions":[],"unknowns":[],"recommended_followups":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } });
      throw new Error(`unexpected URL ${url}`);
    };
    const artifact = await qualifyXKiroTenant({ project: 'dial', root, providerRoot, keyFile, fetchImpl });
    expect(artifact.status).toBe('PUBLIC_ONLY_TRANSPORT_QUALIFIED');
    expect(artifact.canary.resolved_model).toBe('minimax/minimax-m3:free');
    expect(artifact.model_policy.production_requires_benchmark_promotion).toBe(true);
    expect(JSON.stringify(artifact)).not.toContain('sk-xt-test-secret');
    expect((statSync(keyFile).mode & 0o777).toString(8)).toBe('600');
  });

  it('promotes only elite models that pass all numerical benchmark gates', async () => {
    const root = temp('haif-benchmark'); const providerRoot = path.join(root, 'operations/auxiliary/provider');
    const keyFile = path.join(root, 'secrets/xkiro-api.key'); fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    writeFileSync(keyFile, 'sk-xt-test-secret-123456789\n', { mode: 0o600 });
    const model = 'minimax/minimax-m3:free';
    const fetchImpl = async (url, options = {}) => {
      if (String(url).endsWith('/models')) return response(200, { object: 'list', data: [{ id: model, access_tier: 'free', context_length: 1000000, max_output_tokens: 65536, capabilities: { reasoning: true }, pricing: { input: 0, output: 0 }, owned_by: 'minimax' }] });
      if (String(url).endsWith('/usage')) return response(200, { object: 'usage', free_tokens: { used_today: 0, limit_per_day: 5000000, remaining: 5000000 }, wallet: { balance_usd: '0.000000' } });
      if (String(url).endsWith('/chat/completions')) {
        const body = JSON.parse(options.body); const text = body.messages?.[1]?.content ?? '';
        const source = text.match(/benchmark-source-\d+/)?.[0] ?? 'benchmark-source-1';
        const value = text.match(/VALUE_\d{2}/)?.[0] ?? 'VALUE_01';
        return response(200, { id: 'bench', model, choices: [{ message: { content: JSON.stringify({ claims: [{ claim: value, claim_key: 'fact_value', evidence_refs: [source], confidence: 1 }], contradictions: [], unknowns: [], recommended_followups: [] }) } }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } });
      }
      throw new Error(`unexpected URL ${url}`);
    };
    const result = await benchmarkEliteModels({ project: 'dial', root, providerRoot, keyFile, archetype: 'SUPPLIER_RESEARCH', fetchImpl });
    expect(result.champion).toBe(model);
    const record = loadPerformanceLedger(root).routes[`${model}::SUPPLIER_RESEARCH`];
    expect(record.state).toBe('CHAMPION');
    expect(record.samples).toHaveLength(12);
  });
});

describe('HAIF R2 evidence mirror isolation', () => {
  it('builds project-scoped content-addressed keys and never reports secret material', async () => {
    const config = r2ConfigFromEnv({ HAIF_R2_ACCOUNT_ID: 'acct', HAIF_R2_BUCKET: 'dial-haif-evidence', HAIF_R2_ACCESS_KEY_ID: 'access-id', HAIF_R2_SECRET_ACCESS_KEY: 'super-secret-value' });
    expect(r2ConfigStatus(config)).toEqual(expect.objectContaining({ configured: true, bucket: 'dial-haif-evidence', material_exposed: false }));
    expect(r2ObjectKey({ project: 'dial', taskId: 't1', contentHash: 'abc' })).toBe('haif/dial/evidence/t1/abc.json');
    let seen = null;
    const fetchImpl = async (url, options) => { seen = { url, options }; return { ok: true, status: 200, headers: headers({ etag: 'etag-1' }) }; };
    const result = await putR2Evidence({ config, project: 'dial', taskId: 't1', evidence: { authority: 'NON_AUTHORITATIVE_AUXILIARY_EVIDENCE' }, fetchImpl });
    expect(result.state).toBe('MIRRORED');
    expect(seen.url).toContain('/dial-haif-evidence/haif/dial/evidence/t1/');
    expect(seen.options.body).not.toContain('super-secret-value');
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
  });
});

describe('HAIF daemon entrypoint', () => {
  it('recognizes a symlinked installed runtime path as the direct entrypoint', () => {
    const root = temp('haif-entrypoint');
    const target = path.join(root, 'daemon.mjs');
    const link = path.join(root, 'current-daemon.mjs');
    fs.writeFileSync(target, 'export default true;\n');
    fs.symlinkSync(target, link);
    expect(isDirectEntrypoint(link, `file://${target}`)).toBe(true);
  });
});

describe('HAIF shared-runtime deployment isolation', () => {
  it('installs project-scoped services with reciprocal inaccessible roots', () => {
    const installer = fs.readFileSync('deploy/oracle/hermes-codex/install-haif.sh', 'utf8');
    expect(installer).toContain('Environment=HAIF_PROJECT=dial');
    expect(installer).toContain('Environment=HAIF_PROJECT=dde');
    expect(installer).toContain('InaccessiblePaths=/home/ubuntu/.dde-control');
    expect(installer).toContain('InaccessiblePaths=/var/lib/dial-control');
    expect(installer).toContain('UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY');
    expect(installer).toContain('ConditionPathExists=/var/lib/dial-control/secrets/xkiro-api.key');
    expect(installer).toContain('ConditionPathExists=/home/ubuntu/.dde-control/secrets/xkiro-api.key');
  });
});
