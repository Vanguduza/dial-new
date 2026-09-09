import { freeChatModels } from './xkiro-catalog.mjs';
import { eliteModelPolicy, isEliteFreeCandidate } from './elite-model-policy.mjs';
import { loadPerformanceLedger } from '../../auxiliary/model-performance-ledger.mjs';
import { selectDiverseRoutes } from '../../auxiliary/diversity-coordinator.mjs';

function performanceFor(ledger, modelId, archetype) {
  const record = ledger.routes?.[`${modelId}::${archetype}`] ?? null;
  if (!record) return null;
  const samples = record.samples ?? [];
  const n = Math.max(1, samples.length);
  const avg = (field) => samples.reduce((sum, item) => sum + (Number(item?.[field]) || 0), 0) / n;
  const schemaValid = samples.filter((item) => item.schema_valid).length / n;
  const providerErrors = samples.filter((item) => item.provider_error).length / n;
  const timeouts = samples.filter((item) => item.timeout).length / n;
  const lifecycleWeight = record.state === 'CHAMPION' ? 1000 : record.state === 'CHALLENGER' ? 500 : record.state === 'APPROVED' ? 250 : 0;
  const quality = (schemaValid * 30) + (avg('evidence_fidelity') * 40)
    + ((1 - avg('unsupported_claim_rate')) * 15)
    + ((1 - providerErrors) * 10) + ((1 - timeouts) * 5);
  return { score: lifecycleWeight + quality, state: record.state, samples: samples.length };
}

export function routesForTask({ catalog, root, task }) {
  const ledger = loadPerformanceLedger(root);
  return freeChatModels(catalog).filter((model) => isEliteFreeCandidate(model.model_id)).map((model) => {
    const record = ledger.routes?.[`${model.model_id}::${task.task_archetype}`] ?? null;
    return {
      ...model,
      elite_policy: eliteModelPolicy(model.model_id),
      haif_status: record?.state ?? 'DISCOVERED',
      approved_archetypes: record && ['APPROVED', 'CHAMPION', 'CHALLENGER'].includes(record.state) ? [task.task_archetype] : [],
      performance: { [task.task_archetype]: performanceFor(ledger, model.model_id, task.task_archetype) ?? {} },
    };
  });
}

export function selectTaskRoutes({ catalog, root, task }) {
  const strategy = ['S1', 'S2', 'S3'].includes(task.diversity) ? task.diversity : task.diversity === 'CHALLENGER' ? 'S2' : 'S1';
  return selectDiverseRoutes(routesForTask({ catalog, root, task }), {
    archetype: task.task_archetype,
    strategy,
    requiredCapabilities: task.required_capabilities,
    minContext: task.max_input_tokens,
  });
}

export function qualificationCandidates(catalog, { requiredCapabilities = {}, limit = 12 } = {}) {
  const candidates = freeChatModels(catalog).filter((route) => {
    if (!isEliteFreeCandidate(route.model_id)) return false;
    for (const [name, required] of Object.entries(requiredCapabilities)) {
      if (required === true && route.capabilities?.[name] !== true) return false;
    }
    return route.max_output_tokens >= 128;
  });
  candidates.sort((a, b) => {
    const pa = eliteModelPolicy(a.model_id); const pb = eliteModelPolicy(b.model_id);
    if ((pa?.tier ?? 99) !== (pb?.tier ?? 99)) return (pa?.tier ?? 99) - (pb?.tier ?? 99);
    const reasoning = Number(Boolean(b.capabilities?.reasoning)) - Number(Boolean(a.capabilities?.reasoning));
    if (reasoning) return reasoning;
    return Number(b.context_length || 0) - Number(a.context_length || 0) || String(a.model_id).localeCompare(String(b.model_id));
  });
  return candidates.slice(0, Math.max(1, limit));
}

export function selectQualificationCanary(catalog, options = {}) {
  return qualificationCandidates(catalog, { ...options, limit: 1 })[0] ?? null;
}
