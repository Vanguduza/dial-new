#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { appendJsonl, ensureControlLayout, readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';
import { executeOperatorTextCommand, parseOperatorTextCommand } from './operator-text-router.mjs';
import { callChatControlTool } from './chat-control-bridge.mjs';
import { classifyOwnerLiveMode } from './owner-live-control.mjs';

export const WHATSAPP_OPERATOR_AUTHORITY = 'OWNER_ONLY_TYPED_DIAL_CONTROL';
export const WHATSAPP_OPERATOR_CONFIG_REL = 'secrets/whatsapp-operator.json';
const DEFAULT_HOST = process.env.DIAL_WHATSAPP_OPERATOR_HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.DIAL_WHATSAPP_OPERATOR_PORT || 9132);
const WEBHOOK_PATH = '/whatsapp/operator/webhook';
const MAX_BODY = 512 * 1024;
const MAX_REPLY = 3500;

function now() { return new Date().toISOString(); }
function clean(v, max = 8000) { return String(v ?? '').trim().slice(0, max); }
function hash(v) { return crypto.createHash('sha256').update(String(v ?? '')).digest('hex'); }
function senderKey(v) { return hash(normalizeSender(v)).slice(0, 24); }
function normalizeSender(v) { return clean(v, 80).replace(/[^0-9]/g, ''); }
function timingSafeText(a, b) {
  const aa = Buffer.from(String(a ?? '')); const bb = Buffer.from(String(b ?? ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function safeJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}
async function readRaw(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('request body too large'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

function configPath(root) { return resolveControlPath(WHATSAPP_OPERATOR_CONFIG_REL, root); }
export function whatsappOperatorConfigStatus(root) {
  ensureControlLayout(root);
  const target = configPath(root);
  if (!fs.existsSync(target)) return { configured: false, enabled: false, state: 'UNCONFIGURED', path: target };
  const stat = fs.statSync(target);
  if ((stat.mode & 0o077) !== 0) return { configured: false, enabled: false, state: 'INSECURE_CONFIG_MODE', path: target, mode: (stat.mode & 0o777).toString(8) };
  let config;
  try { config = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { return { configured: false, enabled: false, state: 'INVALID_CONFIG_JSON', path: target }; }
  const allowed = Array.isArray(config.allowed_senders) ? config.allowed_senders.map(normalizeSender).filter(Boolean) : [];
  const required = ['verify_token', 'app_secret', 'access_token', 'phone_number_id', 'graph_api_version'];
  const missing = required.filter((key) => !clean(config[key], 10000));
  if (!allowed.length) missing.push('allowed_senders');
  const versionOk = /^v\d+\.\d+$/.test(clean(config.graph_api_version, 20));
  if (!versionOk && config.graph_api_version) missing.push('valid_graph_api_version');
  const configured = missing.length === 0;
  return {
    configured, enabled: configured && config.enabled === true,
    state: !configured ? 'UNCONFIGURED' : (config.enabled === true ? 'READY' : 'DISABLED'),
    path: target, allowed_sender_count: allowed.length, phone_number_id_fingerprint: config.phone_number_id ? hash(config.phone_number_id).slice(0, 16) : null,
    graph_api_version: clean(config.graph_api_version, 20) || null, missing: [...new Set(missing)],
  };
}
function readConfig(root) {
  const status = whatsappOperatorConfigStatus(root);
  if (!status.configured || !status.enabled) throw new Error(`WhatsApp operator channel is ${status.state}`);
  const config = JSON.parse(fs.readFileSync(configPath(root), 'utf8'));
  return { ...config, allowed_senders: config.allowed_senders.map(normalizeSender).filter(Boolean) };
}

export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  const header = clean(signatureHeader, 200);
  if (!header.startsWith('sha256=') || !appSecret) return false;
  const received = header.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return timingSafeText(received.toLowerCase(), expected.toLowerCase());
}

export function extractWhatsAppTextMessages(payload) {
  const out = [];
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const contacts = new Map((Array.isArray(value.contacts) ? value.contacts : []).map((c) => [normalizeSender(c?.wa_id), clean(c?.profile?.name, 120)]));
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const sender = normalizeSender(message?.from);
        out.push({
          id: clean(message?.id, 180), sender, sender_name: contacts.get(sender) || null,
          type: clean(message?.type, 40), text: message?.type === 'text' ? clean(message?.text?.body, 30000) : '',
          timestamp: clean(message?.timestamp, 40) || null,
        });
      }
    }
  }
  return out.filter((m) => m.id && m.sender);
}

function processedRel(messageId) { return `operator-channels/whatsapp/processed/${hash(messageId)}.json`; }
function cursorRel(sender) { return `operator-channels/whatsapp/cursors/${senderKey(sender)}.json`; }
function readCursor(sender, root) { return readJson(cursorRel(sender), null, root)?.cursor || null; }
function writeCursor(sender, cursor, root) { if (cursor) writeJsonAtomic(cursorRel(sender), { schema_version: 1, sender_hash: senderKey(sender), cursor, updated_at: now() }, root); }
function recordEvent(root, event, extra = {}) { appendJsonl('events/whatsapp-operator.jsonl', { event, project: 'dial', authority: WHATSAPP_OPERATOR_AUTHORITY, at: now(), ...extra }, root); }

export async function sendWhatsAppText({ config, to, text, fetchImpl = fetch }) {
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(config.graph_api_version)}/${encodeURIComponent(config.phone_number_id)}/messages`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: clean(text, MAX_REPLY) } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = clean(await response.text().catch(() => ''), 800);
    throw new Error(`WhatsApp Cloud API send failed HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  return { ok: true, status: response.status };
}

export async function processWhatsAppMessage(message, { root, config, fetchImpl = fetch } = {}) {
  const sender = normalizeSender(message?.sender);
  const sender_hash = senderKey(sender);
  if (!config.allowed_senders.includes(sender)) {
    recordEvent(root, 'WHATSAPP_OPERATOR_UNAUTHORIZED_SENDER', { sender_hash, message_id_hash: hash(message?.id).slice(0, 24) });
    return { accepted: false, unauthorized: true };
  }
  const rel = processedRel(message.id);
  const previous = readJson(rel, null, root);
  if (previous?.action_done === true) {
    if (previous.reply_sent !== true && previous.reply) {
      await sendWhatsAppText({ config, to: sender, text: previous.reply, fetchImpl });
      writeJsonAtomic(rel, { ...previous, reply_sent: true, reply_sent_at: now() }, root);
    }
    recordEvent(root, 'WHATSAPP_OPERATOR_DUPLICATE_REPLAY', { sender_hash, message_id_hash: hash(message.id).slice(0, 24) });
    return { accepted: true, duplicate: true };
  }

  const commandText = message.type === 'text' ? message.text : 'help';
  recordEvent(root, 'WHATSAPP_OPERATOR_COMMAND_RECEIVED', { sender_hash, message_id_hash: hash(message.id).slice(0, 24), message_type: message.type });
  let routed;
  if (message.type !== 'text') {
    routed = { command: { kind: 'help' }, reply: 'DIAL operator control accepts text commands only on the Cloud API adapter. Send help to list commands.' };
  } else {
    const parsed = parseOperatorTextCommand(commandText);
    if (parsed.kind === 'instruction') {
      const requestId = `wa-cloud-${hash(message.id).slice(0, 40)}`;
      const operator = { channel: 'whatsapp', actor: `wa:${sender_hash}`, transport: 'whatsapp_cloud_api' };
      const steer = await callChatControlTool('dial_owner_steer', { instruction: parsed.instruction, request_id: requestId }, root, operator);
      routed = { command: { kind: 'owner_steer', mode: 'instruction' }, reply: steer.reply || `Owner steer ${steer.sequence || ''} registered.` };
    } else if (parsed.kind !== 'error') {
      routed = await executeOperatorTextCommand(commandText, { root, channel: 'whatsapp', actor: `wa:${sender_hash}`, requestSeed: message.id, cursor: readCursor(sender, root), transport: 'whatsapp_cloud_api' });
    } else {
      const mode = classifyOwnerLiveMode(commandText);
      const requestId = `wa-cloud-${hash(message.id).slice(0, 40)}`;
      const operator = { channel: 'whatsapp', actor: `wa:${sender_hash}`, transport: 'whatsapp_cloud_api' };
      if (mode === 'query') {
        const live = await callChatControlTool('dial_owner_live_turn', { instruction: commandText, mode: 'query', request_id: requestId }, root, operator);
        routed = { command: { kind: 'owner_live', mode: 'query' }, reply: live.state === 'COMPLETED' ? (live.response || 'Owner query completed.') : `Owner query failed: ${clean(live.reason || live.failure_state, 1200)}` };
      } else {
        const steer = await callChatControlTool('dial_owner_steer', { instruction: commandText, request_id: requestId }, root, operator);
        routed = { command: { kind: 'owner_steer', mode: 'instruction' }, reply: steer.reply || `Owner steer ${steer.sequence || ''} registered.` };
      }
    }
  }
  if (routed.next_cursor) writeCursor(sender, routed.next_cursor, root);
  const record = {
    schema_version: 1, message_id_hash: hash(message.id), sender_hash, command: routed.command?.kind || 'unknown',
    action_done: true, reply: clean(routed.reply, MAX_REPLY), reply_sent: false, completed_at: now(),
  };
  writeJsonAtomic(rel, record, root);
  recordEvent(root, 'WHATSAPP_OPERATOR_COMMAND_COMPLETED', { sender_hash, message_id_hash: hash(message.id).slice(0, 24), command: record.command });
  await sendWhatsAppText({ config, to: sender, text: record.reply, fetchImpl });
  writeJsonAtomic(rel, { ...record, reply_sent: true, reply_sent_at: now() }, root);
  recordEvent(root, 'WHATSAPP_OPERATOR_REPLY_SENT', { sender_hash, message_id_hash: hash(message.id).slice(0, 24), command: record.command });
  return { accepted: true, command: record.command };
}

function heartbeat(root, host, port) {
  const cfg = whatsappOperatorConfigStatus(root);
  writeJsonAtomic('state/whatsapp-operator-heartbeat.json', {
    service: 'dial-whatsapp-operator', project: 'dial', authority: WHATSAPP_OPERATOR_AUTHORITY,
    pid: process.pid, host, port, webhook_path: WEBHOOK_PATH, state: cfg.state, configured: cfg.configured, enabled: cfg.enabled,
    allowed_sender_count: cfg.allowed_sender_count || 0, graph_api_version: cfg.graph_api_version || null, at: now(),
  }, root);
}

export function createWhatsAppOperatorServer({ root, host = DEFAULT_HOST, port = DEFAULT_PORT, fetchImpl = fetch } = {}) {
  ensureControlLayout(root);
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const cfg = whatsappOperatorConfigStatus(root); return safeJson(res, 200, { service: 'dial-whatsapp-operator', project: 'dial', authority: WHATSAPP_OPERATOR_AUTHORITY, ...cfg, path: undefined, at: now() });
    }
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (parsedUrl.pathname !== WEBHOOK_PATH) return safeJson(res, 404, { error: 'not found' });
    let config;
    try { config = readConfig(root); } catch (err) { return safeJson(res, 503, { error: clean(err?.message || err, 300) }); }
    if (req.method === 'GET') {
      const mode = parsedUrl.searchParams.get('hub.mode');
      const token = parsedUrl.searchParams.get('hub.verify_token');
      const challenge = parsedUrl.searchParams.get('hub.challenge') || '';
      if (mode === 'subscribe' && timingSafeText(token, config.verify_token)) { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); return res.end(challenge); }
      return safeJson(res, 403, { error: 'verification failed' });
    }
    if (req.method !== 'POST') return safeJson(res, 405, { error: 'GET or POST required' });
    try {
      const raw = await readRaw(req);
      if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], config.app_secret)) return safeJson(res, 401, { error: 'invalid signature' });
      const payload = JSON.parse(raw.toString('utf8'));
      const messages = extractWhatsAppTextMessages(payload);
      for (const message of messages) await processWhatsAppMessage(message, { root, config, fetchImpl });
      return safeJson(res, 200, { received: true, messages: messages.length });
    } catch (err) {
      recordEvent(root, 'WHATSAPP_OPERATOR_WEBHOOK_ERROR', { error_sha256: hash(clean(err?.message || err, 2000)) });
      return safeJson(res, 500, { error: 'webhook processing failed' });
    }
  });
  server.listen(port, host, () => heartbeat(root, host, port));
  const timer = setInterval(() => heartbeat(root, host, port), 30000); timer.unref();
  const stop = () => { clearInterval(timer); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  return server;
}

async function main() {
  const command = process.argv[2] || 'serve';
  if (command === 'serve') { createWhatsAppOperatorServer({}); return; }
  if (command === 'status') return console.log(JSON.stringify(whatsappOperatorConfigStatus(), null, 2));
  if (command === 'config-template') return console.log(JSON.stringify({ schema_version: 1, enabled: false, verify_token: '<secret>', app_secret: '<meta-app-secret>', access_token: '<whatsapp-cloud-api-access-token>', phone_number_id: '<meta-phone-number-id>', graph_api_version: '<vNN.N>', allowed_senders: ['<owner-wa-id-digits-only>'] }, null, 2));
  throw new Error(`unknown WhatsApp operator command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error(err.stack || err); process.exitCode = 1; });
