#!/usr/bin/env node
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSharedProjectContext } from './shared-context-resolver.mjs';
import { searchSharedMemory, writeMemoryCandidate, sharedMemoryCursor } from './shared-project-memory.mjs';
import {
  publishReviewCheckpoint,
  listReviewJobs,
  claimReviewJob,
  submitReviewReceipt,
  reviewCheckpointStatus,
} from './review-fabric.mjs';
import { handoff } from './supervisor.mjs';
import { readJson } from './state-store.mjs';
import { resolveProjectRepository } from './project-repository-resolver.mjs';
import {
  openVikingHealth,
  openVikingProjectionStatus,
  searchOpenVikingProjectContext,
} from './openviking-shared-context.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
const root = process.env.DIAL_CONTROL_HOME;
const defaultProject = process.env.DIAL_PROJECT_ID || 'dial';
const defaultHarness = process.env.DIAL_HARNESS_ID || 'unknown';

const TOOLS = [
  {
    name: 'project_memory_resolve',
    description: 'Resolve one cached model-neutral project context capsule, using snapshot-plus-delta handover when possible.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        harness_id: { type: 'string' },
        message: { type: 'string' },
        feature_id: { type: 'string' },
        context_profile: { type: 'string', enum: ['REVIEW', 'IMPLEMENTATION', 'ARCHITECTURE', 'DEEP_AUDIT'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'project_memory_search',
    description: 'Search admitted shared project memory. Results are continuity context and never override Project Truth or repository evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        query: { type: 'string' },
        feature_id: { type: 'string' },
        tiers: { type: 'array', items: { type: 'string', enum: ['HOT', 'WARM', 'COLD'] } },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'project_memory_semantic_search',
    description: 'Search the OpenViking semantic projection of already-admitted SPMRF memory for one project. This is a subordinate retrieval view only and never project authority.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        query: { type: 'string' },
        max_tokens: { type: 'integer', minimum: 256, maximum: 6000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'project_memory_semantic_status',
    description: 'Read OpenViking health plus the local projection cursor. No secret values are returned.',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'project_memory_cursor',
    description: 'Read the monotonic hash-chained shared-memory cursor for a project.',
    inputSchema: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'project_memory_write_candidate',
    description: 'Write a non-authoritative shared-memory candidate. Candidate admission remains a separate Hermes/system step.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        feature_id: { type: 'string' },
        tier: { type: 'string', enum: ['HOT', 'WARM', 'COLD'] },
        type: { type: 'string' },
        text: { type: 'string' },
        refs: { type: 'array', items: { type: 'string' } },
        source_harness: { type: 'string' },
        session_ref: { type: 'string' },
        repository_sha: { type: 'string' },
        checkpoint_id: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'project_handoff',
    description: 'Create/update the canonical Hermes continuity handoff capsule for the current project work.',
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'string' },
        active_unit: { type: 'string' },
        next_action: { type: 'string' },
        completed: { type: 'array', items: { type: 'string' } },
        remaining: { type: 'array', items: { type: 'string' } },
        important_decisions: { type: 'array', items: { type: 'string' } },
        known_risks: { type: 'array', items: { type: 'string' } },
        failures: { type: 'array', items: { type: 'string' } },
        evidence_refs: { type: 'array', items: { type: 'string' } },
        session_refs: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'review_publish_checkpoint',
    description: 'Publish the current clean immutable Git checkpoint to the cross-harness review queue.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string' },
        author_harness: { type: 'string' },
        feature_id: { type: 'string' },
        summary: { type: 'string' },
        claims: { type: 'array', items: { type: 'string' } },
        tests: { type: 'array', items: { type: 'string' } },
        domains: { type: 'array', items: { type: 'string' } },
        evidence_refs: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'review_list_jobs',
    description: 'List review jobs for a reviewer harness.',
    inputSchema: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['inbox', 'processing', 'completed', 'failed'] },
        reviewer_harness: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'review_claim',
    description: 'Atomically claim one review job for its assigned harness.',
    inputSchema: {
      type: 'object',
      properties: {
        review_job_id: { type: 'string' },
        reviewer_harness: { type: 'string' },
      },
      required: ['review_job_id', 'reviewer_harness'],
      additionalProperties: false,
    },
  },
  {
    name: 'review_submit',
    description: 'Submit a structured review receipt bound to the exact immutable repository SHA.',
    inputSchema: {
      type: 'object',
      properties: {
        review_job_id: { type: 'string' },
        reviewer_harness: { type: 'string' },
        verdict: { type: 'string' },
        findings: { type: 'array', items: { type: 'object' } },
        summary: { type: 'string' },
        reviewed_repository_sha: { type: 'string' },
        model_provenance: { type: 'object' },
        evidence_refs: { type: 'array', items: { type: 'string' } },
      },
      required: ['review_job_id', 'reviewer_harness', 'verdict', 'reviewed_repository_sha'],
      additionalProperties: false,
    },
  },
  {
    name: 'review_status',
    description: 'Read review quorum, provider diversity and blocking-findings state for a checkpoint.',
    inputSchema: {
      type: 'object',
      properties: { checkpoint_id: { type: 'string' } },
      required: ['checkpoint_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'review_open_findings',
    description: 'Read structured open HIGH/CRITICAL findings for the active review checkpoint.',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string' } },
      additionalProperties: false,
    },
  },
];

function send(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }
function result(id, value) { return { jsonrpc: '2.0', id, result: value }; }
function clean(value, max = 4000) { return String(value ?? '').trim().slice(0, max); }

function repoFor(project) {
  return resolveProjectRepository({ project: project || defaultProject, root, defaultRepoDir: repoDir }).repo_dir;
}

async function invoke(name, args = {}) {
  if (name === 'project_memory_resolve') {
    return resolveSharedProjectContext({
      project: args.project || defaultProject,
      repoDir: repoFor(args.project || defaultProject),
      root,
      harnessId: args.harness_id || defaultHarness,
      userMessage: args.message || '',
      featureId: args.feature_id || null,
      contextProfile: args.context_profile || 'IMPLEMENTATION',
    });
  }
  if (name === 'project_memory_search') {
    return searchSharedMemory({
      project: args.project || defaultProject,
      query: args.query || '',
      featureId: args.feature_id || null,
      tiers: args.tiers || ['HOT', 'WARM', 'COLD'],
      admittedOnly: true,
      limit: args.limit || 20,
    }, root);
  }
  if (name === 'project_memory_semantic_search') {
    return searchOpenVikingProjectContext({
      project: args.project || defaultProject,
      query: args.query || '',
      maxTokens: args.max_tokens || 2400,
      root,
      sessionId: `${defaultHarness}:${args.project || defaultProject}`,
    });
  }
  if (name === 'project_memory_semantic_status') {
    const project = args.project || defaultProject;
    return {
      project,
      health: await openVikingHealth({ root }),
      projection: openVikingProjectionStatus(project, root),
      authority: 'NON_AUTHORITATIVE_SEMANTIC_PROJECTION',
    };
  }
  if (name === 'project_memory_cursor') return sharedMemoryCursor(args.project || defaultProject, root);
  if (name === 'project_memory_write_candidate') {
    return writeMemoryCandidate({
      project: args.project || defaultProject,
      featureId: args.feature_id || null,
      tier: args.tier || 'WARM',
      type: args.type || 'IMPLEMENTATION_NOTE',
      text: args.text,
      refs: args.refs || [],
      sourceHarness: args.source_harness || defaultHarness,
      sessionRef: args.session_ref || null,
      repositorySha: args.repository_sha || null,
      checkpointId: args.checkpoint_id || null,
    }, root);
  }
  if (name === 'project_handoff') return handoff({ repoDir: repoFor(args.project || defaultProject), root, input: { ...args, project: args.project || defaultProject } });
  if (name === 'review_publish_checkpoint') {
    return publishReviewCheckpoint({
      project: args.project || defaultProject,
      repoDir,
      root,
      authorHarness: args.author_harness || defaultHarness,
      featureId: args.feature_id || null,
      summary: args.summary || null,
      claims: args.claims || [],
      tests: args.tests || [],
      domains: args.domains || [],
      evidenceRefs: args.evidence_refs || [],
    });
  }
  if (name === 'review_list_jobs') {
    return listReviewJobs({
      state: args.state || 'inbox',
      reviewerHarness: args.reviewer_harness || defaultHarness,
    }, root);
  }
  if (name === 'review_claim') {
    return claimReviewJob({
      reviewJobId: args.review_job_id,
      reviewerHarness: args.reviewer_harness,
    }, root);
  }
  if (name === 'review_submit') {
    return submitReviewReceipt({
      reviewJobId: args.review_job_id,
      reviewerHarness: args.reviewer_harness,
      verdict: args.verdict,
      findings: args.findings || [],
      summary: args.summary || null,
      reviewedRepositorySha: args.reviewed_repository_sha,
      modelProvenance: args.model_provenance || null,
      evidenceRefs: args.evidence_refs || [],
    }, root);
  }
  if (name === 'review_status') return reviewCheckpointStatus(args.checkpoint_id, root);
  if (name === 'review_open_findings') {
    const project = args.project || defaultProject;
    const cursor = readJson(`review/cursor-${String(project).toLowerCase()}.json`, null, root);
    if (!cursor?.checkpoint_id) return { project, checkpoint_id: null, findings: [] };
    const status = reviewCheckpointStatus(cursor.checkpoint_id, root);
    return {
      project,
      checkpoint_id: status.checkpoint_id,
      repository_sha: status.repository_sha,
      state: status.state,
      findings: status.receipts.flatMap((receipt) =>
        (receipt.findings || [])
          .filter((finding) => ['CRITICAL', 'HIGH'].includes(finding.severity))
          .map((finding) => ({ reviewer_harness: receipt.reviewer_harness, ...finding })),
      ),
    };
  }
  throw new Error(`unknown shared memory tool: ${name}`);
}

async function handle(message) {
  const id = message?.id;
  if (message?.method === 'initialize') {
    return result(id, {
      protocolVersion: message?.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'dial-shared-project-memory', version: '1.0.0' },
      instructions: 'Model-neutral DIAL shared project memory and checkpoint-review surface. Memory is continuity context only; Project Truth, Git, registries and evidence remain authoritative. Native model/account memories never override this plane.',
    });
  }
  if (message?.method === 'notifications/initialized') return null;
  if (message?.method === 'ping') return result(id, {});
  if (message?.method === 'tools/list') return result(id, { tools: TOOLS });
  if (message?.method === 'tools/call') {
    try {
      const value = await invoke(message.params?.name, message.params?.arguments || {});
      return result(id, {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
        isError: false,
      });
    } catch (error) {
      return result(id, { content: [{ type: 'text', text: clean(error?.message || error) }], isError: true });
    }
  }
  return { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: `method not found: ${message?.method}` } };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); }
  catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  try {
    const response = await handle(message);
    if (response) send(response);
  } catch (error) {
    send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32603, message: clean(error?.message || error) } });
  }
});
