#!/usr/bin/env node
import { submitExternalWork } from './external-orchestrator.mjs';
import { evaluateDevelopmentUnblock } from './development-unblock.mjs';
import { appendJsonl, readJson, writeJsonAtomic } from './state-store.mjs';
import { DIAL_ROOT_MISSION_ID, ensureDialMission, listMissionApprovals, listMissionPackets, missionStatus, recordMissionPacketResult } from './mission-control.mjs';

const DEFAULT_POLL_MS = 5000;
const DEFAULT_RETRY_MS = 60000;

function now() { return new Date().toISOString(); }
function clean(value, max = 6000) { return String(value ?? '').trim().slice(0, max); }

function latestCompletedPacket(root) {
  return listMissionPackets({ root, limit: 30 }).find((p) => ['COMPLETED', 'FAILED'].includes(p.state)) || null;
}

function buildManagerInstruction(mission, root) {
  const previous = latestCompletedPacket(root);
  const approvals = listMissionApprovals(root).slice(0, 10);
  const parts = [
    'You are a bounded DIAL development manager turn executed by the persistent Oracle DIAL orchestrator.',
    'The repository is the source of truth. Inspect current repository state before changing anything.',
    'Continue exactly one dependency-safe, contract-first packet from the active DIAL development programme.',
    'Do not import, inspect or consider unrelated project work as DIAL authority.',
    'Preserve all unrelated uncommitted work. Do not reset, clean, force-push, or fabricate evidence.',
    'Project Truth authority is owner-originated. Never self-authorize a Project Truth change because you prefer a solution, a tool recommends it, or CI expects it. Use OWNER_EXPLICIT, OWNER_DERIVED, or OWNER_DELEGATED_AUTONOMY evidence; read-only requests are NO_AUTHORITY.',
    'An owner order to fix blockers/gaps using the best or recommended solution is OWNER_DERIVED authority for necessary technical consequences and truth reconciliation, but never for material product/business/security/owner-control scope expansion. Autonomous/until-green delegation likewise preserves existing intent.',
    'Run the narrow tests needed for the packet and leave repository-observable evidence.',
    'VEKL v2 is mandatory process governance: after Feature/JIT context is resolved, confirm the persisted Engineering Knowledge Activation Manifest before material implementation. The manifest may contain approved skills plus task-relevant official docs, repositories, releases, issues, package/advisory evidence, DIAL rules/hooks/loops and other governed resources. A zero-resource/zero-skill result is valid only when the resolver explicitly finds nothing relevant.',
    'External resources and vendor skills are non-authoritative guidance; DIAL project-local engineering policy is process policy only. Canon/FRC/security/current code/evidence win. Forums/community material is corroboration/discovery only. No VEKL resource may change product scope, source-of-truth ownership, locked providers, money/Health rules, authority or gates.',
    'Hermes ahead-of-work research is advisory and may pre-cache relevant resources for upcoming plan-aligned packets; it never reprioritises the programme. Once you select this turn’s concrete Feature/task, if it is materially more specific than the queued manager instruction, run node agent-system/bin/engineering-knowledge-resolve.mjs <FEATURE_ID> --task "<concrete task>" --packet-id "$DIAL_PACKET_ID" --activate --reason "concrete dependency-safe packet selected after repository inspection" before the first material edit. Repeat audited re-resolution only when the task materially changes again.',
    'If ordinary unblocked work remains after the packet, finish normally; the Oracle mission controller will dispatch the next turn.',
    'If a genuine owner decision is required, end your final response with exactly: DIAL_MISSION_SIGNAL:BLOCKED_OWNER::<short reason>',
    'If the active canonical programme is genuinely complete, end with exactly: DIAL_MISSION_SIGNAL:COMPLETE::<short reason>',
    '',
    `ROOT MISSION: ${mission.mission_id}`,
    `OBJECTIVE: ${mission.objective}`,
  ];
  if (mission.priority_directive) parts.push(`CURRENT OWNER PRIORITY: ${mission.priority_directive}`);
  if (previous) parts.push(`PREVIOUS PACKET: ${previous.packet_id} ${previous.state} ${previous.result_state || ''}`);
  if (approvals.length) parts.push(`RECENT OWNER GATE DECISIONS: ${JSON.stringify(approvals.map((a) => ({ gate_id: a.gate_id, decision: a.decision, rationale: a.rationale })))}`);
  return parts.join('\n');
}

function parseSignal(response) {
  const text = String(response ?? '');
  const blocked = text.match(/DIAL_MISSION_SIGNAL:BLOCKED_OWNER::([^\n\r]+)/);
  if (blocked) return { type: 'BLOCKED_OWNER', reason: clean(blocked[1], 2000) };
  const complete = text.match(/DIAL_MISSION_SIGNAL:COMPLETE::([^\n\r]+)/);
  if (complete) return { type: 'COMPLETE', reason: clean(complete[1], 2000) };
  return null;
}

export function missionControllerTick({ root, developmentGate = evaluateDevelopmentUnblock } = {}) {
  const mission = ensureDialMission({ root });
  const packets = listMissionPackets({ root, limit: 500 });
  const active = packets.filter((p) => ['QUEUED', 'PROCESSING'].includes(p.state));
  if (mission.state !== 'RUNNING' || active.length) return { action: 'NOOP', mission_state: mission.state, active_packets: active.length };

  const gate = developmentGate({ repoDir: mission.repo_dir || process.env.DIAL_REPO_DIR, root });
  if (!gate.unblocked) return { action: 'DEVELOPMENT_BLOCKED', mission_state: mission.state, reason: gate.reason, checks: gate.checks };

  const recent = packets[0] || null;
  if (recent?.state === 'FAILED' && mission.state === 'WAITING_RUNTIME') return { action: 'WAITING_RUNTIME' };

  const turn = Number(mission.turn_number || 0) + 1;
  const instruction = buildManagerInstruction({ ...mission, turn_number: turn }, root);
  const ownerAuthorityRoot = [...(mission.owner_authority_roots || [])].reverse().find((item) => ['OWNER_DERIVED', 'OWNER_DELEGATED_AUTONOMY'].includes(item?.authority)) || null;
  const queued = submitExternalWork({
    root,
    repoDir: mission.repo_dir || process.env.DIAL_REPO_DIR,
    instruction,
    requestedBy: 'mission_controller',
    metadata: { mission_id: DIAL_ROOT_MISSION_ID, mission_turn: turn, priority: 50, generated_by: 'MISSION_CONTROLLER', ...(ownerAuthorityRoot ? { owner_authority_root: ownerAuthorityRoot } : {}) },
  });
  writeJsonAtomic(`missions/${DIAL_ROOT_MISSION_ID}.json`, { ...mission, turn_number: turn, last_packet_id: queued.job_id, last_packet_state: 'QUEUED', last_progress_at: now(), updated_at: now() }, root);
  appendJsonl('events/mission-control.jsonl', { event: 'MISSION_TURN_ENQUEUED', mission_id: DIAL_ROOT_MISSION_ID, mission_turn: turn, packet_id: queued.job_id, at: now() }, root);
  return { action: 'ENQUEUED', packet_id: queued.job_id, mission_turn: turn };
}

export function reconcileMissionFromCompletedPackets(root) {
  const mission = ensureDialMission({ root });
  const pointer = readJson('state/mission-controller-last-result.json', null, root);
  const packets = listMissionPackets({ root, limit: 30 }).filter((p) => ['COMPLETED', 'FAILED'].includes(p.state));
  const latest = packets[0];
  if (!latest || latest.packet_id === pointer?.packet_id) return null;
  recordMissionPacketResult({ root, packetId: latest.packet_id, state: latest.state, failure: latest.state === 'FAILED' });
  const record = readJson(`work-queue/${latest.state.toLowerCase()}/${latest.packet_id}.json`, null, root);
  const signal = parseSignal(record?.result?.response);
  if (signal?.type === 'BLOCKED_OWNER') {
    const updated = readJson(`missions/${mission.mission_id}.json`, mission, root);
    writeJsonAtomic(`missions/${mission.mission_id}.json`, { ...updated, state: 'BLOCKED_OWNER', owner_blocker: { type: 'OWNER_DECISION', reason: signal.reason, observed_at: now() }, updated_at: now() }, root);
    appendJsonl('events/mission-control.jsonl', { event: 'MISSION_BLOCKED_OWNER', mission_id: mission.mission_id, packet_id: latest.packet_id, reason: signal.reason, at: now() }, root);
  }
  if (signal?.type === 'COMPLETE') {
    const updated = readJson(`missions/${mission.mission_id}.json`, mission, root);
    writeJsonAtomic(`missions/${mission.mission_id}.json`, { ...updated, state: 'COMPLETE', updated_at: now() }, root);
    appendJsonl('events/mission-control.jsonl', { event: 'MISSION_COMPLETED', mission_id: mission.mission_id, packet_id: latest.packet_id, reason: signal.reason, at: now() }, root);
  }
  writeJsonAtomic('state/mission-controller-last-result.json', { packet_id: latest.packet_id, state: latest.state, signal, observed_at: now() }, root);
  return { packet_id: latest.packet_id, state: latest.state, signal };
}

export async function runMissionControllerDaemon({ root, pollMs = Number(process.env.DIAL_MISSION_CONTROLLER_POLL_MS || DEFAULT_POLL_MS) } = {}) {
  ensureDialMission({ root, repoDir: process.env.DIAL_REPO_DIR });
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  writeJsonAtomic('state/mission-controller-heartbeat.json', { state: 'STARTING', pid: process.pid, at: now() }, root);
  while (!stopping) {
    try {
      reconcileMissionFromCompletedPackets(root);
      const result = missionControllerTick({ root });
      writeJsonAtomic('state/mission-controller-heartbeat.json', { state: 'RUNNING', pid: process.pid, last_action: result.action, mission: missionStatus(root).state, at: now() }, root);
    } catch (error) {
      appendJsonl('events/mission-control.jsonl', { event: 'MISSION_CONTROLLER_ERROR', reason: clean(error?.message || error, 4000), at: now() }, root);
      writeJsonAtomic('state/mission-controller-heartbeat.json', { state: 'DEGRADED', pid: process.pid, reason: clean(error?.message || error, 4000), at: now() }, root);
      await new Promise((resolve) => setTimeout(resolve, DEFAULT_RETRY_MS));
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  writeJsonAtomic('state/mission-controller-heartbeat.json', { state: 'STOPPED', pid: process.pid, at: now() }, root);
}

async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'tick') return console.log(JSON.stringify(missionControllerTick({}), null, 2));
  if (command === 'reconcile') return console.log(JSON.stringify(reconcileMissionFromCompletedPackets(), null, 2));
  if (command === 'status') return console.log(JSON.stringify(missionStatus(), null, 2));
  if (command === 'daemon') return runMissionControllerDaemon({});
  throw new Error(`unknown mission-controller command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
