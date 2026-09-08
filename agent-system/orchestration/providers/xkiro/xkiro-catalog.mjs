import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const XKIRO_BASE_URL = 'https://api.xkiro.com/v1';
function now() { return new Date().toISOString(); }
function sha(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

export function inferModelLineage(model) {
  const id = String(model?.id ?? '');
  const family = id.includes('/') ? id.split('/')[0] : String(model?.owned_by ?? 'unknown');
  return {
    provider_family: String(model?.owned_by ?? family ?? 'unknown'),
    base_model_family: family || 'unknown',
    model_lineage_id: `${family || 'unknown'}/${id || 'unknown'}`,
    independence_class: family ? `family:${family}` : 'UNKNOWN',
    lineage_confidence: family ? 'INFERRED_FROM_VENDOR_PREFIX' : 'UNKNOWN',
  };
}

export function normalizeCatalogModel(model) {
  const lineage = inferModelLineage(model);
  return {
    model_id: String(model?.id ?? ''), display_name: model?.display_name ?? null,
    route_provider: 'xkiro', provider_family: lineage.provider_family,
    base_model_family: lineage.base_model_family, model_lineage_id: lineage.model_lineage_id,
    independence_class: lineage.independence_class, lineage_confidence: lineage.lineage_confidence,
    access_tier: model?.access_tier ?? 'unknown', modality: model?.modality ?? 'chat',
    context_length: Number(model?.context_length ?? 0) || 0,
    max_output_tokens: Number(model?.max_output_tokens ?? 0) || 0,
    capabilities: { vision: Boolean(model?.capabilities?.vision), tools: Boolean(model?.capabilities?.tools), reasoning: Boolean(model?.capabilities?.reasoning) },
    reasoning_efforts: model?.reasoning_efforts ?? null, pricing: model?.pricing ?? null,
    haif_status: 'DISCOVERED', health_state: 'CLOSED', approved_archetypes: [],
  };
}
export async function fetchXKiroCatalog({ fetchImpl = globalThis.fetch, baseUrl = XKIRO_BASE_URL } = {}) {
  const response = await fetchImpl(`${baseUrl}/models`, { headers: { accept: 'application/json', 'user-agent': 'hermes-haif/1.1' } });
  if (!response.ok) throw new Error(`xKiro catalog returned HTTP ${response.status}`);
  const payload = await response.json();
  const models = Array.isArray(payload?.data) ? payload.data.map(normalizeCatalogModel).filter((m) => m.model_id) : [];
  const canonical = JSON.stringify(models);
  return {
    schema_version: 1, provider: 'xkiro', object: payload?.object ?? 'list',
    catalog_snapshot_id: `sha256:${sha(canonical)}`, observed_at: now(),
    model_count: models.length, free_model_count: models.filter((m) => m.access_tier === 'free').length,
    models,
  };
}

export function persistCatalogSnapshot(snapshot, providerRoot) {
  const dir = path.join(providerRoot, 'xkiro', 'catalog');
  fs.mkdirSync(path.join(dir, 'snapshots'), { recursive: true, mode: 0o700 });
  const stamp = snapshot.observed_at.replace(/[:.]/g, '-');
  const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'latest.json'), payload, { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'snapshots', `${stamp}.json`), payload, { mode: 0o600 });
  return snapshot;
}

export function freeChatModels(snapshot) {
  return (snapshot?.models ?? []).filter((model) => model.access_tier === 'free' && (model.modality === 'chat' || !model.modality));
}
