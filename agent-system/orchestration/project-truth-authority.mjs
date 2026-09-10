#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, resolveControlPath } from './state-store.mjs';

export const PROJECT_TRUTH_AUTHORITY_CLASSES = Object.freeze([
  'OWNER_EXPLICIT', 'OWNER_DERIVED', 'OWNER_DELEGATED_AUTONOMY', 'NO_AUTHORITY',
]);
const OWNER_CHANNELS = new Set(['claude', 'codex', 'whatsapp']);
const WRITE_INTENT = /\b(implement|integrate|add|remove|change|update|create|delete|replace|migrate|configure|build|fix|repair|resolve|close|resume|continue|complete|finish|enforce|apply|reconcile|merge|deploy|set\s*up)\b/i;
const DELEGATED = /(?:\b(autonomous(?:ly)?|until\s+(?:project\s+)?green|do\s+not\s+stop|continue\s+until|resume\s+until|work\s+until|complete\s+the\s+(?:remaining|whole)|finish\s+all\s+(?:remaining|open))\b|^(?:resume|continue)(?:\s+(?:development|work|implementation))?[.!\s]*$)/i;
const BLOCKER = /\b(blocker|blockers|gap|gaps|failure|failures|issue|issues|remaining\s+work|remaining\s+gaps)\b/i;
const RECOMMENDED = /\b(recommended|recommendation|best\s+(?:solution|approach|option|way)|appropriate\s+solution|workaround|as\s+you\s+recommend)\b/i;

function now() { return new Date().toISOString(); }
function sha(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function clean(value, max = 12000) { return String(value ?? '').trim().slice(0, max); }

export function classifyOwnerInstruction(value) {
  const text = clean(value, 30000);
  if (!text || !WRITE_INTENT.test(text)) return 'NO_AUTHORITY';
  if (DELEGATED.test(text)) return 'OWNER_DELEGATED_AUTONOMY';
  if (BLOCKER.test(text) && RECOMMENDED.test(text)) return 'OWNER_DERIVED';
  return 'OWNER_EXPLICIT';
}

export function ownerInstructionProvenance({ instruction, requestId, channel, actor = 'owner', transport = 'direct' } = {}) {
  const authority = classifyOwnerInstruction(instruction);
  return {
    schema_version: 1,
    authority,
    instruction_sha256: sha(instruction),
    instruction_excerpt: clean(instruction, 240),
    request_id: clean(requestId, 128) || null,
    channel: clean(channel, 40).toLowerCase(),
    actor: clean(actor, 120) || 'owner',
    transport: clean(transport, 80) || 'direct',
    observed_at: now(),
  };
}

function ownerSourceFromJob(job) {
  const direct = String(job?.requested_by || '').match(/^(claude|codex|whatsapp):(.+)$/i);
  if (direct) {
    const channel = direct[1].toLowerCase();
    if (!OWNER_CHANNELS.has(channel)) throw new Error('job source is not an authenticated owner channel');
    const p = job?.metadata?.owner_instruction_provenance || ownerInstructionProvenance({
      instruction: job?.instruction, requestId: job?.metadata?.request_id,
      channel, actor: direct[2], transport: job?.metadata?.operator_transport || 'oracle_control',
    });
    return { ...p, channel, job_id: job.job_id, source_job_requested_by: job.requested_by };
  }
  if (job?.requested_by === 'mission_controller' && job?.metadata?.owner_authority_root) {
    const root = job.metadata.owner_authority_root;
    if (!PROJECT_TRUTH_AUTHORITY_CLASSES.includes(root.authority) || root.authority === 'NO_AUTHORITY') {
      throw new Error('mission-controller packet has no valid owner authority root');
    }
    return { ...root, job_id: job.job_id, inherited_by: 'mission_controller' };
  }
  throw new Error('project-truth authorization requires an owner-originated instruction or inherited owner authority root');
}

export function authorizationFromOwnerJob(job, {
  baseSha, branchScope, authorizedPaths, changeClasses = ['technical_implementation'], reusable,
} = {}) {
  const source = ownerSourceFromJob(job);
  if (source.authority === 'NO_AUTHORITY') throw new Error('read-only owner instruction grants no Project Truth write authority');
  const paths = [...new Set((authorizedPaths || []).map((v) => clean(v, 500)).filter(Boolean))].sort();
  if (!paths.length) throw new Error('authorizedPaths must be explicit and non-empty');
  const classes = [...new Set((changeClasses || []).map((v) => clean(v, 120)).filter(Boolean))].sort();
  if (!classes.length) throw new Error('changeClasses must be explicit and non-empty');
  if (!/^[0-9a-f]{40}$/i.test(String(baseSha || ''))) throw new Error('baseSha must be an exact commit SHA');
  if (!clean(branchScope, 200)) throw new Error('branchScope is required');
  const authorizationId = `auth-${sha(JSON.stringify({ job: source.job_id, baseSha, branchScope, paths, classes, authority: source.authority })).slice(0, 24)}`;
  return {
    schema_version: 1,
    authorization_id: authorizationId,
    project: 'dial',
    authority: source.authority,
    owner_instruction_sha256: source.instruction_sha256,
    owner_instruction_excerpt: source.instruction_excerpt || null,
    source: {
      kind: 'oracle_owner_instruction', channel: source.channel, actor: source.actor || 'owner',
      request_id: source.request_id || null, job_id: source.job_id, inherited_by: source.inherited_by || null,
      transport: source.transport || 'oracle_control',
    },
    issued_at_utc: now(), base_sha: baseSha, branch_scope: branchScope,
    authorized_paths: paths, change_classes: classes,
    material_scope_expansion: false, feature_removal: false, business_model_change: false,
    security_authority_change: false, owner_control_boundary_change: false,
    legal_position_change: false, money_or_custody_model_change: false, locked_provider_change: false,
    reusable: reusable ?? source.authority === 'OWNER_DELEGATED_AUTONOMY', revoked: false,
  };
}

function findQueuedJob(jobId, root) {
  for (const state of ['inbox', 'processing', 'completed', 'failed']) {
    const job = readJson(`work-queue/${state}/${jobId}.json`, null, root);
    if (job) return job;
  }
  return null;
}

export function issueAuthorizationFromJob({ root, repoDir, jobId, baseSha, branchScope, authorizedPaths, changeClasses, reusable } = {}) {
  const job = findQueuedJob(jobId, root);
  if (!job) throw new Error(`owner instruction job not found: ${jobId}`);
  const record = authorizationFromOwnerJob(job, { baseSha, branchScope, authorizedPaths, changeClasses, reusable });
  const dir = path.join(path.resolve(repoDir || process.env.DIAL_REPO_DIR || '.'), 'docs/project-state/authorizations');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${record.authorization_id}.json`);
  if (fs.existsSync(target)) {
    const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (sha(JSON.stringify(existing)) !== sha(JSON.stringify(record))) throw new Error('authorization id collision with different content');
    return { target, record: existing, created: false };
  }
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return { target, record, created: true };
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const cmd = process.argv[2] || 'help';
  if (cmd === 'classify') return console.log(JSON.stringify({ authority: classifyOwnerInstruction(process.argv.slice(3).join(' ')) }, null, 2));
  if (cmd === 'issue') {
    const paths = JSON.parse(arg('--paths-json', '[]'));
    const classes = JSON.parse(arg('--classes-json', '["technical_implementation"]'));
    const result = issueAuthorizationFromJob({
      jobId: arg('--job-id'), repoDir: arg('--repo-dir', process.env.DIAL_REPO_DIR),
      baseSha: arg('--base-sha'), branchScope: arg('--branch'), authorizedPaths: paths, changeClasses: classes,
    });
    return console.log(JSON.stringify({ created: result.created, target: result.target, authorization: result.record }, null, 2));
  }
  console.error('usage: project-truth-authority.mjs classify <owner instruction> | issue --job-id ID --base-sha SHA --branch BRANCH --paths-json JSON [--classes-json JSON]');
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
