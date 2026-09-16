#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';
import { executeOperatorTextCommand, parseOperatorTextCommand } from './operator-text-router.mjs';
import { callChatControlTool } from './chat-control-bridge.mjs';
import { classifyOwnerLiveMode } from './owner-live-control.mjs';
import { buildAttachmentInstruction, collectMissionEventNotifications, collectOwnerSteeringNotifications, persistWhatsAppAttachments } from './whatsapp-owner-input.mjs';
import { compactProcessedIds, consumeSenderRateLimit } from './whatsapp-delivery-guard.mjs';

export const HERMES_WHATSAPP_OPERATOR_AUTHORITY = 'OWNER_DEDICATED_HERMES_WHATSAPP_CONTROL';
const BRIDGE = process.env.DIAL_HERMES_WHATSAPP_BRIDGE_URL || 'http://127.0.0.1:3011';
const CREDS = process.env.DIAL_HERMES_WHATSAPP_CREDS || '/home/ubuntu/.hermes/whatsapp/dial-hermes-control/session/creds.json';
const MODE = String(process.env.DIAL_HERMES_WHATSAPP_MODE || process.env.WHATSAPP_MODE || 'bot').trim().toLowerCase();
const REPLY_HEADING = cleanEnv(process.env.DIAL_HERMES_WHATSAPP_REPLY_HEADING || 'Dial Hermes Control', 120);
const OWNER_IDS_RAW = String(process.env.DIAL_HERMES_WHATSAPP_OWNER_IDS || process.env.WHATSAPP_ALLOWED_USERS || '');
const POLL_MS = Math.max(1000, Number(process.env.DIAL_HERMES_WHATSAPP_POLL_MS || 2000));
const STATE_REL = 'operator-channels/whatsapp/hermes-state.json';
const HEARTBEAT_REL = 'state/whatsapp-hermes-operator-heartbeat.json';
const MISSION_REL = 'missions/dial-development-root.json';
const MAX_PROCESSED = 250;
const MAX_OUTBOX = 128;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function cleanEnv(v, max = 8000) { return String(v ?? '').trim().slice(0, max); }
const now = () => new Date().toISOString();
const clean = (v, max = 8000) => String(v ?? '').trim().slice(0, max);
const hash = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest('hex');
const normalizeJid = (v) => clean(v, 180).replace(/:.*@/, '@');
const bare = (v) => normalizeJid(v).replace(/@.*/, '');

function event(root, name, extra = {}) {
  appendJsonl('events/whatsapp-operator.jsonl', { event: name, project: 'dial', authority: HERMES_WHATSAPP_OPERATOR_AUTHORITY, at: now(), ...extra }, root);
}
function configuredOwnerIds() {
  return [...new Set(OWNER_IDS_RAW.split(',').map((value) => bare(value)).filter((value) => /^[0-9]{8,20}$/.test(value)))];
}
function expandOwnerIds(ids) {
  const sessionDir = pathDir(CREDS);
  const resolved = new Set(ids);
  const queue = [...ids];
  while (queue.length) {
    const current = queue.shift();
    for (const suffix of ['', '_reverse']) {
      const file = `${sessionDir}/lid-mapping-${current}${suffix}.json`;
      try {
        const mapped = bare(JSON.parse(fs.readFileSync(file, 'utf8')));
        if (mapped && !resolved.has(mapped)) { resolved.add(mapped); queue.push(mapped); }
      } catch {}
    }
  }
  return resolved;
}
function pathDir(file) { return String(file || '').replace(/\/[^/]+$/, '') || '.'; }
function identity() {
  const creds = (() => { try { return JSON.parse(fs.readFileSync(CREDS, 'utf8')); } catch { return null; } })();
  const botIds = [creds?.me?.id, creds?.me?.lid].map(bare).filter(Boolean);
  const ownerIds = configuredOwnerIds();
  return { paired: botIds.length > 0, ids: [...new Set(botIds)], owner_ids: ownerIds, owner_aliases: expandOwnerIds(ownerIds), mode: MODE, fingerprint: botIds.length ? hash(botIds.sort().join('|')).slice(0, 16) : null, owner_fingerprint: ownerIds.length ? hash([...ownerIds].sort().join('|')).slice(0,16) : null };
}

function loadState(root) {
  return readJson(STATE_REL, { schema_version: 5, connected_notice_fingerprint: null, progress_cursor: null, processed: [], outbox: [], last_mission_state: null, last_blocker_hash: null, notification_event_cursor: null, steering_event_cursor: null, chat_id: null }, root);
}
function saveState(state, root) {
  writeJsonAtomic(STATE_REL, { ...state, schema_version: 5, processed: compactProcessedIds(state.processed, { maxEntries: MAX_PROCESSED }), outbox: Array.isArray(state.outbox) ? state.outbox.slice(-MAX_OUTBOX) : [], updated_at: now() }, root);
}
function seen(state, messageId) { const h = hash(messageId); return (state.processed || []).some((item) => (typeof item === 'string' ? item : item.id_hash) === h); }
function remember(state, messageId) { const h = hash(messageId); state.processed = [...compactProcessedIds(state.processed, { maxEntries: MAX_PROCESSED }).filter((item) => item.id_hash !== h), { id_hash: h, at_ms: Date.now() }].slice(-MAX_PROCESSED); }
function isAuthorizedOwnerMessage(msg, id) {
  if (msg?.isGroup === true) return false;
  if (id.mode !== 'bot' || id.owner_aliases.size === 0) return false;
  return [bare(msg?.senderId), bare(msg?.chatId)].filter(Boolean).some((candidate) => id.owner_aliases.has(candidate));
}
export function formatDialHermesControlMessage(message, heading = REPLY_HEADING) {
  const body = clean(message, 3500);
  const prefix = `*${clean(heading, 120) || 'Dial Hermes Control'}*`;
  return body.startsWith(prefix) ? body : `${prefix}\n${body}`;
}


async function bridgeHealth(fetchImpl = fetch) {
  try { const r = await fetchImpl(`${BRIDGE}/health`, { signal: AbortSignal.timeout(5000) }); return r.ok ? await r.json() : null; }
  catch { return null; }
}
async function bridgeMessages(fetchImpl = fetch) {
  const r = await fetchImpl(`${BRIDGE}/messages`, { signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`Hermes WhatsApp messages HTTP ${r.status}`);
  return await r.json();
}
async function bridgeSend(chatId, message, fetchImpl = fetch) {
  const r = await fetchImpl(`${BRIDGE}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId, message: formatDialHermesControlMessage(message) }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Hermes WhatsApp send HTTP ${r.status}`);
  const receipt = await r.json();
  const ids = Array.isArray(receipt?.messageIds) ? receipt.messageIds.filter(Boolean) : receipt?.messageId ? [receipt.messageId] : [];
  if (receipt?.success !== true || ids.length === 0) throw new Error('Hermes WhatsApp send returned no delivery receipt');
  return { message_id: ids.at(-1), message_ids: ids };
}
function enqueueOutbound(state, { chatId, message, kind = 'CONTROL', dedupeKey = null } = {}) {
  state.outbox = Array.isArray(state.outbox) ? state.outbox : [];
  const id = hash(`${kind}|${dedupeKey || message}`);
  if (state.outbox.some((item) => item.id === id)) return id;
  if (state.outbox.length >= MAX_OUTBOX) throw new Error('WhatsApp control outbox is full; refusing to drop owner-control delivery');
  state.outbox.push({ id, chat_id: normalizeJid(chatId), message: clean(message, 3500), kind, attempts: 0, created_at: now() });
  return id;
}
async function flushOutbox(state, root, fetchImpl = fetch) {
  state.outbox = Array.isArray(state.outbox) ? state.outbox : [];
  while (state.outbox.length) {
    const item = state.outbox[0];
    try {
      const receipt = await bridgeSend(item.chat_id, item.message, fetchImpl);
      event(root, 'HERMES_WHATSAPP_DELIVERY_CONFIRMED', { kind: item.kind, outbox_id: item.id.slice(0,24), message_id_hash: hash(receipt.message_id).slice(0,24), chunk_count: receipt.message_ids.length });
      state.outbox.shift();
      saveState(state, root);
    } catch (error) {
      item.attempts = Number(item.attempts || 0) + 1;
      item.last_attempt_at = now();
      item.last_error_sha256 = hash(clean(error?.message || error, 1200));
      saveState(state, root);
      event(root, 'HERMES_WHATSAPP_DELIVERY_RETRY_PENDING', { kind: item.kind, outbox_id: item.id.slice(0,24), attempts: item.attempts, error_sha256: item.last_error_sha256 });
      return { ok: false, pending: state.outbox.length };
    }
  }
  return { ok: true, pending: 0 };
}
function naturalReadShortcut(text) {
  if (classifyOwnerLiveMode(text) !== 'query') return null;
  const t = clean(text, 4000).toLowerCase();
  if (/owner.{0,30}block|block(age|er|ed)|why.{0,20}blocked/.test(t)) return 'mission';
  if (/(status|state)/.test(t) && /(project|dial|current|what|how)/.test(t)) return 'status';
  if (/(progress|latest|happened|changed)/.test(t)) return 'progress';
  if (/(verif(y|ication|ied)|tests?|green)/.test(t)) return 'verify';
  return null;
}

function missionAttentionText(m) {
  const counts = m?.packet_counts || {};
  const lines = [`DIAL attention required`, `Mission: ${m?.state || 'UNKNOWN'}`, `Turn: ${m?.turn_number ?? '-'}`, `Packets: ${counts.queued || 0} queued, ${counts.processing || 0} processing, ${counts.completed || 0} completed, ${counts.failed || 0} failed`];
  if (m?.owner_blocker?.reason) lines.push(`Blocker: ${clean(m.owner_blocker.reason, 800)}`);
  return lines.join('\n');
}
function writeHeartbeat(root, state, extra = {}) {
  writeJsonAtomic(HEARTBEAT_REL, { service: 'dial-hermes-whatsapp-operator', project: 'dial', authority: HERMES_WHATSAPP_OPERATOR_AUTHORITY, pid: process.pid, state, bridge: BRIDGE, at: now(), ...extra }, root);
}

export async function hermesWhatsAppOperatorTick({ root, fetchImpl = fetch, state = loadState(root) } = {}) {
  ensureControlLayout(root);
  const id = identity();
  if (!id.paired) { writeHeartbeat(root, 'WAITING_PAIRING', { paired: false }); return { state, action: 'WAITING_PAIRING' }; }
  const health = await bridgeHealth(fetchImpl);
  if (health?.status !== 'connected') { writeHeartbeat(root, 'BRIDGE_DISCONNECTED', { paired: true, identity_fingerprint: id.fingerprint, bridge_status: health?.status || null }); return { state, action: 'BRIDGE_DISCONNECTED' }; }
  if (MODE !== 'bot') { writeHeartbeat(root, 'MODE_INVALID', { paired: true, mode: MODE }); return { state, action: 'MODE_INVALID' }; }
  if (id.owner_ids.length !== 1) { writeHeartbeat(root, 'OWNER_ALLOWLIST_INVALID', { paired: true, owner_count: id.owner_ids.length }); return { state, action: 'OWNER_ALLOWLIST_INVALID' }; }
  writeHeartbeat(root, 'READY', { paired: true, identity_fingerprint: id.fingerprint, owner_fingerprint: id.owner_fingerprint, bridge_status: 'connected', mode: MODE, owner_count: id.owner_ids.length });
  await flushOutbox(state, root, fetchImpl);

  const messages = await bridgeMessages(fetchImpl);
  for (const msg of Array.isArray(messages) ? messages : []) {
    const messageId = clean(msg?.messageId, 180);
    const chatId = normalizeJid(msg?.chatId);
    const body = clean(msg?.body, 30000);
    const hasMedia = msg?.hasMedia === true;
    if (!messageId || (!body && !hasMedia) || seen(state, messageId)) continue;
    if (!isAuthorizedOwnerMessage(msg, id)) {
      event(root, 'HERMES_WHATSAPP_OPERATOR_REJECTED_UNAUTHORIZED_OWNER', { message_id_hash: hash(messageId).slice(0, 24), chat_id_hash: hash(chatId).slice(0, 24) });
      remember(state, messageId); continue;
    }
    const sender_hash = hash(bare(chatId)).slice(0, 24);
    const rate = consumeSenderRateLimit({ root, senderHash: sender_hash });
    if (!rate.ok) event(root, 'HERMES_WHATSAPP_OPERATOR_RATE_PRESSURE', { sender_hash, message_id_hash: hash(messageId).slice(0, 24), retry_after_ms: rate.retry_after_ms });
    state.chat_id = chatId;
    try {
      let routed;
      let attachmentCount = 0;
      const operator = { channel: 'whatsapp', actor: `owner:${id.owner_fingerprint || 'unknown'}`, transport: 'hermes_owner_whatsapp' };
      const ownerRequestId = `wa-owner-${hash(messageId).slice(0,40)}`;
      if (hasMedia) {
        const attachments = persistWhatsAppAttachments(msg, { root });
        attachmentCount = attachments.length;
        if (!attachments.length) throw new Error('No supported steering attachment was available after WhatsApp media download');
        const instruction = buildAttachmentInstruction(msg, attachments);
        const steer = await callChatControlTool('dial_owner_steer', { instruction, attachment_count: attachmentCount, request_id: ownerRequestId }, root, operator);
        routed = { command: { kind: 'owner_steer', mode: 'instruction' }, reply: steer.reply || `Owner steer ${steer.sequence || ''} registered.` };
      } else {
        const parsed = parseOperatorTextCommand(body);
        if (parsed.kind === 'instruction') {
          const steer = await callChatControlTool('dial_owner_steer', { instruction: parsed.instruction, request_id: ownerRequestId }, root, operator);
          routed = { command: { kind: 'owner_steer', mode: 'instruction' }, reply: steer.reply || `Owner steer ${steer.sequence || ''} registered.` };
        } else if (parsed.kind !== 'error') {
          routed = await executeOperatorTextCommand(body, { root, channel: 'whatsapp', actor: `owner:${id.owner_fingerprint || 'unknown'}`, requestSeed: messageId, cursor: state.progress_cursor, transport: 'hermes_owner_whatsapp' });
        } else {
          const semanticShortcut = naturalReadShortcut(body);
          if (semanticShortcut) {
            routed = await executeOperatorTextCommand(semanticShortcut, { root, channel: 'whatsapp', actor: `owner:${id.owner_fingerprint || 'unknown'}`, requestSeed: messageId, cursor: state.progress_cursor, transport: 'hermes_owner_whatsapp' });
          } else {
            const mode = classifyOwnerLiveMode(body);
            if (mode === 'query') {
              enqueueOutbound(state, { chatId, message: 'Checking the live DIAL repository/control plane now.', kind: 'QUERY_ACK', dedupeKey: `${messageId}:query-ack` });
              saveState(state, root); await flushOutbox(state, root, fetchImpl);
              const live = await callChatControlTool('dial_owner_live_turn', { instruction: body, mode: 'query', request_id: ownerRequestId }, root, operator);
              routed = { command: { kind: 'owner_live', mode: 'query' }, reply: live.state === 'COMPLETED' ? (live.response || 'Owner query completed.') : `Owner query failed: ${clean(live.reason || live.failure_state, 1200)}` };
            } else {
              const steer = await callChatControlTool('dial_owner_steer', { instruction: body, request_id: ownerRequestId }, root, operator);
              routed = { command: { kind: 'owner_steer', mode: 'instruction' }, reply: steer.reply || `Owner steer ${steer.sequence || ''} registered.` };
            }
          }
        }
      }
      if (routed.next_cursor) state.progress_cursor = routed.next_cursor;
      remember(state, messageId);
      enqueueOutbound(state, { chatId, message: routed.reply, kind: 'COMMAND_REPLY', dedupeKey: messageId });
      saveState(state, root);
      await flushOutbox(state, root, fetchImpl);
      event(root, 'HERMES_WHATSAPP_OPERATOR_COMMAND_COMPLETED', { command: routed.command?.kind || 'unknown', owner_live: routed.command?.kind === 'owner_live', owner_steer: routed.command?.kind === 'owner_steer', attachment_count: attachmentCount, message_id_hash: hash(messageId).slice(0, 24), identity_fingerprint: id.fingerprint });
    } catch (err) {
      event(root, 'HERMES_WHATSAPP_OPERATOR_COMMAND_FAILED', { error_sha256: hash(clean(err?.message || err, 2000)), message_id_hash: hash(messageId).slice(0, 24) });
      remember(state, messageId);
      try { enqueueOutbound(state, { chatId, message: `DIAL control error: ${clean(err?.message || err, 1000)}`, kind: 'COMMAND_ERROR', dedupeKey: `${messageId}:error` }); saveState(state, root); await flushOutbox(state, root, fetchImpl); } catch {}
    }
  }

  const chatId = state.chat_id;
  if (chatId && state.connected_notice_fingerprint !== id.fingerprint) {
    enqueueOutbound(state, { chatId, message: 'Connected. Send normal full-text development instructions, documents or images. Your instructions are treated as owner authority and applied before later autonomous work.', kind: 'CONNECTED', dedupeKey: `connected:${id.fingerprint}` });
    state.connected_notice_fingerprint = id.fingerprint;
  }
  const mission = readJson(MISSION_REL, null, root);
  if (chatId && mission) {
    const blockerHash = mission?.owner_blocker?.reason ? hash(mission.owner_blocker.reason) : null;
    const important = ['WAITING_RUNTIME', 'COMPLETE'].includes(mission.state);
    if (important && (mission.state !== state.last_mission_state || blockerHash !== state.last_blocker_hash)) enqueueOutbound(state, { chatId, message: missionAttentionText(mission), kind: 'MISSION_ATTENTION', dedupeKey: `mission:${mission.state}:${blockerHash || 'none'}:${mission.turn_number || 0}` });
    state.last_mission_state = mission.state; state.last_blocker_hash = blockerHash;
  }
  if (chatId) {
    const missionStage = { ...state };
    const missionNotices = collectMissionEventNotifications(missionStage, { root });
    missionNotices.forEach((notice, index) => enqueueOutbound(state, { chatId, message: notice, kind: 'MISSION_EVENT', dedupeKey: `mission-event:${missionStage.notification_event_cursor}:${index}` }));
    if (missionNotices.length || missionStage.notification_event_cursor !== state.notification_event_cursor) state.notification_event_cursor = missionStage.notification_event_cursor;
    const steeringStage = { ...state };
    const steeringNotices = collectOwnerSteeringNotifications(steeringStage, { root });
    steeringNotices.forEach((notice, index) => enqueueOutbound(state, { chatId, message: notice, kind: 'OWNER_STEER_EVENT', dedupeKey: `steer-event:${steeringStage.steering_event_cursor}:${index}` }));
    if (steeringNotices.length || steeringStage.steering_event_cursor !== state.steering_event_cursor) state.steering_event_cursor = steeringStage.steering_event_cursor;
  }
  saveState(state, root);
  await flushOutbox(state, root, fetchImpl);
  return { state, action: 'READY', processed_messages: Array.isArray(messages) ? messages.length : 0 };
}

async function main() {
  const command = process.argv[2] || 'daemon';
  if (command === 'status') { const id = identity(); const h = await bridgeHealth(); const ready = id.paired && id.mode === 'bot' && id.owner_ids.length === 1 && h?.status === 'connected'; console.log(JSON.stringify({ authority: HERMES_WHATSAPP_OPERATOR_AUTHORITY, state: ready ? 'READY' : 'NOT_READY', mode: id.mode, paired: id.paired, owner_count: id.owner_ids.length, identity_fingerprint: id.fingerprint, owner_fingerprint: id.owner_fingerprint, bridge: h?.status || 'unavailable', heartbeat: readJson(HEARTBEAT_REL, null) }, null, 2)); if (!ready) process.exitCode = 2; return; }
  if (command === 'tick') return console.log(JSON.stringify(await hermesWhatsAppOperatorTick({}), null, 2));
  if (command !== 'daemon') throw new Error(`unknown Hermes WhatsApp operator command: ${command}`);
  let state = loadState();
  while (true) {
    try { ({ state } = await hermesWhatsAppOperatorTick({ state })); }
    catch (err) { event(undefined, 'HERMES_WHATSAPP_OPERATOR_LOOP_ERROR', { error_sha256: hash(clean(err?.message || err, 2000)) }); writeHeartbeat(undefined, 'ERROR'); }
    await sleep(POLL_MS);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error(err.stack || err); process.exitCode = 1; });
