#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildContradictionBatches,
  buildResearchHarvestManifest,
} from '../../../agent-system/orchestration/vekl-research-harvest.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_RESEARCH_HARVEST_HOME ||
  '/var/lib/dial-worker/research-harvest';
const privateMcpUrlFile = process.env.DIAL_PRIVATE_MCP_URL_FILE ||
  '/var/lib/dial-worker/secrets/private-mcp-url';
const dailyBudget = Math.max(1, Math.min(
  1000, Number(process.env.DIAL_UNION_ALPHA_DAILY_REQUEST_BUDGET || 45),
));
const maxCallsPerRun = Math.max(1, Math.min(
  10, Number(process.env.DIAL_UNION_ALPHA_MAX_CALLS_PER_RUN || 3),
));
const minCallIntervalMs = Math.max(
  3000, Number(process.env.DIAL_UNION_ALPHA_MIN_CALL_INTERVAL_MS || 4000),
);

function now() { return new Date().toISOString(); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); }
function atomicJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(tmp, file);
}
function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}
function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoDir, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  }).trim();
}
function stateFile() { return path.join(root, 'state.json'); }
function manifestFile() { return path.join(root, 'manifest.json'); }
function resultFile(batchId) { return path.join(root, 'results', `${batchId}.json`); }
function eventFile() { return path.join(root, 'events.jsonl'); }
function appendEvent(value) {
  ensureDir(root);
  fs.appendFileSync(eventFile(), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}
function localDateKey() { return new Date().toISOString().slice(0, 10); }
function sixDayDeadline() {
  return new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString();
}
function completedRecords(state) {
  return (state.completed_batches || [])
    .map((id) => readJson(resultFile(id), null))
    .filter(Boolean);
}

async function mcpCall(name, args = {}) {
  const target = fs.readFileSync(privateMcpUrlFile, 'utf8').trim();
  const response = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await response.text();
  if (!response.ok) throw Object.assign(
    new Error(`CONTROL_MCP_HTTP_${response.status}`),
    { category: 'CONTROL_UNAVAILABLE' },
  );
  const parsed = JSON.parse(text);
  if (parsed?.error) throw new Error(parsed.error.message || 'CONTROL_MCP_RPC_ERROR');
  const toolResult = parsed?.result;
  if (toolResult?.isError) {
    const message = toolResult.content?.map((item) => item.text).join('\n') ||
      'CONTROL_TOOL_ERROR';
    const error = new Error(message);
    error.category = /AUTH_REQUIRED/.test(message) ? 'AUTH_REQUIRED' :
      /CAPACITY_LIMITED|HTTP_429/.test(message) ? 'CAPACITY_LIMITED' :
        'CONTROL_TOOL_ERROR';
    throw error;
  }
  return toolResult?.structuredContent ??
    (() => {
      const textBody = toolResult?.content?.[0]?.text;
      return textBody ? JSON.parse(textBody) : toolResult;
    })();
}

function initialState(manifest) {
  return {
    schema_version: 1,
    mission_id: manifest.mission_id,
    manifest_hash: manifest.manifest_hash,
    repository_sha: manifest.repository_sha,
    project_truth_hash: manifest.project_truth_hash,
    development_unit_registry_hash: manifest.development_unit_registry_hash,
    state: 'PLANNED',
    phase: 'PLATFORM_RESEARCH',
    model_id: manifest.model_id,
    data_class: manifest.data_class,
    required_roles: manifest.required_roles,
    expected_unit_count: manifest.unit_count,
    completed_batches: [],
    failed_batches: {},
    daily_usage: {},
    target_complete_by: process.env.DIAL_UNION_ALPHA_RESEARCH_TARGET_COMPLETE_BY ||
      sixDayDeadline(),
    created_at: now(),
    updated_at: now(),
  };
}
function ensureMission() {
  ensureDir(root);
  let manifest = readJson(manifestFile(), null);
  let state = readJson(stateFile(), null);
  if (!manifest || !state) {
    manifest = buildResearchHarvestManifest({ repoDir });
    state = initialState(manifest);
    atomicJson(manifestFile(), manifest);
    atomicJson(stateFile(), state);
    appendEvent({
      event: 'VEKL_FULL_RESEARCH_MISSION_CREATED',
      mission_id: manifest.mission_id,
      units: manifest.unit_count,
      expected_provider_calls: manifest.expected_provider_calls,
      repository_sha: manifest.repository_sha,
      at: now(),
    });
  }
  return { manifest, state };
}
function saveState(state) {
  state.updated_at = now();
  atomicJson(stateFile(), state);
}
function currentBatches(manifest, state) {
  const done = new Set(state.completed_batches || []);
  if (state.phase === 'PLATFORM_RESEARCH') {
    return manifest.platform_batches.filter((batch) => !done.has(batch.batch_id));
  }
  if (state.phase === 'UNIT_RESEARCH') {
    return manifest.unit_batches.filter((batch) => !done.has(batch.batch_id));
  }
  if (state.phase === 'CONTRADICTION_REVIEW') {
    const generated = buildContradictionBatches({
      manifest,
      completedRecords: completedRecords(state),
    });
    return generated.filter((batch) => !done.has(batch.batch_id));
  }
  return [];
}
function advancePhase(manifest, state) {
  if (currentBatches(manifest, state).length) return false;
  if (state.phase === 'PLATFORM_RESEARCH') {
    state.phase = 'UNIT_RESEARCH';
    state.state = 'RUNNING';
  } else if (state.phase === 'UNIT_RESEARCH') {
    state.phase = 'CONTRADICTION_REVIEW';
  } else if (state.phase === 'CONTRADICTION_REVIEW') {
    state.phase = 'COVERAGE_AUDIT';
  } else {
    return false;
  }
  appendEvent({
    event: 'VEKL_FULL_RESEARCH_PHASE_ADVANCED',
    mission_id: state.mission_id,
    phase: state.phase,
    at: now(),
  });
  return true;
}
function usageAvailable(state) {
  const day = localDateKey();
  const used = Number(state.daily_usage?.[day] || 0);
  return { day, used, remaining: Math.max(0, dailyBudget - used) };
}
function countAttempt(state) {
  const day = localDateKey();
  state.daily_usage = { ...state.daily_usage };
  state.daily_usage[day] = Number(state.daily_usage[day] || 0) + 1;
}
function sanitizeLocalResult(record) {
  return {
    schema_version: record.schema_version,
    authority: record.authority,
    provider: record.provider,
    model_id: record.model_id,
    data_class: record.data_class,
    mission_id: record.mission_id,
    batch_id: record.batch_id,
    batch_kind: record.batch_kind,
    subject_bindings: record.subject_bindings,
    retrieval: record.retrieval,
    result: record.result,
    usage: record.usage || null,
    rate_limit: record.rate_limit || null,
    evidence_hash: record.evidence_hash,
    completed_at: record.completed_at,
  };
}
async function executeBatch(manifest, state, batch) {
  countAttempt(state);
  saveState(state);
  const payload = {
    batch: {
      schema_version: 1,
      mission_id: manifest.mission_id,
      batch_id: batch.batch_id,
      batch_kind: batch.batch_kind,
      data_class: batch.data_class,
      subjects: batch.subjects,
    },
    bindings: batch.bindings,
  };
  const record = await mcpCall('dial_union_alpha_research_batch', payload);
  atomicJson(resultFile(batch.batch_id), sanitizeLocalResult(record));
  state.completed_batches = [...new Set([
    ...(state.completed_batches || []),
    batch.batch_id,
  ])].sort();
  delete state.failed_batches?.[batch.batch_id];
  state.last_completed_batch = batch.batch_id;
  state.last_evidence_hash = record.evidence_hash;
  state.state = 'RUNNING';
  saveState(state);
  appendEvent({
    event: 'VEKL_FULL_RESEARCH_BATCH_COMPLETED',
    mission_id: state.mission_id,
    batch_id: batch.batch_id,
    batch_kind: batch.batch_kind,
    evidence_hash: record.evidence_hash,
    at: now(),
  });
  return record;
}
async function finalize(manifest, state) {
  state.phase = 'COVERAGE_AUDIT';
  saveState(state);
  const coverage = await mcpCall('dial_union_alpha_research_finalize', {
    mission_id: manifest.mission_id,
  });
  state.coverage_hash = coverage.coverage_hash || null;
  state.coverage = coverage.checks || {};
  if (coverage.state === 'COMPLETE') {
    state.state = 'COMPLETE';
    state.phase = 'COMPLETE';
    state.completed_at = now();
  } else {
    state.state = 'COVERAGE_INCOMPLETE';
  }
  saveState(state);
  appendEvent({
    event: state.state === 'COMPLETE' ?
      'VEKL_FULL_RESEARCH_MISSION_COMPLETE' :
      'VEKL_FULL_RESEARCH_COVERAGE_INCOMPLETE',
    mission_id: state.mission_id,
    coverage_hash: state.coverage_hash,
    at: now(),
  });
  return coverage;
}

export async function runResearchHarvestOnce() {
  const { manifest, state } = ensureMission();
  const observedHead = gitHead();
  if (observedHead !== manifest.repository_sha) {
    state.state = 'STALE_REPO_BINDING';
    state.stale_observed_sha = observedHead;
    saveState(state);
    return state;
  }
  if (state.state === 'COMPLETE') return state;
  let calls = 0;
  while (calls < maxCallsPerRun) {
    while (advancePhase(manifest, state)) saveState(state);
    if (state.phase === 'COVERAGE_AUDIT') {
      return await finalize(manifest, state);
    }
    const budget = usageAvailable(state);
    if (!budget.remaining) {
      state.state = 'WAITING_DAILY_REQUEST_BUDGET';
      state.resume_after_utc_day = budget.day;
      saveState(state);
      return state;
    }
    const batch = currentBatches(manifest, state)[0];
    if (!batch) continue;
    try {
      await executeBatch(manifest, state, batch);
      calls += 1;
    } catch (error) {
      state.failed_batches = { ...state.failed_batches };
      const previous = state.failed_batches[batch.batch_id] || {};
      state.failed_batches[batch.batch_id] = {
        attempts: Number(previous.attempts || 0) + 1,
        category: error?.category || 'UNKNOWN',
        error: String(error?.message || error).slice(0, 1200),
        at: now(),
      };
      state.state = error?.category === 'AUTH_REQUIRED' ?
        'WAITING_AUTH' : error?.category === 'FREE_WINDOW_CLOSED' ?
          'FREE_WINDOW_CLOSED' : error?.category === 'CAPACITY_LIMITED' ?
            'WAITING_PROVIDER_CAPACITY' : 'RETRY_PENDING';
      saveState(state);
      appendEvent({
        event: 'VEKL_FULL_RESEARCH_BATCH_FAILED',
        mission_id: state.mission_id,
        batch_id: batch.batch_id,
        category: error?.category || 'UNKNOWN',
        at: now(),
      });
      return state;
    }
    if (calls < maxCallsPerRun) {
      await new Promise((resolve) => setTimeout(resolve, minCallIntervalMs));
    }
  }
  saveState(state);
  return state;
}

async function main() {
  const command = process.argv[2] || 'run';
  if (command === 'run') {
    console.log(JSON.stringify(await runResearchHarvestOnce(), null, 2));
    return;
  }
  if (command === 'status') {
    const { manifest, state } = ensureMission();
    console.log(JSON.stringify({
      state,
      mission: {
        mission_id: manifest.mission_id,
        unit_count: manifest.unit_count,
        expected_provider_calls: manifest.expected_provider_calls,
        repository_sha: manifest.repository_sha,
      },
      request_budget: {
        per_day: dailyBudget,
        max_calls_per_run: maxCallsPerRun,
        ...usageAvailable(state),
      },
    }, null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}
main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
