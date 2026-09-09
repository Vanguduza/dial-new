#!/usr/bin/env node
import crypto from 'node:crypto';
import { callChatControlTool } from './chat-control-bridge.mjs';

function clean(v, max = 8000) { return String(v ?? '').trim().slice(0, max); }
function rid(channel, seed) { return `${channel}-${crypto.createHash('sha256').update(String(seed || '')).digest('hex').slice(0, 40)}`; }
function oneLine(v, max = 220) { return clean(v, max).replace(/\s+/g, ' '); }
function help() {
  return [
    'DIAL operator commands:',
    'status | mission | progress | verify | failures [n] | packets [n] | capacity | research | knowledge | channels',
    'resume [reason] | pause [reason]',
    'priority <directive>',
    'approve <gate-id> [rationale] | reject <gate-id> [rationale]',
    'instruction <development instruction>',
    'Authenticated WhatsApp owner channels may also send a normal full-text development instruction without the instruction prefix.',
  ].join('\n');
}

export function parseOperatorTextCommand(input, { allowImplicitInstruction = false } = {}) {
  let text = clean(input, 30000);
  if (/^dial\s+/i.test(text)) text = text.replace(/^dial\s+/i, '');
  text = text.replace(/^\/+/, '');
  const [headRaw = '', ...restParts] = text.split(/\s+/);
  const head = headRaw.toLowerCase();
  const rest = clean(restParts.join(' '), 30000);
  const aliases = { verification: 'verify', fail: 'failures', failed: 'failures', instruct: 'instruction', reprioritize: 'priority', reprioritise: 'priority' };
  const command = aliases[head] || head;
  if (!command || ['help', '?', 'commands'].includes(command)) return { kind: 'help' };
  if (['status','mission','progress','verify','capacity','research','knowledge','channels'].includes(command)) return { kind: command };
  if (['failures','packets'].includes(command)) return { kind: command, limit: Math.max(1, Math.min(50, Number(rest) || 10)) };
  if (['resume','pause'].includes(command)) return { kind: command, reason: rest };
  if (command === 'priority') return rest ? { kind: command, directive: rest } : { kind: 'error', message: 'priority requires a directive' };
  if (command === 'instruction') return rest ? { kind: command, instruction: rest } : { kind: 'error', message: 'instruction requires development work text' };
  if (['approve','reject'].includes(command)) {
    const [gateId = '', ...why] = rest.split(/\s+/);
    return gateId ? { kind: command, gate_id: gateId, rationale: clean(why.join(' '), 4000) } : { kind: 'error', message: `${command} requires a gate id` };
  }
  if (allowImplicitInstruction && text) return { kind: 'instruction', instruction: text, implicit: true };
  return { kind: 'error', message: `Unknown command: ${headRaw || text}` };
}

function fmtMission(m) {
  const counts = m?.packet_counts || {};
  const blocker = m?.owner_blocker?.reason ? `\nBlocker: ${oneLine(m.owner_blocker.reason, 300)}` : '';
  return `Mission: ${m?.state || 'UNKNOWN'}\nTurn: ${m?.turn_number ?? '-'}\nPackets: ${counts.queued || 0} queued, ${counts.processing || 0} processing, ${counts.completed || 0} completed, ${counts.failed || 0} failed\nLast: ${m?.last_packet_state || '-'} ${m?.last_packet_id ? String(m.last_packet_id).slice(0, 12) : ''}${blocker}`;
}
function fmtEvents(v) {
  const events = v?.events || [];
  if (!events.length) return 'No new DIAL progress events.';
  return events.slice(-12).map((e) => `${String(e.at || e.observed_at || '').slice(11,19) || '--:--:--'} ${e.event || e.source || 'event'}`).join('\n');
}
function fmtPackets(v, label='Packets') {
  const rows = v?.packets || v?.failures || [];
  if (!rows.length) return `No ${label.toLowerCase()} found.`;
  return rows.slice(0, 12).map((p) => `${p.state || 'UNKNOWN'} ${String(p.packet_id || '').slice(0,12)} ${oneLine(p.instruction_preview || p.result_state || '', 120)}`).join('\n');
}

export async function executeOperatorTextCommand(input, { root, channel = 'whatsapp', actor = 'owner', requestSeed = '', cursor = null, allowImplicitInstruction = false, transport = null } = {}) {
  const parsed = parseOperatorTextCommand(input, { allowImplicitInstruction });
  const ctx = { channel, actor, transport: transport || (channel === 'whatsapp' ? 'whatsapp_cloud_api' : 'text_router') };
  const call = (name, args = {}) => callChatControlTool(name, args, root, ctx);
  const request_id = rid(channel, requestSeed || input);
  if (parsed.kind === 'help') return { command: parsed, reply: help() };
  if (parsed.kind === 'error') return { command: parsed, reply: `${parsed.message}\n\n${help()}` };
  if (parsed.kind === 'status') {
    const [mission, project, verification] = await Promise.all([call('dial_mission_status'), call('dial_project_status'), call('dial_verification_status')]);
    const repo = project?.repository || {};
    const gate = verification?.development_gate || {};
    const reply = [`DIAL status`, fmtMission(mission), `Repo: ${repo.branch || '-'} @ ${String(repo.head || '').slice(0,8)} ${repo.dirty ? 'DIRTY' : 'clean'}`, `Development: ${gate.unblocked === true ? 'UNBLOCKED' : (gate.state || gate.gate_status || 'BLOCKED/UNKNOWN')}`].join('\n');
    return { command: parsed, reply };
  }
  if (parsed.kind === 'mission') return { command: parsed, reply: fmtMission(await call('dial_mission_status')) };
  if (parsed.kind === 'progress') { const v = await call('dial_progress_since', { cursor: cursor || undefined, limit: 50 }); return { command: parsed, reply: fmtEvents(v), next_cursor: v.next_cursor || cursor || null }; }
  if (parsed.kind === 'verify') {
    const v = await call('dial_verification_status');
    const latest = v?.latest_verification;
    return { command: parsed, reply: `Verification: ${latest?.ok === true ? 'PASS' : latest?.ok === false ? 'FAIL' : 'NO CURRENT RESULT'}\nDevelopment gate: ${v?.development_gate?.state || v?.development_gate?.gate_status || 'UNKNOWN'}\nRuntime: ${v?.runtime_health?.state || 'UNKNOWN'}` };
  }
  if (parsed.kind === 'failures') return { command: parsed, reply: fmtPackets(await call('dial_recent_failures', { limit: parsed.limit }), 'Failures') };
  if (parsed.kind === 'packets') return { command: parsed, reply: fmtPackets(await call('dial_list_packets', { limit: parsed.limit }), 'Packets') };
  if (parsed.kind === 'capacity') { const v = await call('dial_runtime_capacity_status'); return { command: parsed, reply: `Runtime capacity\nPrimary: ${v?.primary?.state || v?.runtime?.primary?.state || 'UNKNOWN'}\nFallback: ${v?.fallback?.state || v?.runtime?.fallback?.state || 'UNKNOWN'}\nCooldown: ${v?.provider_cooldown?.active === true ? 'active' : 'not active'}` }; }
  if (parsed.kind === 'research') { const v = await call('dial_engineering_research_status'); return { command: parsed, reply: `VEKL research: ${v?.state || 'UNKNOWN'}\nForecast: ${v?.forecast_id || v?.current?.forecast_id || '-'}` }; }
  if (parsed.kind === 'knowledge') { const v = await call('dial_engineering_knowledge_status'); return { command: parsed, reply: `VEKL: ${v?.state || v?.resolution_state || 'READY'}\nActivation: ${v?.activation_id || v?.current_activation?.activation_id || '-'}\nResources: ${v?.resource_count ?? v?.resources?.length ?? '-'}` }; }
  if (parsed.kind === 'channels') { const v = await call('dial_operator_channels'); return { command: parsed, reply: `Operator channels\nControl: ${v?.chat_control?.state || 'UNKNOWN'}\nWhatsApp (Hermes): ${v?.whatsapp_hermes?.state || 'NOT_INSTALLED'}\nWhatsApp (Cloud): ${v?.whatsapp_cloud?.state || 'NOT_INSTALLED'}\nShell access: ${v?.operator_surface?.arbitrary_shell ? 'YES' : 'NO'}` }; }
  if (parsed.kind === 'resume') { const v = await call('dial_resume_mission', { reason: parsed.reason || 'owner resume from WhatsApp', request_id }); return { command: parsed, reply: `DIAL mission resumed. State: ${v.state}` }; }
  if (parsed.kind === 'pause') { const v = await call('dial_pause_mission', { reason: parsed.reason || 'owner pause from WhatsApp', request_id }); return { command: parsed, reply: `DIAL mission paused. State: ${v.state}` }; }
  if (parsed.kind === 'priority') { const v = await call('dial_reprioritize', { directive: parsed.directive, request_id }); return { command: parsed, reply: `Priority updated.\n${oneLine(v.priority_directive || parsed.directive, 500)}` }; }
  if (parsed.kind === 'approve' || parsed.kind === 'reject') {
    const tool = parsed.kind === 'approve' ? 'dial_approve_gate' : 'dial_reject_gate';
    const v = await call(tool, { gate_id: parsed.gate_id, rationale: parsed.rationale, request_id });
    return { command: parsed, reply: `${v.decision}: ${v.gate_id}` };
  }
  if (parsed.kind === 'instruction') {
    const v = await call('dial_submit_instruction', { instruction: parsed.instruction, priority: 60, request_id });
    return { command: parsed, reply: `Instruction accepted by Oracle queue.\nPacket: ${String(v.job_id || v.packet_id || '').slice(0, 24)}\nState: ${v.state || 'QUEUED'}` };
  }
  return { command: parsed, reply: help() };
}
