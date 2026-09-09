#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';
import { executeOperatorTextCommand } from './operator-text-router.mjs';
import { buildAttachmentInstruction, collectMissionEventNotifications, persistWhatsAppAttachments } from './whatsapp-owner-input.mjs';

export const HERMES_WHATSAPP_OPERATOR_AUTHORITY = 'OWNER_SELF_CHAT_TYPED_DIAL_CONTROL';
const BRIDGE = process.env.DIAL_HERMES_WHATSAPP_BRIDGE_URL || 'http://127.0.0.1:3011';
const CREDS = process.env.DIAL_HERMES_WHATSAPP_CREDS || '/home/ubuntu/.hermes/whatsapp/session/creds.json';
const POLL_MS = Math.max(1000, Number(process.env.DIAL_HERMES_WHATSAPP_POLL_MS || 2000));
const STATE_REL = 'operator-channels/whatsapp/hermes-state.json';
const HEARTBEAT_REL = 'state/whatsapp-hermes-operator-heartbeat.json';
const MISSION_REL = 'missions/dial-development-root.json';
const MAX_PROCESSED = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();
const clean = (v, max = 8000) => String(v ?? '').trim().slice(0, max);
const hash = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest('hex');
const normalizeJid = (v) => clean(v, 180).replace(/:.*@/, '@');
const bare = (v) => normalizeJid(v).replace(/@.*/, '');

function event(root, name, extra = {}) {
  appendJsonl('events/whatsapp-operator.jsonl', { event: name, project: 'dial', authority: HERMES_WHATSAPP_OPERATOR_AUTHORITY, at: now(), ...extra }, root);
}
function identity() {
  const creds = (() => { try { return JSON.parse(fs.readFileSync(CREDS, 'utf8')); } catch { return null; } })();
  const ids = [creds?.me?.id, creds?.me?.lid].map(bare).filter(Boolean);
  return { paired: ids.length > 0, ids: [...new Set(ids)], fingerprint: ids.length ? hash(ids.sort().join('|')).slice(0, 16) : null };
}
function loadState(root) {
  return readJson(STATE_REL, { schema_version: 2, connected_notice_fingerprint: null, progress_cursor: null, processed: [], last_mission_state: null, last_blocker_hash: null, notification_event_cursor: null, chat_id: null }, root);
}
function saveState(state, root) {
  writeJsonAtomic(STATE_REL, { ...state, schema_version: 2, processed: (state.processed || []).slice(-MAX_PROCESSED), updated_at: now() }, root);
}
function seen(state, messageId) { const h = hash(messageId); return (state.processed || []).includes(h); }
function remember(state, messageId) { const h = hash(messageId); state.processed = [...(state.processed || []).filter((v) => v !== h), h].slice(-MAX_PROCESSED); }
function isSelfChat(chatId, ids) { const n = bare(chatId); return Boolean(n && ids.includes(n)); }

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
  const r = await fetchImpl(`${BRIDGE}/send`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chatId, message: clean(message, 3500) }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Hermes WhatsApp send HTTP ${r.status}`);
  return true;
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
  writeHeartbeat(root, 'READY', { paired: true, identity_fingerprint: id.fingerprint, bridge_status: 'connected' });

  const messages = await bridgeMessages(fetchImpl);
  for (const msg of Array.isArray(messages) ? messages : []) {
    const messageId = clean(msg?.messageId, 180);
    const chatId = normalizeJid(msg?.chatId);
    const body = clean(msg?.body, 30000);
    const hasMedia = msg?.hasMedia === true;
    if (!messageId || (!body && !hasMedia) || seen(state, messageId)) continue;
    if (!isSelfChat(chatId, id.ids)) {
      event(root, 'HERMES_WHATSAPP_OPERATOR_REJECTED_NON_SELF_CHAT', { message_id_hash: hash(messageId).slice(0, 24), chat_id_hash: hash(chatId).slice(0, 24) });
      remember(state, messageId); continue;
    }
    state.chat_id = chatId;
    try {
      let routed;
      let attachmentCount = 0;
      if (hasMedia) {
        const attachments = persistWhatsAppAttachments(msg, { root });
        attachmentCount = attachments.length;
        if (!attachments.length) throw new Error('No supported steering attachment was available after WhatsApp media download');
        const instruction = buildAttachmentInstruction(msg, attachments);
        routed = await executeOperatorTextCommand(`instruction ${instruction}`, { root, channel: 'whatsapp', actor: `self:${id.fingerprint}`, requestSeed: messageId, cursor: state.progress_cursor, transport: 'hermes_owner_self_chat' });
      } else {
        routed = await executeOperatorTextCommand(body, { root, channel: 'whatsapp', actor: `self:${id.fingerprint}`, requestSeed: messageId, cursor: state.progress_cursor, allowImplicitInstruction: true, transport: 'hermes_owner_self_chat' });
      }
      if (routed.next_cursor) state.progress_cursor = routed.next_cursor;
      remember(state, messageId);
      saveState(state, root);
      await bridgeSend(chatId, routed.reply, fetchImpl);
      event(root, 'HERMES_WHATSAPP_OPERATOR_COMMAND_COMPLETED', { command: routed.command?.kind || 'unknown', implicit_instruction: routed.command?.implicit === true, attachment_count: attachmentCount, message_id_hash: hash(messageId).slice(0, 24), identity_fingerprint: id.fingerprint });
    } catch (err) {
      event(root, 'HERMES_WHATSAPP_OPERATOR_COMMAND_FAILED', { error_sha256: hash(clean(err?.message || err, 2000)), message_id_hash: hash(messageId).slice(0, 24) });
      try { await bridgeSend(chatId, `DIAL control error: ${clean(err?.message || err, 1000)}`, fetchImpl); } catch {}
    }
  }

  const chatId = state.chat_id;
  if (chatId && state.connected_notice_fingerprint !== id.fingerprint) {
    await bridgeSend(chatId, 'DIAL operator control is connected. Send normal full-text development instructions, upload supported documents/images, or send HELP for shortcut commands.', fetchImpl);
    state.connected_notice_fingerprint = id.fingerprint;
  }
  const mission = readJson(MISSION_REL, null, root);
  if (chatId && mission) {
    const blockerHash = mission?.owner_blocker?.reason ? hash(mission.owner_blocker.reason) : null;
    const important = ['WAITING_RUNTIME', 'COMPLETE'].includes(mission.state);
    if (important && (mission.state !== state.last_mission_state || blockerHash !== state.last_blocker_hash)) await bridgeSend(chatId, missionAttentionText(mission), fetchImpl);
    state.last_mission_state = mission.state; state.last_blocker_hash = blockerHash;
  }
  if (chatId) {
    for (const notice of collectMissionEventNotifications(state, { root })) await bridgeSend(chatId, notice, fetchImpl);
  }
  saveState(state, root);
  return { state, action: 'READY', processed_messages: Array.isArray(messages) ? messages.length : 0 };
}

async function main() {
  const command = process.argv[2] || 'daemon';
  if (command === 'status') { const id = identity(); const h = await bridgeHealth(); return console.log(JSON.stringify({ authority: HERMES_WHATSAPP_OPERATOR_AUTHORITY, paired: id.paired, identity_fingerprint: id.fingerprint, bridge: h?.status || 'unavailable', heartbeat: readJson(HEARTBEAT_REL, null) }, null, 2)); }
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
