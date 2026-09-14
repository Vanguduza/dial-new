import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ATTEMPT_BUDGET } from './constants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REGISTRY_PATH = path.resolve(
  here,
  '../../../deploy/oracle/execution-fabric/provider-registry.json',
);

export function loadProviderRegistry(source = process.env.DIAL_PROVIDER_REGISTRY || DEFAULT_REGISTRY_PATH) {
  const raw = typeof source === 'string' && !source.trim().startsWith('{')
    ? fs.readFileSync(source, 'utf8')
    : source;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : source;
  if (!parsed || parsed.schema !== 'dial.provider_registry/v1') {
    throw new Error('provider registry schema must be dial.provider_registry/v1');
  }
  if (!Array.isArray(parsed.providers)) throw new Error('provider registry providers[] is required');
  return {
    ...parsed,
    providers: parsed.providers.map(normalizeProvider),
    attempt_budget_defaults: { ...DEFAULT_ATTEMPT_BUDGET, ...(parsed.attempt_budget_defaults || {}) },
  };
}

function normalizeProvider(entry) {
  if (!entry?.provider_id) throw new Error('provider_id is required');
  return {
    provider_id: String(entry.provider_id),
    subscription_identity: entry.subscription_identity ?? null,
    execution_surface: entry.execution_surface ?? null,
    envelope: entry.envelope ?? {},
    envelope_status: entry.envelope_status === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
    capability_manifest: Array.isArray(entry.capability_manifest) ? entry.capability_manifest : [],
    credential_reference: entry.credential_reference ?? null,
    attempt_budget_defaults: { ...DEFAULT_ATTEMPT_BUDGET, ...(entry.attempt_budget_defaults || {}) },
    eligible: entry.eligible !== false,
  };
}

export function eligibleProviders(registry) {
  return (registry?.providers || []).filter((entry) => entry.eligible);
}

export function providerById(registry, providerId) {
  return (registry?.providers || []).find((entry) => entry.provider_id === providerId) ?? null;
}
