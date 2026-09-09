import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../../state-store.mjs';
import { fetchXKiroCatalog, persistCatalogSnapshot } from './xkiro-catalog.mjs';
import { fetchXKiroUsage, persistUsageSnapshot } from './xkiro-usage.mjs';
import { qualificationCandidates } from './xkiro-model-router.mjs';
import { ELITE_FREE_MODEL_POLICY_VERSION, eliteCandidateIds } from './elite-model-policy.mjs';
import { buildXKiroRequest, callXKiroChat } from './xkiro-client.mjs';
import { assertAssembledRequestSafe } from '../../auxiliary/data-classification.mjs';

function now() { return new Date().toISOString(); }

function persistQualificationArtifact(artifact, root, { history = false } = {}) {
  writeJsonAtomic(`operations/auxiliary/qualification/xkiro-${artifact.project}-latest.json`, artifact, root);
  if (history) {
    const dir = path.join(root, 'operations', 'auxiliary', 'qualification', 'history');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = String(artifact.completed_at ?? artifact.observed_at ?? now()).replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(dir, `xkiro-${artifact.project}-${stamp}.json`), `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  }
  return artifact;
}

export function readSecureXKiroKey(keyFile) {
  const stat = fs.statSync(keyFile);
  if (!stat.isFile()) throw new Error('xKiro key path is not a file');
  if ((stat.mode & 0o077) !== 0) throw new Error('xKiro key file permissions must be 0600');
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  if (key.length < 16) throw new Error('xKiro key is missing or invalid');
  return key;
}

export function xkiroSecretStatus(keyFile) {
  try {
    const stat = fs.statSync(keyFile);
    return { configured: stat.isFile() && stat.size > 0, mode: (stat.mode & 0o777).toString(8).padStart(3, '0'), secure: stat.isFile() && (stat.mode & 0o077) === 0 };
  } catch { return { configured: false, mode: null, secure: false }; }
}

export async function qualifyXKiroTenant({ project, root, providerRoot, keyFile, fetchImpl = globalThis.fetch } = {}) {
  if (!['dial', 'dde'].includes(project)) throw new Error('xKiro qualification project must be dial or dde');
  const observedAt = now();
  const secret = xkiroSecretStatus(keyFile);
  const catalog = await fetchXKiroCatalog({ fetchImpl });
  persistCatalogSnapshot(catalog, providerRoot);
  const artifact = {
    schema_version: 2, provider: 'xkiro', project, observed_at: observedAt,
    provider_contract: {
      base_url: 'https://api.xkiro.com/v1', catalog_public: true,
      usage_requires_key: true, free_only_client_policy: true,
      blocking_request_dedup_expected: true, tools_allowed: false,
    },
    model_policy: {
      version: ELITE_FREE_MODEL_POLICY_VERSION,
      discovery_model_count: catalog.model_count,
      discovery_free_model_count: catalog.free_model_count,
      elite_candidate_ids: eliteCandidateIds(),
      production_requires_benchmark_promotion: true,
    },
    catalog: { snapshot_id: catalog.catalog_snapshot_id, model_count: catalog.model_count, free_model_count: catalog.free_model_count },
    secret: { ...secret, material_exposed: false },
    usage: null, canary: null,
    billing_guard: { client_free_only: true, provider_side_zero_spend: 'REQUIRES_CONSOLE_VERIFICATION' },
    data_governance: { state: 'PUBLIC_ONLY', non_public_authorized: false },
    status: 'AUTHENTICATED_PROOFS_PENDING',
  };
  if (!secret.configured || !secret.secure) return persistQualificationArtifact(artifact, root);
  const key = readSecureXKiroKey(keyFile);
  let usage;
  try {
    usage = await fetchXKiroUsage({ apiKey: key, fetchImpl });
  } catch (error) {
    artifact.authentication = { verified: false, category: error?.category ?? 'PROVIDER_ERROR' };
    artifact.status = error?.category === 'AUTH_FAILED' ? 'AUTHENTICATION_FAILED' : 'AUTHENTICATED_PROOFS_FAILED';
    artifact.completed_at = now();
    return persistQualificationArtifact(artifact, root, { history: true });
  }
  artifact.authentication = { verified: true, category: null };
  persistUsageSnapshot(usage, providerRoot);
  artifact.usage = { snapshot_id: usage.usage_snapshot_id, plan: usage.plan, free_tokens: usage.free_tokens, wallet: usage.wallet };
  const candidates = qualificationCandidates(catalog, { requiredCapabilities: {}, limit: 12 });
  if (!candidates.length) throw new Error('xKiro catalog has no elite free chat model available for qualification');
  const task = {
    task_id: crypto.randomUUID(), attempt_id: crypto.randomUUID(), project,
    task_archetype: project === 'dial' ? 'SUPPLIER_RESEARCH' : 'VEKL_SYNTHESIS',
    authority: 'NON_AUTHORITATIVE_AUXILIARY', budget_policy: 'FREE_ONLY', data_class: 'PUBLIC',
    purpose: 'HAIF transport qualification only', evidence_refs: ['qualification-source'],
    evidence: { source_id: 'qualification-source', text: 'The admitted public source says HAIF transport is being tested.' },
    max_output_tokens: 256, required_capabilities: { tools: false },
  };
  const rejected = [];
  let selected = null;
  let result = null;
  for (const candidate of candidates) {
    const requestBody = buildXKiroRequest({ task, modelId: candidate.model_id });
    assertAssembledRequestSafe({ task, requestBody, root, maxBytes: 200_000 });
    try {
      const candidateResult = await callXKiroChat({ apiKey: key, requestBody, fetchImpl, maxAttempts: 1, timeoutMs: 60000, rateLimit: { accountRoot: path.join(providerRoot, 'xkiro', 'rate'), estimatedTokens: 2500, requestId: task.task_id } });
      if (candidateResult.model !== candidate.model_id) throw new Error('xKiro qualification model identity mismatch');
      selected = candidate;
      result = candidateResult;
      break;
    } catch (error) {
      rejected.push({ model_id: candidate.model_id, category: error?.category ?? 'PROVIDER_ERROR', status: error?.status ?? null });
      if (!['ROUTE_INELIGIBLE', 'PAID_CAPACITY_REQUIRED', 'REQUEST_REJECTED'].includes(error?.category)) throw error;
    }
  }
  if (!selected || !result) throw new Error('no currently usable elite FREE_ONLY xKiro route completed the qualification canary');
  artifact.canary = {
    completed: true, requested_model: selected.model_id, resolved_model: result.model,
    provider_request_id_present: Boolean(result.provider_request_id),
    input_tokens: Number(result.usage?.prompt_tokens ?? 0) || 0,
    output_tokens: Number(result.usage?.completion_tokens ?? 0) || 0,
    latency_ms: result.latency_ms,
    rejected_elite_catalog_routes: rejected,
  };
  artifact.status = 'PUBLIC_ONLY_TRANSPORT_QUALIFIED';
  artifact.completed_at = now();
  return persistQualificationArtifact(artifact, root, { history: true });
}
