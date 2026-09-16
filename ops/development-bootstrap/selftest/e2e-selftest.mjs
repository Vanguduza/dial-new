#!/usr/bin/env node
// Non-destructive end-to-end development-system self-test (mission section 33).
//
//   owner instruction -> intake (typed, provenance) -> project identification -> role guard
//   -> VEKL resolution (real broker, temp control root) -> task classification -> execution
//   topology -> provider/runtime selection (locked chain over injected health evidence)
//   -> read-only repository operation -> evidence receipt -> owner response
//
// It never spends a model turn, never writes to the repository, never touches /var/lib/dial-control:
// the control root is a fresh temporary directory. Every stage carries the same correlation id.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertWorkloadAllowed, RoleGuardError } from '../roles/role-guard.mjs';
import { git } from '../lib/probes.mjs';

const STAGES = ['OWNER_INSTRUCTION', 'HERMES_INTAKE', 'PROJECT_IDENTIFICATION', 'ROLE_GUARD', 'VEKL_RESOLUTION', 'TASK_CLASSIFICATION', 'EXECUTION_TOPOLOGY', 'PROVIDER_SELECTION', 'WORKER_INVOCATION', 'READ_ONLY_REPOSITORY_OPERATION', 'EVIDENCE_RETURN', 'OWNER_RESPONSE'];

function healthy(runtime, model, nowIso) {
  return { runtime, state: 'HEALTHY', requested_model: model, resolved_model: model, identity_proven: true, details: { toolchain_usable: true }, observed_at: nowIso, checked_at: nowIso, auth: 'SUBSCRIPTION' };
}

export async function runE2ESelfTest({ repoDir, featureId = 'SPARE-F001', role = process.env.DIAL_HOST_ROLE || null, controlRoot = null, runtimeHealth = null, instruction = 'Read-only self-test: report the current DIAL repository HEAD and confirm the development system can route a bounded task without modifying files.', keepRoot = false, nowIso = new Date().toISOString() } = {}) {
  const correlationId = `selftest-${crypto.randomUUID()}`;
  const root = controlRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'dial-selftest-'));
  const stages = [];
  const t0 = Date.now();
  const stage = (name, data) => { const row = { stage: name, correlation_id: correlationId, at_ms: Date.now() - t0, ...data }; stages.push(row); return row; };
  const mod = (rel) => import(pathToFileURL(path.join(repoDir, rel)).href);
  try {
    // 1. Owner instruction with provenance (mirrors project-truth-authority envelope shape; read-only => NO_AUTHORITY).
    const instructionHash = crypto.createHash('sha256').update(instruction).digest('hex');
    stage('OWNER_INSTRUCTION', { instruction_sha256: instructionHash, channel: 'bootstrap-selftest', actor: 'owner', authority_class: 'NO_AUTHORITY', reason: 'read-only instruction' });
    // 2. Hermes intake: typed packet persisted outside the repo.
    const { ensureControlLayout, writeJsonAtomic, readJson } = await mod('agent-system/orchestration/state-store.mjs');
    ensureControlLayout(root);
    const packetId = correlationId;
    writeJsonAtomic(`work-queue/inbox/${packetId}.json`, { job_id: packetId, instruction, requested_by: 'bootstrap-selftest:owner', metadata: { feature_id: featureId, read_only: true }, created_at: nowIso }, root);
    stage('HERMES_INTAKE', { packet_id: packetId, persisted: Boolean(readJson(`work-queue/inbox/${packetId}.json`, null, root)), control_root: root });
    // 3. Project identification from repository authority (hard-bound to dial).
    const { defaultDialProject } = await mod('agent-system/orchestration/project-registry.mjs');
    const project = defaultDialProject(repoDir);
    const { projectTruthHash } = await mod('agent-system/orchestration/knowledge-graph-core.mjs');
    stage('PROJECT_IDENTIFICATION', { project_slug: project.slug || project.project_slug || 'dial', project_truth_hash: projectTruthHash(repoDir) });
    // 4. Role guard: this host must be allowed to resolve knowledge and read the repository.
    let guard;
    try { guard = assertWorkloadAllowed({ workload: 'VEKL_RESOLVE', env: role ? { ...process.env, DIAL_HOST_ROLE: role } : process.env }); }
    catch (e) { if (e instanceof RoleGuardError) { stage('ROLE_GUARD', { allowed: false, code: e.code, detail: e.detail }); throw e; } throw e; }
    stage('ROLE_GUARD', { allowed: true, role: guard.role, source: guard.source });
    // 5. VEKL resolution through the real broker (deterministic, no model).
    const { ensurePacketEngineeringKnowledge } = await mod('agent-system/orchestration/engineering-knowledge-broker.mjs');
    const knowledge = ensurePacketEngineeringKnowledge({ repoDir, root, packetId, instruction, metadata: { feature_id: featureId } });
    const kc = knowledge.knowledge_context || {};
    // The admission binding is the content-addressed record of what was resolved (capsules, graph, routes, envelope).
    const binding = readJson(`knowledge/admission/by-packet/${packetId}.json`, null, root) || {};
    // Capsule hashes embed packet_id (packet-scoped identity). Content identity = hash of {capsule_type, body}.
    const capsuleContentHashes = (binding.context_capsule_hashes || []).map((h) => {
      const dir = path.join(root, 'knowledge/capsules');
      const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith(`${h}.json`)) : null;
      if (!file) return null;
      const c = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      return crypto.createHash('sha256').update(JSON.stringify({ capsule_type: c.capsule_type, body: c.body })).digest('hex');
    }).sort();
    stage('VEKL_RESOLUTION', { resolution_state: knowledge.resolution_state, activation_id: knowledge.activation_id, manifest_sha256: knowledge.manifest_sha256, scope: kc.scope, unit_lineage_id: kc.unit_lineage_id || binding.unit_lineage_id, unit_revision_hash: kc.unit_revision_hash || binding.unit_revision_hash, unit_map_hash: kc.unit_map_hash || binding.unit_map_hash, graph_generation_id: kc.graph_generation_id || binding.graph_generation_id, graph_revision_hash: binding.graph_revision_hash || null, graph_neighbourhood_hash: binding.graph_neighbourhood_hash || null, knowledge_route_policy_hash: binding.knowledge_route_policy_hash || null, determinism_envelope_hash: binding.determinism_envelope_hash || kc.determinism_envelope_hash || null, context_capsule_hashes: binding.context_capsule_hashes || null, capsule_content_hashes: capsuleContentHashes, knowledge_readiness_state: binding.knowledge_readiness_state || null, binding_hash: binding.binding_hash || null });
    // 6. Deterministic task classification.
    const { classifyTask } = await mod('agent-system/orchestration/task-triage.mjs');
    const triage = classifyTask({ instruction, featureRecord: { module: 'development-system' } });
    stage('TASK_CLASSIFICATION', { archetype: triage.archetype, risk_class: triage.risk_class, mandatory_gates: triage.mandatory_gates, triage_result_hash: triage.triage_result_hash });
    // 7. Execution topology.
    const { selectExecutionTopology } = await mod('agent-system/orchestration/execution-topology.mjs');
    const topology = selectExecutionTopology({ triage, budget: { max_workers: 1 } });
    stage('EXECUTION_TOPOLOGY', { topology: topology.topology || topology.selected || topology, topology_hash: crypto.createHash('sha256').update(JSON.stringify(topology)).digest('hex') });
    // 8. Provider selection through the locked Hermes chain over injected health evidence.
    const { selectHermesRuntime } = await mod('agent-system/orchestration/hermes-runtime-router.mjs');
    const health = runtimeHealth || { runtimes: { codex_app_server: healthy('codex_app_server', 'gpt-5.6-sol', nowIso), claude_code: healthy('claude_code', 'claude-sonnet-5', nowIso) } };
    const candidate = selectHermesRuntime(health);
    stage('PROVIDER_SELECTION', { policy: 'LOCKED_SOL_THEN_SONNET', selected_runtime: candidate?.runtime || 'NO_HERMES_RUNTIME_AVAILABLE', selected_model: candidate?.requested_model || null, role: candidate?.role || null, health_input_hash: crypto.createHash('sha256').update(JSON.stringify(health)).digest('hex') });
    if (!candidate) throw Object.assign(new Error('NO_HERMES_RUNTIME_AVAILABLE'), { code: 'NO_HERMES_RUNTIME_AVAILABLE' });
    // 9. Worker invocation is simulated: the self-test never spends a model turn. It records the exact
    //    executor contract the real path would use so the boundary is visible in the receipt.
    stage('WORKER_INVOCATION', { simulated: true, executor: candidate.runtime === 'codex_app_server' ? 'agent-system/orchestration/hermes-runtime-executor.mjs' : 'agent-system/orchestration/claude-fallback-runner.mjs', model_turn_spent: false, guard_env: { DIAL_PACKET_ID: packetId, DIAL_CONTROL_HOME: root } });
    // 10. Read-only repository operation.
    const head = git(repoDir, ['rev-parse', 'HEAD']).output; const status = git(repoDir, ['status', '--porcelain']).output;
    stage('READ_ONLY_REPOSITORY_OPERATION', { command: 'git rev-parse HEAD; git status --porcelain', head, dirty_files: status ? status.split('\n').length : 0 });
    // 11. Evidence receipt (tamper-evident hash over every stage).
    const receipt = { schema_version: 1, correlation_id: correlationId, feature_id: featureId, stages: stages.map((s) => ({ ...s })), completed_at: new Date().toISOString() };
    receipt.receipt_hash = crypto.createHash('sha256').update(JSON.stringify(receipt.stages)).digest('hex');
    writeJsonAtomic(`execution/receipts/${packetId}.json`, receipt, root);
    writeJsonAtomic(`work-queue/completed/${packetId}.json`, { job_id: packetId, state: 'COMPLETED', runtime_provenance: { policy: 'LOCKED_SOL_THEN_SONNET', runtime: candidate.runtime, requested_model: candidate.requested_model, resolved_model: candidate.requested_model, fallback_used: candidate.runtime !== 'codex_app_server' }, receipt_hash: receipt.receipt_hash }, root);
    stage('EVIDENCE_RETURN', { receipt_path: `execution/receipts/${packetId}.json`, receipt_hash: receipt.receipt_hash });
    // 12. Owner response.
    const response = `DIAL self-test ${correlationId}: routed ${triage.archetype}/${triage.risk_class} for ${featureId} through ${candidate.runtime} (${candidate.requested_model}) with VEKL unit ${kc.unit_lineage_id || 'n/a'}; repository HEAD ${head}; no files modified.`;
    stage('OWNER_RESPONSE', { response });
    const missing = STAGES.filter((s) => !stages.some((x) => x.stage === s));
    return { ok: missing.length === 0, correlation_id: correlationId, control_root: root, stages, missing_stages: missing, decision_fingerprint: decisionFingerprint(stages), receipt_hash: receipt.receipt_hash, response };
  } catch (e) {
    return { ok: false, correlation_id: correlationId, control_root: root, stages, error: e.message, code: e.code || null, decision_fingerprint: decisionFingerprint(stages) };
  } finally {
    if (!keepRoot && !controlRoot) fs.rmSync(root, { recursive: true, force: true });
  }
}

// Control-plane decisions that must be reproducible across runs (timestamps, ids and paths excluded).
export function decisionFingerprint(stages) {
  const pick = {};
  for (const s of stages) {
    if (s.stage === 'PROJECT_IDENTIFICATION') pick.project = { slug: s.project_slug, truth: s.project_truth_hash };
    if (s.stage === 'ROLE_GUARD') pick.role = { allowed: s.allowed, role: s.role };
    // manifest_sha256 is packet-bound (it covers packet_id/activation_id/updated_at), so the content identity is the
    // admission binding: unit lineage/revision/map, graph revision + neighbourhood, route policy, envelope, capsule hashes.
    if (s.stage === 'VEKL_RESOLUTION') pick.vekl = { state: s.resolution_state, scope: s.scope, unit: s.unit_lineage_id, revision: s.unit_revision_hash, map: s.unit_map_hash, graph_revision: s.graph_revision_hash, neighbourhood: s.graph_neighbourhood_hash, routes: s.knowledge_route_policy_hash, envelope: s.determinism_envelope_hash, capsule_content: s.capsule_content_hashes, readiness: s.knowledge_readiness_state };
    if (s.stage === 'TASK_CLASSIFICATION') pick.triage = { archetype: s.archetype, risk: s.risk_class, hash: s.triage_result_hash };
    if (s.stage === 'EXECUTION_TOPOLOGY') pick.topology = s.topology_hash;
    if (s.stage === 'PROVIDER_SELECTION') pick.provider = { runtime: s.selected_runtime, model: s.selected_model };
  }
  return { fields: pick, hash: crypto.createHash('sha256').update(JSON.stringify(pick)).digest('hex') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoDir = process.env.DIAL_REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const r = await runE2ESelfTest({ repoDir });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
