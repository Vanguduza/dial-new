#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  claimReviewJob,
  listReviewJobs,
  loadReviewCheckpoint,
  releaseReviewJob,
  submitReviewReceipt,
} from './review-fabric.mjs';
import { readJson } from './state-store.mjs';
import { runReadOnlyCheckpointReview } from './read-only-review-runner.mjs';
import { commanderProcessPid, withCommanderAutomation } from './commander-automation-client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const REVIEW_BEGIN = 'SPMRF_REVIEW_RESULT_BEGIN';
const REVIEW_END = 'SPMRF_REVIEW_RESULT_END';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function originUrl(repoDir) {
  let value = '';
  try {
    value = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: repoDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {}
  if (/^git@github\.com:/.test(value)) value = `https://github.com/${value.slice('git@github.com:'.length)}`;
  if (value.endsWith('.git')) return value;
  if (/^https:\/\/github\.com\//.test(value)) return `${value}.git`;
  return value || null;
}
function loadOptional(rel, root) { return rel ? readJson(rel, null, root) : null; }
function buildPacket({ checkpoint, root, repoDir }) {
  const understanding = loadOptional(checkpoint.understanding_rel, root);
  const delta = loadOptional(checkpoint.delta_rel, root);
  return {
    schema_version: 1,
    checkpoint_id: checkpoint.checkpoint_id,
    project: checkpoint.project,
    feature_id: checkpoint.feature_id,
    repository_url: originUrl(repoDir),
    repository_sha: checkpoint.repository_sha,
    base_sha: checkpoint.base_sha,
    author_harness: checkpoint.author_harness,
    summary: checkpoint.summary,
    claims: checkpoint.claims,
    tests: checkpoint.tests,
    domains: checkpoint.domains,
    evidence_refs: checkpoint.evidence_refs,
    understanding: understanding ? {
      understanding_hash: understanding.understanding_hash,
      project_truth_hash: understanding.project_truth_hash,
      registry_fingerprint: understanding.registry_fingerprint,
      graph_revision_hash: understanding.graph_revision_hash,
      structural_snapshot_hash: understanding.structural_snapshot_hash,
    } : null,
    delta_context: delta ? JSON.stringify({
      mode: delta.mode,
      delta_hash: delta.delta_hash,
      changed_files: delta.changed_files,
      file_stats: delta.file_stats,
      changed_symbols: delta.changed_symbols,
      impacted_paths: delta.impact?.impacted_paths || [],
      validity: delta.validity,
    }, null, 2) : null,
  };
}
function parseMarkedReview(text) {
  const source = String(text || '');
  const start = source.lastIndexOf(REVIEW_BEGIN);
  const end = source.lastIndexOf(REVIEW_END);
  if (start < 0 || end < start) return null;
  const encoded = source.slice(start + REVIEW_BEGIN.length, end).trim();
  try { return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')); }
  catch { return null; }
}
function processStillRunning(text) {
  return /still running|running with pid|process started with pid/i.test(String(text || ''))
    && !/process completed|completed successfully|exit code/i.test(String(text || ''));
}

async function runTradingChatGptReview({ packet, repoDir }) {
  const wrapper = process.env.DIAL_TRADING_COMMANDER_WRAPPER;
  if (!wrapper) throw Object.assign(new Error('DIAL_TRADING_COMMANDER_WRAPPER is not configured'), { retryable: true });
  const encodedPacket = Buffer.from(JSON.stringify(packet), 'utf8').toString('base64');
  const remoteWorker = process.env.DIAL_TRADING_REVIEW_WORKER || '/home/ubuntu/.local/bin/van-spmrf-review-worker';
  const command = [
    'set -euo pipefail',
    'p="$(mktemp /tmp/van-spmrf-review.XXXXXX.json)"',
    `printf '%s' '${encodedPacket}' | base64 -d > "$p"`,
    `${remoteWorker} "$p"`,
    'rc=$?',
    'rm -f "$p"',
    'exit "$rc"',
  ].join('; ');

  return withCommanderAutomation({
    commanderId: 'van_trading_local_commander',
    wrapper,
    repoDir,
    automationId: 'CROSS_HARNESS_REVIEW',
    timeoutMs: 25 * 60 * 1000,
    run: async ({ callTool }) => {
      const started = await callTool('start_process', { command, timeout_ms: 30000, shell: '/bin/bash' });
      let output = started.text || '';
      let parsed = parseMarkedReview(output);
      if (parsed) return parsed;
      const pid = commanderProcessPid(output);
      if (!pid) throw new Error(`Trading review worker returned no result or PID: ${output.slice(-2000)}`);

      const deadline = Date.now() + 22 * 60 * 1000;
      let offset = 0;
      while (Date.now() < deadline) {
        await sleep(4000);
        const read = await callTool('read_process_output', {
          pid,
          timeout_ms: 5000,
          offset,
          length: 2000,
        });
        if (read.text) {
          output += `\n${read.text}`;
          offset = 0;
        }
        parsed = parseMarkedReview(output);
        if (parsed) return parsed;
        if (!processStillRunning(read.text) && /completed|exit code|terminated/i.test(read.text || '')) break;
      }
      throw new Error(`Trading review worker did not produce a structured result: ${output.slice(-3000)}`);
    },
  });
}

async function processOne(job, { repoDir, root }) {
  const claimed = claimReviewJob({
    reviewJobId: job.review_job_id,
    reviewerHarness: job.reviewer_harness,
  }, root);
  const checkpoint = loadReviewCheckpoint(claimed, root);
  const packet = buildPacket({ checkpoint, root, repoDir });
  try {
    let review;
    if (claimed.reviewer_harness === 'chatgpt-hermes' || claimed.reviewer_harness === 'claude-hermes') {
      review = await runReadOnlyCheckpointReview({
        harnessId: claimed.reviewer_harness,
        repoDir,
        packet,
      });
    } else if (claimed.reviewer_harness === 'chatgpt-trading') {
      review = await runTradingChatGptReview({ packet, repoDir });
    } else {
      throw Object.assign(new Error(`No automatic review runner for ${claimed.reviewer_harness}`), { retryable: false });
    }

    return submitReviewReceipt({
      reviewJobId: claimed.review_job_id,
      reviewerHarness: claimed.reviewer_harness,
      verdict: review.verdict,
      findings: review.findings || [],
      summary: review.summary || null,
      reviewedRepositorySha: checkpoint.repository_sha,
      modelProvenance: review.model_provenance || null,
      evidenceRefs: review.evidence_refs || [],
    }, root);
  } catch (error) {
    releaseReviewJob({
      reviewJobId: claimed.review_job_id,
      reviewerHarness: claimed.reviewer_harness,
      error: error?.stack || error,
      retryable: error?.retryable !== false,
      retryAfterSeconds: /rate|limit|quota|capacity/i.test(String(error?.message || error)) ? 900 : 180,
    }, root);
    throw error;
  }
}

export async function runReviewCoordinatorCycle({
  repoDir = DEFAULT_REPO,
  root = process.env.DIAL_CONTROL_HOME,
  maxJobs = 3,
} = {}) {
  const jobs = listReviewJobs({ state: 'inbox' }, root).slice(0, Math.max(1, Number(maxJobs) || 3));
  const results = [];
  for (const job of jobs) {
    try {
      const receipt = await processOne(job, { repoDir, root });
      results.push({ review_job_id: job.review_job_id, reviewer_harness: job.reviewer_harness, state: 'COMPLETED', receipt_hash: receipt.receipt.review_receipt_hash });
    } catch (error) {
      results.push({ review_job_id: job.review_job_id, reviewer_harness: job.reviewer_harness, state: 'REQUEUED_OR_FAILED', error: String(error?.message || error).slice(0, 1000) });
    }
  }
  return { processed: results.length, results };
}

async function main() {
  const daemon = process.argv.includes('--daemon');
  const repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO;
  const root = process.env.DIAL_CONTROL_HOME;
  if (!daemon) {
    const result = await runReviewCoordinatorCycle({ repoDir, root });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const intervalMs = Math.max(5000, Number(process.env.DIAL_REVIEW_COORDINATOR_INTERVAL_MS || 15000));
  for (;;) {
    try { await runReviewCoordinatorCycle({ repoDir, root }); }
    catch (error) { console.error(`review coordinator cycle failed: ${error?.stack || error}`); }
    await sleep(intervalMs);
  }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
