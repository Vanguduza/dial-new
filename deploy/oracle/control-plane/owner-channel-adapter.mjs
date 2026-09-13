#!/usr/bin/env node
import crypto from 'node:crypto';

const OWNER_SOURCES = new Set(['WHATSAPP', 'CHATGPT', 'CLAUDE', 'HERMES_OWNER']);

export function normalizeOwnerInstruction(input) {
  const source = String(input?.source ?? '').toUpperCase();
  if (!OWNER_SOURCES.has(source)) throw new Error('UNTRUSTED_OWNER_SOURCE');
  const text = String(input?.text ?? '').trim();
  if (!text) throw new Error('EMPTY_OWNER_INSTRUCTION');
  return {
    schema_version: 1,
    event: 'OWNER_STEER',
    source,
    authority: 'OWNER',
    priority: 'OWNER_REALTIME',
    instruction_sha256: crypto.createHash('sha256').update(text).digest('hex'),
    text,
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    received_at: input.received_at || new Date().toISOString(),
    policy_note: 'Owner authority controls intent and Project Truth; host safety invariants still apply.'
  };
}

export function workloadHint(envelope) {
  const t = envelope.text.toLowerCase();
  if (/\b(verify|verification|test|testing|build|compile|compilation)\b/.test(t)) return 'TEST';
  if (/\b(vekl|graphrag|index|indexing|corpus)\b/.test(t)) return 'VEKL_LIGHT';
  if (/\b(oci|recovery|ssh|commander|connectivity)\b/.test(t)) return 'RECOVERY';
  if (/\b(develop|development|implement|implementation|code|coding|fix)\b/.test(t)) return 'INTERACTIVE_DEV';
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(process.argv[2] || '{}');
  const envelope = normalizeOwnerInstruction(input);
  console.log(JSON.stringify({ ...envelope, workload_hint: workloadHint(envelope) }, null, 2));
}
