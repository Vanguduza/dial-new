import crypto from 'node:crypto';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { describe, expect, it } from 'vitest';
import { ensureProjectRegistry } from '../agent-system/orchestration/project-registry.mjs';
import { markDialMissionBlocked, missionStatus } from '../agent-system/orchestration/mission-control.mjs';
import { parseOperatorTextCommand, executeOperatorTextCommand } from '../agent-system/orchestration/operator-text-router.mjs';
import { extractWhatsAppTextMessages, processWhatsAppMessage, verifyMetaSignature, whatsappOperatorConfigStatus } from '../agent-system/orchestration/whatsapp-operator-adapter.mjs';
import { buildAttachmentInstruction, collectMissionEventNotifications, collectOwnerSteeringNotifications, persistWhatsAppAttachments } from '../agent-system/orchestration/whatsapp-owner-input.mjs';
import { classifyOwnerLiveMode, executeOwnerLiveTurn } from '../agent-system/orchestration/owner-live-control.mjs';
import { ownerSteeringBlocksAutonomous, ownerSteeringStatus, processOwnerSteeringTick, submitOwnerSteer } from '../agent-system/orchestration/owner-steering-broker.mjs';
import { processNextExternalWork, submitExternalWork } from '../agent-system/orchestration/external-orchestrator.mjs';
import { callChatControlTool } from '../agent-system/orchestration/chat-control-bridge.mjs';

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

  it('never lets normal prose fall through into the background instruction queue', () => {
    expect(parseOperatorTextCommand('Please reconcile the current checkout with the locked plan.').kind).toBe('error');
  });

  it('executes a current owner instruction as a live priority turn without creating a normal queued packet', async () => {
    const { root, repo } = rootWithRepo();
    markDialMissionBlocked({ root, reason: 'Owner direction required before continuing.' });
    const envelopeDir = path.join(root, 'execution/tasks/aef-task'); mkdirSync(envelopeDir, { recursive: true });
    writeFileSync(path.join(envelopeDir, 'envelope.json'), JSON.stringify({ task_id: 'aef-task', envelope_hash: 'env-hash', state: 'RUNNING' }));
    const ownerProvenance = { authority: 'OWNER_EXPLICIT', instruction_sha256: 'a'.repeat(64), instruction_excerpt: 'Land the verified fix', request_id: 'wa-live-test-0001', channel: 'whatsapp', actor: 'self:test', transport: 'hermes_owner_self_chat' };
    const out = await executeOwnerLiveTurn({
      instruction: 'Land the verified fix and continue from the current repository truth.',
      mode: 'instruction', root, repoDir: repo, requestedBy: 'whatsapp:self:test', requestId: 'wa-live-test-0001', ownerProvenance,
      knowledgeResolver: () => null,
      executor: async ({ instruction }) => ({ event: 'HERMES_OPERATIONAL_TURN_COMPLETED', runtime: 'test-runtime', resolved_model: 'test-model', response: instruction.includes('ACTION turn') ? 'Applied owner direction.' : 'bad prompt' }),
    });
    expect(out).toMatchObject({ state: 'COMPLETED', response: 'Applied owner direction.', adaptive_execution_superseded_tasks: ['aef-task'] });
    const m = missionStatus(root);
    expect(m.packet_counts.queued).toBe(0);
    expect(m.state).toBe('BLOCKED_OWNER');
    expect(m.priority_directive).toBe('Land the verified fix and continue from the current repository truth.');
    expect(m.owner_authority_roots.at(-1)).toMatchObject({ authority: 'OWNER_EXPLICIT', request_id: 'wa-live-test-0001', channel: 'whatsapp' });
    expect(JSON.parse(readFileSync(path.join(envelopeDir, 'envelope.json'), 'utf8')).state).toBe('SUPERSEDED');
  });

  it('treats owner questions as live read turns and does not resume or rewrite the mission', async () => {
    const { root, repo } = rootWithRepo();
    markDialMissionBlocked({ root, reason: 'Need an owner decision.' });
    expect(classifyOwnerLiveMode('What is the current owner blockage?')).toBe('query');
    const out = await executeOwnerLiveTurn({
      instruction: 'What is the current owner blockage?', root, repoDir: repo, requestedBy: 'whatsapp:self:test', requestId: 'wa-live-test-0002',
      executor: async ({ instruction }) => ({ event: 'HERMES_OPERATIONAL_TURN_COMPLETED', runtime: 'test-runtime', resolved_model: 'test-model', response: instruction.includes('QUESTION/READ turn') ? 'Need an owner decision.' : 'bad prompt' }),
    });
    expect(out.response).toBe('Need an owner decision.');
    expect(missionStatus(root).state).toBe('BLOCKED_OWNER');
    expect(missionStatus(root).packet_counts.queued).toBe(0);
  });


  it('registers normal owner direction in the hybrid steering lane instead of the autonomous queue', () => {
    const { root } = rootWithRepo();
    const steer = submitOwnerSteer({ instruction: 'Reconcile the POS checkout against the locked benchmark.', requestedBy: 'whatsapp:self:test', requestId: 'wa-steer-test-0001', root });
    expect(steer.state).toBe('PENDING');
    expect(steer.reply).toContain('next for execution before autonomous development continues');
    expect(steer.public_advisory_metadata.steer_scope_tags).toContain('POS');
    expect(JSON.stringify(steer.public_advisory_metadata)).not.toContain('Reconcile the POS checkout');
    expect(ownerSteeringBlocksAutonomous(root)).toBe(true);
    expect(ownerSteeringStatus(root).pending_count).toBe(1);
    expect(missionStatus(root).packet_counts.queued).toBe(0);
  });


  it('treats a trusted typed owner action as explicit owner authority even when prose lacks a write-intent keyword', async () => {
    const { root } = rootWithRepo();
    const steer = await callChatControlTool('dial_owner_steer', { instruction: 'Make the checkout blue.', request_id: 'wa-steer-test-plain-action' }, root, { channel: 'whatsapp', actor: 'self:test', transport: 'hermes_owner_self_chat' });
    expect(steer.owner_instruction_provenance).toMatchObject({ authority: 'OWNER_EXPLICIT', channel: 'whatsapp', request_id: 'wa-steer-test-plain-action' });
  });

  it('redirects explicit action-mode live turns into the safe-boundary steering broker', async () => {
    const { root } = rootWithRepo();
    const result = await callChatControlTool('dial_owner_live_turn', { instruction: 'Make the checkout blue.', mode: 'instruction', request_id: 'wa-live-action-redirect' }, root, { channel: 'whatsapp', actor: 'self:test', transport: 'hermes_owner_self_chat' });
    expect(result.state).toBe('PENDING');
    expect(result.owner_instruction_provenance.authority).toBe('OWNER_EXPLICIT');
    expect(ownerSteeringStatus(root).pending_count).toBe(1);
    expect(missionStatus(root).packet_counts.queued).toBe(0);
  });

  it('does not grant owner-write authority to untrusted local_cli steering calls', async () => {
    const { root } = rootWithRepo();
    await expect(callChatControlTool('dial_owner_steer', { instruction: 'Make the checkout blue.', request_id: 'local-steer-denied-0001' }, root, { channel: 'local_cli', actor: 'owner', transport: 'cli' })).rejects.toThrow(/authenticated Claude, Codex or WhatsApp owner channel/);
  });

  it('lets an active writer reach a safe boundary, then executes the owner steer before autonomous work', async () => {
    const { root, repo } = rootWithRepo();
    const processing = path.join(root, 'work-queue/processing'); mkdirSync(processing, { recursive: true });
    writeFileSync(path.join(processing, 'active.json'), JSON.stringify({ job_id: 'active-packet', state: 'PROCESSING', instruction: 'Continue checkout implementation.' }));
    const steer = submitOwnerSteer({ instruction: 'Change the POS layout after the current safe packet.', requestedBy: 'whatsapp:self:test', requestId: 'wa-steer-test-0002', root });
    expect(steer.active_writer_count).toBe(1);
    expect((await processOwnerSteeringTick({ root, repoDir: repo, advisoryWaitMs: 0, liveTurn: async () => ({ state: 'COMPLETED' }) })).action).toBe('WAITING_SAFE_BOUNDARY');
    expect(ownerSteeringBlocksAutonomous(root)).toBe(true);
    execFileSync('rm', ['-f', path.join(processing, 'active.json')]);
    const completed = await processOwnerSteeringTick({ root, repoDir: repo, advisoryWaitMs: 0, liveTurn: async ({ instruction }) => ({ state: 'COMPLETED', runtime: 'test-runtime', resolved_model: 'test-model', response: `Applied: ${instruction}` }) });
    expect(completed.action).toBe('COMPLETED');
    expect(completed.steer.response).toContain('Change the POS layout');
    expect(ownerSteeringStatus(root).blocking_autonomous).toBe(false);
  });

  it('prevents the autonomous orchestrator from claiming a new packet while an owner-live turn is executing', async () => {
    const { root, repo } = rootWithRepo();
    let releaseLive;
    const hold = new Promise((resolve) => { releaseLive = resolve; });
    let liveStarted;
    const started = new Promise((resolve) => { liveStarted = resolve; });
    const livePromise = executeOwnerLiveTurn({
      instruction: 'Apply the owner change now.', mode: 'instruction', root, repoDir: repo, requestedBy: 'whatsapp:self:test', requestId: 'wa-live-test-0003',
      knowledgeResolver: () => null,
      executor: async () => { liveStarted(); await hold; return { event: 'HERMES_OPERATIONAL_TURN_COMPLETED', runtime: 'test-runtime', resolved_model: 'test-model', response: 'done' }; },
    });
    await started;
    submitExternalWork({ instruction: 'Background work', requestedBy: 'test', metadata: {}, root, repoDir: repo, engineeringKnowledgeResolver: () => null });
    expect(await processNextExternalWork({ root, repoDir: repo, executor: async () => ({ event: 'HERMES_OPERATIONAL_TURN_COMPLETED' }), developmentGate: () => ({ unblocked: true }) })).toBeNull();
    expect(missionStatus(root).packet_counts.queued).toBe(0);
    releaseLive();
    await livePromise;
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

  it('pushes owner-steer lifecycle notifications without replaying old steering history', () => {
    const root = temp('dial-whatsapp-steer-notify-root');
    const eventsDir = path.join(root, 'events'); mkdirSync(eventsDir, { recursive: true });
    const eventFile = path.join(eventsDir, 'owner-steering.jsonl');
    writeFileSync(eventFile, `${JSON.stringify({ event: 'OWNER_STEER_EXECUTION_STARTED', sequence: 1, at: '2026-09-09T00:00:00Z' })}\n`);
    const state = {};
    expect(collectOwnerSteeringNotifications(state, { root })).toEqual([]);
    writeFileSync(eventFile, `${JSON.stringify({ event: 'OWNER_STEER_COMPLETED', sequence: 2, resolved_model: 'gpt-5.6-sol', response_preview: 'Applied owner direction.', at: '2026-09-09T00:01:00Z' })}\n`, { flag: 'a' });
    expect(collectOwnerSteeringNotifications(state, { root })).toEqual(['Owner steer 2 completed via gpt-5.6-sol.\nApplied owner direction.']);
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

  it('deduplicates WhatsApp owner-steer delivery while allowing reply recovery', async () => {
    const { root } = rootWithRepo(); const sent = [];
    const fetchImpl = async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => '' }; };
    const msg = { id: 'wamid.GOOD-001', sender: '263771234567', type: 'text', text: 'instruction Implement the next safe contract.' };
    await processWhatsAppMessage(msg, { root, config, fetchImpl });
    await processWhatsAppMessage(msg, { root, config, fetchImpl });
    expect(missionStatus(root).packet_counts.queued).toBe(0);
    expect(ownerSteeringStatus(root).pending_count).toBe(1);
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

  it('installs the hybrid broker with repository-write access while keeping query-facing services repository-read-only', () => {
    const installer = readFileSync('deploy/oracle/hermes-codex/install-operator-gateway.sh', 'utf8');
    const chatInstaller = readFileSync('deploy/oracle/hermes-codex/install-chat-control-bridge.sh', 'utf8');
    expect(installer).toContain('dial-owner-steering.service');
    expect(installer).toContain('ReadWritePaths=${CONTROL_HOME} ${REPO_DIR} ${HERMES_HOME} ${CODEX_HOME}');
    expect(installer).toContain('ReadOnlyPaths=${REPO_DIR} ${HERMES_DIR}');
    expect(installer).toContain('UnsetEnvironment=OPENAI_API_KEY CODEX_API_KEY ANTHROPIC_API_KEY');
    expect(chatInstaller).toContain('ReadOnlyPaths=${REPO_DIR}');
    expect(chatInstaller).toContain('ReadWritePaths=${CONTROL_HOME} ${HERMES_HOME} ${CODEX_HOME}');
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
    expect(names).toContain('dial_owner_steer');
    expect(names).toContain('dial_owner_live_turn');
    expect(names).toContain('dial_operator_channels');
    expect(names.some((name) => /shell|exec|filesystem/i.test(name))).toBe(false);
  });
});
