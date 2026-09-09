import crypto from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { describe, expect, it } from 'vitest';
import { ensureProjectRegistry } from '../agent-system/orchestration/project-registry.mjs';
import { missionStatus } from '../agent-system/orchestration/mission-control.mjs';
import { parseOperatorTextCommand, executeOperatorTextCommand } from '../agent-system/orchestration/operator-text-router.mjs';
import { extractWhatsAppTextMessages, processWhatsAppMessage, verifyMetaSignature, whatsappOperatorConfigStatus } from '../agent-system/orchestration/whatsapp-operator-adapter.mjs';
import { buildAttachmentInstruction, collectMissionEventNotifications, persistWhatsAppAttachments } from '../agent-system/orchestration/whatsapp-owner-input.mjs';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }
function makeRepo() {
  const repo = temp('dial-operator-repo');
  mkdirSync(path.join(repo, 'agent-system/registries'), { recursive: true });
  writeFileSync(path.join(repo, 'agent-system/registries/FEATURE_REGISTRY.json'), '[]\n');
  writeFileSync(path.join(repo, 'package.json'), '{}\n');
  execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repo, stdio: 'ignore' });
  return repo;
}
function rootWithRepo() {
  const root = temp('dial-operator-control'); const repo = makeRepo();
  ensureProjectRegistry(root, { dialRepoDir: repo });
  return { root, repo };
}

const config = {
  enabled: true, verify_token: 'verify-secret', app_secret: 'app-secret', access_token: 'access-secret',
  phone_number_id: '123456789', graph_api_version: 'v99.0', allowed_senders: ['263771234567'],
};

describe('DIAL unified operator gateway', () => {
  it('uses an explicit command grammar and never treats arbitrary WhatsApp prose as an instruction', () => {
    expect(parseOperatorTextCommand('instruction close the next safe packet').kind).toBe('instruction');
    expect(parseOperatorTextCommand('resume').kind).toBe('resume');
    expect(parseOperatorTextCommand('Please go change production now').kind).toBe('error');
    expect(parseOperatorTextCommand('shell rm -rf /').kind).toBe('error');
  });

  it('accepts normal full-text owner WhatsApp prose as a typed queued instruction only when explicitly enabled', async () => {
    expect(parseOperatorTextCommand('Please reconcile the current checkout with the locked plan.', { allowImplicitInstruction: true })).toMatchObject({ kind: 'instruction', implicit: true });
    const { root } = rootWithRepo();
    const out = await executeOperatorTextCommand('Please reconcile the current checkout with the locked plan.', { root, channel: 'whatsapp', actor: 'wa:test-owner', requestSeed: 'wamid.FREE-001', allowImplicitInstruction: true, transport: 'hermes_owner_self_chat' });
    expect(out.reply).toContain('Instruction accepted');
    const m = missionStatus(root);
    expect(m.packet_counts.queued).toBe(1);
    expect(m.recent_packets[0].requested_by).toBe('whatsapp:wa:test-owner');
  });

  it('persists authenticated WhatsApp steering attachments under the DIAL control root and builds a bounded instruction', () => {
    const root = temp('dial-whatsapp-upload-root');
    const cache = temp('dial-whatsapp-upload-cache');
    const source = path.join(cache, 'owner-plan.md');
    writeFileSync(source, '# Owner plan\nImplement the locked changes.\n');
    const message = { messageId: 'wamid.FILE-001', body: 'Use this document as the steering brief.', hasMedia: true, mediaType: 'document', mime: 'text/markdown', fileName: 'owner-plan.md', mediaUrls: [source] };
    const attachments = persistWhatsAppAttachments(message, { root, allowedRoots: [cache] });
    expect(attachments).toHaveLength(1);
    expect(readFileSync(attachments[0].path, 'utf8')).toContain('Implement the locked changes');
    const instruction = buildAttachmentInstruction(message, attachments);
    expect(instruction).toContain('Use this document as the steering brief.');
    expect(instruction).toContain(attachments[0].path);
    expect(instruction).toContain('canonical DIAL source-of-truth');
  });

  it('initializes automatic WhatsApp notifications without replaying history, then surfaces new important mission events', () => {
    const root = temp('dial-whatsapp-notify-root');
    const eventsDir = path.join(root, 'events'); mkdirSync(eventsDir, { recursive: true });
    const eventFile = path.join(eventsDir, 'mission-control.jsonl');
    writeFileSync(eventFile, `${JSON.stringify({ event: 'MISSION_PACKET_RECORDED', packet_id: 'old-packet', packet_state: 'COMPLETED', at: '2026-09-09T00:00:00Z' })}\n`);
    const state = {};
    expect(collectMissionEventNotifications(state, { root })).toEqual([]);
    writeFileSync(eventFile, `${JSON.stringify({ event: 'MISSION_BLOCKED_OWNER', packet_id: 'new-packet', reason: 'Owner decision required', at: '2026-09-09T00:01:00Z' })}\n`, { flag: 'a' });
    expect(collectMissionEventNotifications(state, { root })).toEqual(['DIAL needs your input\nOwner decision required']);
  });

  it('attributes queued work to the WhatsApp operator channel and preserves mission gating', async () => {
    const { root } = rootWithRepo();
    const out = await executeOperatorTextCommand('instruction Inspect one bounded safe packet.', { root, channel: 'whatsapp', actor: 'wa:test-owner', requestSeed: 'wamid.TEST-001' });
    expect(out.reply).toContain('Instruction accepted');
    const m = missionStatus(root);
    expect(m.state).toBe('PAUSED');
    expect(m.packet_counts.queued).toBe(1);
    expect(m.recent_packets[0].requested_by).toBe('whatsapp:wa:test-owner');
  });

  it('verifies the exact raw Meta webhook payload with HMAC SHA-256', () => {
    const raw = Buffer.from('{"object":"whatsapp_business_account"}');
    const sig = `sha256=${crypto.createHmac('sha256', config.app_secret).update(raw).digest('hex')}`;
    expect(verifyMetaSignature(raw, sig, config.app_secret)).toBe(true);
    expect(verifyMetaSignature(Buffer.from('{}'), sig, config.app_secret)).toBe(false);
    expect(verifyMetaSignature(raw, 'sha256=bad', config.app_secret)).toBe(false);
  });

  it('extracts only message records without trusting webhook profile data for authority', () => {
    const messages = extractWhatsAppTextMessages({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '+263 77 123 4567', profile: { name: 'Owner' } }], messages: [{ id: 'wamid.1', from: '263771234567', type: 'text', text: { body: 'status' } }, { id: 'wamid.2', from: '263771234567', type: 'image' }] } }] }] });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ sender: '263771234567', type: 'text', text: 'status' });
    expect(messages[1]).toMatchObject({ type: 'image', text: '' });
  });

  it('rejects unauthorized senders without sending an outbound reply', async () => {
    const { root } = rootWithRepo(); let sends = 0;
    const fetchImpl = async () => { sends += 1; return { ok: true, status: 200, text: async () => '' }; };
    const out = await processWhatsAppMessage({ id: 'wamid.BAD', sender: '263700000000', type: 'text', text: 'status' }, { root, config, fetchImpl });
    expect(out.unauthorized).toBe(true); expect(sends).toBe(0);
  });

  it('deduplicates WhatsApp write delivery while allowing reply recovery', async () => {
    const { root } = rootWithRepo(); const sent = [];
    const fetchImpl = async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '' }; };
    const msg = { id: 'wamid.GOOD-001', sender: '263771234567', type: 'text', text: 'instruction Implement the next safe contract.' };
    await processWhatsAppMessage(msg, { root, config, fetchImpl });
    await processWhatsAppMessage(msg, { root, config, fetchImpl });
    expect(missionStatus(root).packet_counts.queued).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('263771234567');
  });

  it('fails closed on missing or insecure WhatsApp secret configuration', () => {
    const root = temp('dial-whatsapp-config');
    expect(whatsappOperatorConfigStatus(root).state).toBe('UNCONFIGURED');
    const dir = path.join(root, 'secrets'); mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'whatsapp-operator.json');
    writeFileSync(target, JSON.stringify(config)); chmodSync(target, 0o644);
    expect(whatsappOperatorConfigStatus(root).state).toBe('INSECURE_CONFIG_MODE');
    chmodSync(target, 0o600);
    expect(whatsappOperatorConfigStatus(root)).toMatchObject({ state: 'READY', configured: true, enabled: true, allowed_sender_count: 1 });
  });

  it('keeps owner QR enrollment singleton, isolated and patched without weakening product WhatsApp', () => {
    const pairing = readFileSync('deploy/oracle/hermes-codex/pair-hermes-whatsapp.sh', 'utf8');
    expect(pairing).toContain('flock -n 9');
    expect(pairing).toContain('companion_reg_refresh');
    expect(pairing).toContain('4f263f0e365c2e74dd1b824031d1c5910f518c26');
    expect(pairing).toContain('WHATSAPP_MODE=self-chat');
    expect(pairing).not.toMatch(/cloudflared|localtunnel|ngrok/);
  });

  it('exposes the same typed control toolset through a Codex-compatible stdio MCP server', async () => {
    const { root, repo } = rootWithRepo();
    const child = spawn(process.execPath, ['agent-system/orchestration/operator-control-stdio.mjs'], {
      cwd: path.resolve('.'), env: { ...process.env, DIAL_CONTROL_HOME: root, DIAL_REPO_DIR: repo, DIAL_OPERATOR_CHANNEL: 'codex', DIAL_OPERATOR_ACTOR: 'test-owner' }, stdio: ['pipe','pipe','pipe'],
    });
    const lines = readline.createInterface({ input: child.stdout }); const received = [];
    lines.on('line', (line) => received.push(JSON.parse(line)));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    const deadline = Date.now() + 3000;
    while (received.length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    child.kill('SIGTERM'); await once(child, 'exit');
    expect(received[0].result.serverInfo.name).toBe('dial-oracle-control-codex');
    const names = received[1].result.tools.map((t) => t.name);
    expect(names).toContain('dial_submit_instruction');
    expect(names).toContain('dial_operator_channels');
    expect(names.some((name) => /shell|exec|filesystem/i.test(name))).toBe(false);
  });
});
