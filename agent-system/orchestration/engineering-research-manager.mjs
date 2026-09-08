import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HERMES_PREFERRED_CLAUDE_MODEL, HERMES_PREFERRED_CODEX_MODEL } from './hermes-plan-models.mjs';
import { appendJsonl, readJson } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const PROJECT_TRUTH = 'agent-system/canon/PROJECT_TRUTH.md';
const DEVELOPMENT_PLAN = 'docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md';
const ACTIVE_WORK = 'agent-system/registries/ACTIVE_WORK.json';
const DECISIONS = 'agent-system/registries/DECISION_LOG.json';
const DEFAULT_TIMEOUT_MS = Number(process.env.DIAL_ENGINEERING_RESEARCH_MODEL_TIMEOUT_MS || 120000);
const DEFAULT_EFFORT = process.env.DIAL_ENGINEERING_RESEARCH_EFFORT || 'medium';
const CLAUDE_BIN = process.env.DIAL_CLAUDE_BIN || (process.env.HOME && fs.existsSync(path.join(process.env.HOME, '.local/bin/claude')) ? path.join(process.env.HOME, '.local/bin/claude') : 'claude');

function now() { return new Date().toISOString(); }
function bounded(value, max = 40000) { const s = String(value ?? ''); return s.length > max ? `${s.slice(0, max)}\n…[bounded]` : s; }
function readText(repoDir, rel, max = 40000) { try { return bounded(fs.readFileSync(path.join(repoDir, rel), 'utf8'), max); } catch { return ''; } }
function readJsonFile(repoDir, rel, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(repoDir, rel), 'utf8')); } catch { return fallback; } }
function serialiseError(error) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error?.message || error); }
}
function extractJson(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(raw.slice(start, end + 1)); } catch {} }
  return null;
}

export function buildProjectResearchContext({ repoDir = DEFAULT_REPO, root } = {}) {
  const mission = readJson('missions/dial-development-root.json', null, root);
  const activePointer = readJson('state/active-checkpoint.json', null, root);
  const checkpoint = activePointer?.path ? readJson(activePointer.path, null, root) : null;
  const activeWork = readJsonFile(repoDir, ACTIVE_WORK, null);
  const decisionLog = readJsonFile(repoDir, DECISIONS, []);
  const decisions = (Array.isArray(decisionLog) ? decisionLog : decisionLog?.decisions || []).slice(-40).map((d) => ({
    decision_id: d.decision_id, status: d.status, area: d.area, title: d.title,
  }));
  return {
    project_truth: readText(repoDir, PROJECT_TRUTH, 18000),
    development_plan: readText(repoDir, DEVELOPMENT_PLAN, 26000),
    active_work: activeWork,
    recent_decisions: decisions,
    mission: mission ? {
      state: mission.state, objective: mission.objective, priority_directive: mission.priority_directive,
      last_packet_id: mission.last_packet_id, last_packet_state: mission.last_packet_state, turn_number: mission.turn_number,
    } : null,
    checkpoint: checkpoint ? {
      feature_id: checkpoint.feature_id, target_gate: checkpoint.target_gate,
      repository: checkpoint.repository ? { commit: checkpoint.repository.commit, dirty: checkpoint.repository.dirty } : null,
    } : null,
  };
}

export function forecastPrompt(sourceIds, { root, repoDir = DEFAULT_REPO } = {}) {
  const context = buildProjectResearchContext({ repoDir, root });
  return [
    'DIAL AHEAD-OF-WORK ENGINEERING RESEARCH FORECAST',
    'You are the project-aware DIAL Development Manager research turn. This is READ-ONLY planning. Do not use tools, edit files, install packages, change Git, or change DIAL scope.',
    'The bounded canonical project context required for this forecast is embedded below. Treat it in this precedence: Project Truth and active Development Plan; machine/current work context; mission/checkpoint continuity. Lower layers never override higher layers.',
    'Determine exactly 3-5 dependency-safe engineering packets the canonical programme is likely to execute next. Do not invent a new priority, skip blockers, or let external research reprioritise the programme.',
    'For each packet identify technologies, engineering unknowns, current-version pitfalls, and external research that would materially improve implementation quality.',
    'VEKL resources include official docs/repos/releases/issues/advisories/package registries, approved skills, tools/plugins/MCPs, DIAL rules/hooks/loops, and community forums. Prefer official/maintainer sources. Community material is discovery/corroboration only.',
    'Never request or expose secrets, customer data, production identifiers, payment/ledger records, or identifiable Health data. Never recommend an architecture/provider replacement that conflicts with DIAL canon.',
    `Only use preferred_source_ids from this registry: ${sourceIds.join(', ')}`,
    '',
    '--- BOUNDED DIAL PROJECT CONTEXT ---',
    JSON.stringify(context),
    '--- END CONTEXT ---',
    '',
    'Return JSON only, no markdown, using exactly: {"schema_version":1,"forecast_horizon":"next_3_to_5_dependency_safe_packets","items":[{"feature_id":string|null,"objective":string,"task_classes":string[],"technologies":string[],"research_questions":string[],"preferred_source_ids":string[],"search_queries":string[],"risks":string[]}],"exclusions":string[]}.',
  ].join('\n');
}

async function runCodex({ repoDir, prompt, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const modelCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-vekl-research-codex-'));
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], { cwd: modelCwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
  let stderr = ''; child.stderr.setEncoding('utf8'); child.stderr.on('data', (c) => { stderr = `${stderr}${c}`.slice(-12000); });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  let id = 1, thread = null, reroute = null, final = '', terminal = null, completedTurn = null, rpcFailure = null;
  const pending = new Map();
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
  const request = (method, params = {}) => new Promise((resolve, reject) => { const rid = id++; pending.set(rid, { resolve, reject }); send({ id: rid, method, params }); });
  const done = new Promise((resolve) => {
    rl.on('line', (line) => {
      let m; try { m = JSON.parse(line); } catch { return; }
      if (m.id != null && pending.has(m.id)) { const w = pending.get(m.id); pending.delete(m.id); if (m.error) w.reject(Object.assign(new Error(m.error.message || 'Codex RPC error'), { rpc: m.error })); else w.resolve(m.result); return; }
      if (m.method === 'model/rerouted') reroute = m.params || m;
      if (m.method === 'error') terminal = m.params?.error || m.params || m;
      if (m.method === 'item/agentMessage/delta') final += m.params?.delta || '';
      if (m.method === 'item/completed' && m.params?.item?.type === 'agentMessage') final = m.params.item.text || final;
      if (m.method === 'turn/completed') { completedTurn = m.params?.turn || m.params || null; resolve(); }
    });
    child.on('exit', resolve);
  });
  const timer = setTimeout(() => { terminal = { message: `research timeout after ${timeoutMs}ms`, codexErrorInfo: 'ResearchTimeout' }; child.kill('SIGTERM'); }, timeoutMs);
  try {
    await request('initialize', { clientInfo: { name: 'dial_vekl_research_forecaster', title: 'DIAL VEKL Research Forecaster', version: '2.1.0' }, capabilities: { experimentalApi: true } }); send({ method: 'initialized' });
    const tr = await request('thread/start', { model: HERMES_PREFERRED_CODEX_MODEL, cwd: modelCwd, ephemeral: true, approvalPolicy: 'never', permissions: ':read-only', allowProviderModelFallback: false });
    thread = tr?.thread || null; if (!thread?.id) throw new Error('Codex research thread did not start');
    await request('turn/start', { threadId: thread.id, input: [{ type: 'text', text: prompt }], model: HERMES_PREFERRED_CODEX_MODEL, effort: DEFAULT_EFFORT, approvalPolicy: 'never', permissions: ':read-only' });
    await done;
  } catch (error) { rpcFailure = error?.rpc || { message: String(error?.message || error) }; }
  finally { clearTimeout(timer); if (!child.killed) child.kill('SIGTERM'); rl.close(); try { fs.rmSync(modelCwd, { recursive: true, force: true }); } catch {} }
  const error = terminal || completedTurn?.error || rpcFailure;
  const resolved = reroute?.toModel || reroute?.to_model || thread?.model || thread?.modelId || null;
  const identity = resolved === HERMES_PREFERRED_CODEX_MODEL && !reroute;
  const forecast = extractJson(final);
  return { ok: Boolean(identity && !error && forecast), runtime: 'codex_app_server', requested_model: HERMES_PREFERRED_CODEX_MODEL, resolved_model: resolved, identity_proven: identity, forecast, error: serialiseError(error) || (forecast ? null : 'Codex returned no valid forecast JSON'), raw: final.slice(-12000), stderr: stderr.slice(-4000) };
}

function runClaude({ repoDir, prompt, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const modelCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-vekl-research-claude-'));
  const result = spawnSync(CLAUDE_BIN, ['-p', prompt, '--model', HERMES_PREFERRED_CLAUDE_MODEL, '--effort', DEFAULT_EFFORT, '--output-format', 'json', '--permission-mode', 'plan', '--max-turns', '6', '--name', 'DIAL-VEKL-SONNET-RESEARCH'], { cwd: modelCwd, input: '', encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env } });
  let parsed = null; try { parsed = JSON.parse(result.stdout || 'null'); } catch {}
  const usage = parsed?.modelUsage ?? parsed?.model_usage ?? {}; const models = Object.keys(usage); const resolved = models.length === 1 ? models[0] : null; const identity = resolved === HERMES_PREFERRED_CLAUDE_MODEL;
  const forecast = extractJson(parsed?.result ?? parsed?.output ?? '');
  const error = result.status === 0 ? (!forecast ? 'Claude returned no valid forecast JSON' : (!identity ? `Claude research model provenance ambiguous: ${models.join(',') || 'none'}` : null)) : String(result.error?.message || result.stderr || parsed?.result || 'claude research failed').slice(-4000);
  try { fs.rmSync(modelCwd, { recursive: true, force: true }); } catch {}
  return { ok: Boolean(result.status === 0 && identity && forecast), runtime: 'claude_code', requested_model: HERMES_PREFERRED_CLAUDE_MODEL, resolved_model: resolved, identity_proven: identity, forecast, error, raw: String(parsed?.result ?? result.stdout ?? '').slice(-12000) };
}

export async function runProjectAwareResearchForecast({ repoDir = DEFAULT_REPO, root, sourceIds = [] } = {}) {
  const prompt = forecastPrompt(sourceIds, { root, repoDir });
  let primary; try { primary = await runCodex({ repoDir, prompt }); } catch (error) { primary = { ok: false, error: String(error?.message || error), runtime: 'codex_app_server' }; }
  if (primary.ok) { appendJsonl('events/engineering-research.jsonl', { event: 'ENGINEERING_RESEARCH_FORECAST_MODEL_COMPLETED', runtime: primary.runtime, resolved_model: primary.resolved_model, at: now() }, root); return primary; }
  let fallback; try { fallback = runClaude({ repoDir, prompt }); } catch (error) { fallback = { ok: false, error: String(error?.message || error), runtime: 'claude_code' }; }
  appendJsonl('events/engineering-research.jsonl', { event: fallback.ok ? 'ENGINEERING_RESEARCH_FORECAST_MODEL_COMPLETED' : 'ENGINEERING_RESEARCH_FORECAST_MODEL_UNAVAILABLE', runtime: fallback.runtime, resolved_model: fallback.resolved_model ?? null, primary_error: primary.error ?? null, fallback_error: fallback.error ?? null, at: now() }, root);
  return fallback.ok ? fallback : { ok: false, runtime: null, requested_model: null, resolved_model: null, identity_proven: false, forecast: null, error: `Sol unavailable: ${primary.error || 'unknown'}; Sonnet unavailable: ${fallback.error || 'unknown'}` };
}
