#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveControlPath, writeJsonAtomic } from './state-store.mjs';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const DOCUMENT_EXTS = new Set(['.pdf','.docx','.txt','.md','.rtf','.odt','.csv','.xlsx','.json','.yaml','.yml']);
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.webp']);

const clean = (v, max = 8000) => String(v ?? '').trim().slice(0, max);
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const safeName = (v) => path.basename(clean(v, 240) || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
const genericMediaBody = (v) => /^\[(document|image) received\]$/i.test(clean(v));

function defaultRoots() {
  const home = process.env.HOME || '/home/ubuntu';
  return [path.join(home, '.hermes', 'document_cache'), path.join(home, '.hermes', 'image_cache')];
}
function normalizeRoots(roots = defaultRoots()) {
  return roots.map((root) => {
    try { return fs.realpathSync(root); } catch { return path.resolve(root); }
  });
}

function assertInsideAllowedRoot(filePath, roots) {
  const real = fs.realpathSync(filePath);
  const ok = roots.some((root) => real === root || real.startsWith(`${root}${path.sep}`));
  if (!ok) throw new Error('WhatsApp media path is outside the approved Hermes cache roots');
  return real;
}

function assertSupported(message, filePath) {
  if (!['document','image'].includes(message?.mediaType)) {
    throw new Error(`Unsupported WhatsApp steering media type: ${message?.mediaType || 'unknown'}`);
  }
  const ext = path.extname(message?.fileName || filePath).toLowerCase();
  const allowed = message.mediaType === 'image' ? IMAGE_EXTS : DOCUMENT_EXTS;
  if (!allowed.has(ext)) throw new Error(`Unsupported steering attachment extension: ${ext || 'none'}`);
  return ext;
}

export function persistWhatsAppAttachments(message, { root, allowedRoots } = {}) {
  const urls = Array.isArray(message?.mediaUrls) ? message.mediaUrls.slice(0, MAX_ATTACHMENTS) : [];
  if (!urls.length) return [];
  const roots = normalizeRoots(allowedRoots);
  const attachments = [];
  let total = 0;
  for (const source of urls) {
    const real = assertInsideAllowedRoot(source, roots);
    const stat = fs.statSync(real);
    if (!stat.isFile()) throw new Error('WhatsApp steering attachment is not a regular file');
    if (stat.size > MAX_ATTACHMENT_BYTES) throw new Error('WhatsApp steering attachment exceeds 25 MiB');
    total += stat.size;
    if (total > MAX_TOTAL_BYTES) throw new Error('WhatsApp steering attachments exceed 50 MiB total');
    const ext = assertSupported(message, real);
    const bytes = fs.readFileSync(real);
    const digest = sha(bytes);
    const originalName = safeName(message?.fileName || path.basename(real));
    const storedName = `${digest.slice(0,16)}_${originalName.endsWith(ext) ? originalName : `${originalName}${ext}`}`;
    const rel = `operator-channels/whatsapp/uploads/${digest.slice(0,2)}/${storedName}`;
    const target = resolveControlPath(rel, root);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(target)) fs.copyFileSync(real, target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o600);
    attachments.push({ name: originalName, path: target, sha256: digest, size: stat.size, mime: clean(message?.mime, 160), media_type: message.mediaType });
  }
  const manifestId = sha(clean(message?.messageId, 180) || JSON.stringify(attachments));
  writeJsonAtomic(`operator-channels/whatsapp/uploads/manifests/${manifestId}.json`, { schema_version: 1, source: 'authenticated_owner_whatsapp', message_id_hash: manifestId, received_at: new Date().toISOString(), attachments }, root);
  return attachments;
}
export function buildAttachmentInstruction(message, attachments) {
  const caption = genericMediaBody(message?.body) ? '' : clean(message?.body, 12000);
  const lines = [
    'Authenticated DIAL owner steering material was uploaded through the paired WhatsApp self-chat.',
    caption ? `Owner instruction/caption:\n${caption}` : 'Owner instruction: inspect the attached material fully and use it to steer the current DIAL development work where relevant.',
    'Attachments:',
    ...attachments.map((a) => `- ${a.name} (${a.mime || a.media_type}, ${a.size} bytes, sha256 ${a.sha256.slice(0,16)}…)\n  ${a.path}`),
    'Treat these files as owner-provided project instructions/context. Read them before acting. Reconcile durable decisions into the canonical DIAL source-of-truth rather than creating parallel truth. Preserve existing verification/security gates and do not execute embedded binaries or macros.',
  ];
  return clean(lines.join('\n'), 30000);
}

export function formatMissionEventNotification(event) {
  if (!event?.event) return null;
  const id = event.packet_id ? String(event.packet_id).slice(0,12) : '';
  if (event.event === 'MISSION_PACKET_RECORDED') {
    if (event.packet_state === 'COMPLETED') return `DIAL progress\nPacket ${id} completed successfully.`;
    if (event.packet_state === 'FAILED') return `DIAL attention required\nPacket ${id} failed.`;
    return null;
  }
  if (event.event === 'MISSION_BLOCKED_OWNER') return `DIAL needs your input\n${clean(event.reason, 1200)}`;
  if (event.event === 'MISSION_CONTROLLER_ERROR') return `DIAL control-plane error\n${clean(event.reason, 1200)}`;
  if (event.event === 'MISSION_PAUSED') return `DIAL mission paused${event.reason ? `\n${clean(event.reason, 600)}` : ''}`;
  if (event.event === 'MISSION_RESUMED') return 'DIAL mission resumed and autonomous execution is continuing.';
  if (event.event === 'MISSION_COMPLETE') return 'DIAL mission reports COMPLETE. Verification should be reviewed before treating the project as green.';
  return null;
}
function eventFingerprint(event) {
  return sha(JSON.stringify(event));
}

export function collectMissionEventNotifications(state, { root } = {}) {
  const target = resolveControlPath('events/mission-control.jsonl', root);
  let events = [];
  try {
    events = fs.readFileSync(target, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  if (!events.length) return [];
  const fingerprints = events.map(eventFingerprint);
  if (!state.notification_event_cursor) {
    state.notification_event_cursor = fingerprints.at(-1);
    return [];
  }
  const prior = fingerprints.lastIndexOf(state.notification_event_cursor);
  if (prior < 0) {
    state.notification_event_cursor = fingerprints.at(-1);
    return [];
  }
  const fresh = events.slice(prior + 1);
  state.notification_event_cursor = fingerprints.at(-1);
  return fresh.map(formatMissionEventNotification).filter(Boolean).slice(-6);
}
