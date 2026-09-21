import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  appendJsonl,
  DEFAULT_CONTROL_HOME,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';
import { captureGitState } from './checkpoint-store.mjs';
import { assertNoSecretMaterial } from './feature-memory.mjs';
import { hashObject, writeContentAddressedJson } from './knowledge-graph-core.mjs';
import {
  buildRepositoryUnderstandingDelta,
  buildRepositoryUnderstandingSnapshot,
  loadRepositoryUnderstandingSnapshot,
} from './repository-understanding-snapshot.mjs';
import { admitMemoryCandidate, writeMemoryCandidate } from './shared-project-memory.mjs';

function now() { return new Date().toISOString(); }
function projectSlug(project) {
  const value = String(project || 'dial').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(value)) throw new Error(`invalid project: ${project}`);
  return value;
}
function clean(value, max = 4000) {
  const text = String(value ?? '').replace(/\u0000/g, '').trim();
  if (!text) return null;
  assertNoSecretMaterial(text, 'review fabric');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
function cleanList(values, max = 40) {
  return Array.isArray(values) ? values.slice(0, max).map((x) => clean(x, 1000)).filter(Boolean) : [];
}
function loadFabricRegistry(repoDir) {
  const file = path.join(repoDir, 'agent-system/registries/SHARED_PROJECT_MEMORY_FABRIC.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function jobRel(state, jobId) { return `review/${state}/${jobId}.json`; }
function safeReviewId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,220}$/.test(id)) throw new Error(`invalid review id: ${value}`);
  return id;
}

export function eligibleReviewers({ repoDir, authorHarness, domains = [] } = {}) {
  const registry = loadFabricRegistry(repoDir);
  const enabled = (registry.harnesses || []).filter((h) => h.enabled === true && h.roles?.includes('REVIEWER'));
  const candidates = enabled.filter((h) => h.harness_id !== authorHarness);
  const critical = domains.some((d) => (registry.review_policy?.critical_domains || []).includes(String(d).toUpperCase()));
  return {
    reviewers: candidates.map((h) => h.harness_id),
    required: critical
      ? Number(registry.review_policy?.material_min_independent_reviews || 2)
      : Number(registry.review_policy?.routine_min_independent_reviews || 1),
    critical,
    provider_diversity_required: critical && registry.review_policy?.critical_requires_provider_diversity === true,
  };
}

export function publishReviewCheckpoint({
  project = 'dial',
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  authorHarness,
  featureId = null,
  summary = null,
  claims = [],
  tests = [],
  domains = [],
  baseSha = null,
  evidenceRefs = [],
  force = false,
} = {}) {
  if (!repoDir) throw new Error('repoDir is required');
  const git = captureGitState(repoDir);
  if (!git.commit) throw new Error('review checkpoint requires a Git commit');
  if (git.dirty && !force) {
    return { published: false, reason: 'DIRTY_REPOSITORY_NOT_IMMUTABLE', repository_sha: git.commit, dirty_paths: git.dirty_paths };
  }
  const harness = clean(authorHarness, 180);
  if (!harness) throw new Error('authorHarness is required');

  const previousUnderstanding = loadRepositoryUnderstandingSnapshot(project, root);
  const understanding = buildRepositoryUnderstandingSnapshot({ project, repoDir, root, featureId });
  let delta = null;
  if (previousUnderstanding && previousUnderstanding.repository_sha !== understanding.repository_sha) {
    delta = buildRepositoryUnderstandingDelta({
      project,
      repoDir,
      root,
      fromSnapshot: previousUnderstanding,
      toSnapshot: understanding,
    });
  }

  const previousCursor = readJson(`review/cursor-${projectSlug(project)}.json`, null, root);
  if (!force && previousCursor?.repository_sha === git.commit) {
    return { published: false, reason: 'CHECKPOINT_ALREADY_PUBLISHED', checkpoint_id: previousCursor.checkpoint_id, repository_sha: git.commit };
  }

  const reviewerPlan = eligibleReviewers({ repoDir, authorHarness: harness, domains });
  const immutable = {
    schema_version: 1,
    project: projectSlug(project),
    feature_id: featureId ?? null,
    author_harness: harness,
    repository_sha: git.commit,
    branch: git.branch,
    base_sha: baseSha ?? previousCursor?.repository_sha ?? null,
    understanding_hash: understanding.understanding_hash,
    understanding_rel: understanding.object_rel,
    delta_hash: delta?.delta_hash ?? null,
    delta_rel: delta?.object_rel ?? null,
    summary: clean(summary, 8000),
    claims: cleanList(claims),
    tests: cleanList(tests),
    domains: cleanList(domains, 20).map((x) => x.toUpperCase()),
    evidence_refs: cleanList(evidenceRefs),
    review_policy: {
      reviewers: reviewerPlan.reviewers,
      required_independent_reviews: reviewerPlan.required,
      critical: reviewerPlan.critical,
      provider_diversity_required: reviewerPlan.provider_diversity_required,
    },
  };
  assertNoSecretMaterial(immutable, 'review checkpoint');
  const checkpointHash = hashObject(immutable);
  const checkpointId = `CP-${checkpointHash.slice(0, 24)}`;
  const checkpoint = { ...immutable, checkpoint_id: checkpointId, checkpoint_hash: checkpointHash, created_at: now() };
  const stored = writeContentAddressedJson(`review/checkpoints/${projectSlug(project)}`, checkpoint, { root, prefix: 'review-checkpoint' });

  const jobs = [];
  for (const reviewer of reviewerPlan.reviewers) {
    const jobBody = {
      schema_version: 1,
      project: checkpoint.project,
      checkpoint_id: checkpointId,
      checkpoint_rel: stored.rel,
      checkpoint_hash: checkpointHash,
      repository_sha: git.commit,
      author_harness: harness,
      reviewer_harness: reviewer,
      state: 'QUEUED',
      attempt: 0,
      created_at: now(),
    };
    const jobId = `RJ-${hashObject(jobBody).slice(0, 24)}`;
    const job = { ...jobBody, review_job_id: jobId };
    writeJsonAtomic(jobRel('inbox', jobId), job, root);
    jobs.push(job);
  }

  writeJsonAtomic(`review/cursor-${projectSlug(project)}.json`, {
    schema_version: 1,
    project: checkpoint.project,
    checkpoint_id: checkpointId,
    checkpoint_hash: checkpointHash,
    repository_sha: git.commit,
    created_at: checkpoint.created_at,
  }, root);
  appendJsonl('events/review-fabric.jsonl', {
    event: 'REVIEW_CHECKPOINT_PUBLISHED',
    project: checkpoint.project,
    checkpoint_id: checkpointId,
    repository_sha: git.commit,
    author_harness: harness,
    reviewer_jobs: jobs.map((j) => j.review_job_id),
    at: checkpoint.created_at,
  }, root);

  return { published: true, checkpoint, checkpoint_rel: stored.rel, jobs };
}

export function listReviewJobs({ state = 'inbox', reviewerHarness = null } = {}, root = DEFAULT_CONTROL_HOME) {
  const dir = resolveControlPath(`review/${state}`, root);
  let files = [];
  try { files = fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort(); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const nowMs = Date.now();
  return files.map((file) => readJson(`review/${state}/${file}`, null, root))
    .filter(Boolean)
    .filter((job) => !reviewerHarness || job.reviewer_harness === reviewerHarness)
    .filter((job) => state !== 'inbox' || !job.not_before || Date.parse(job.not_before) <= nowMs);
}

export function claimReviewJob({ reviewJobId, reviewerHarness } = {}, root = DEFAULT_CONTROL_HOME) {
  const jobId = safeReviewId(reviewJobId);
  const source = resolveControlPath(jobRel('inbox', jobId), root);
  const target = resolveControlPath(jobRel('processing', jobId), root);
  const job = readJson(jobRel('inbox', jobId), null, root);
  if (!job) throw new Error(`review job not found: ${jobId}`);
  if (job.reviewer_harness !== reviewerHarness) throw new Error('review job reviewer mismatch');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  try { fs.renameSync(source, target); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`review job already claimed or missing: ${jobId}`);
    throw error;
  }
  const claimed = { ...job, state: 'PROCESSING', attempt: Number(job.attempt || 0) + 1, claimed_at: now() };
  writeJsonAtomic(jobRel('processing', jobId), claimed, root);
  appendJsonl('events/review-fabric.jsonl', {
    event: 'REVIEW_JOB_CLAIMED',
    review_job_id: jobId,
    checkpoint_id: job.checkpoint_id,
    reviewer_harness: reviewerHarness,
    at: claimed.claimed_at,
  }, root);
  return claimed;
}

export function loadReviewCheckpoint(job, root = DEFAULT_CONTROL_HOME) {
  const checkpoint = readJson(job?.checkpoint_rel, null, root);
  if (!checkpoint || checkpoint.checkpoint_hash !== job?.checkpoint_hash) throw new Error('review checkpoint missing or hash mismatch');
  return checkpoint;
}

export function releaseReviewJob({
  reviewJobId,
  reviewerHarness,
  error,
  retryable = true,
  retryAfterSeconds = 300,
  maxAttempts = 5,
} = {}, root = DEFAULT_CONTROL_HOME) {
  const jobId = safeReviewId(reviewJobId);
  const job = readJson(jobRel('processing', jobId), null, root);
  if (!job) throw new Error(`processing review job not found: ${jobId}`);
  if (job.reviewer_harness !== reviewerHarness) throw new Error('reviewer harness mismatch');
  const attempts = Number(job.attempt || 0);
  const canRetry = retryable && attempts < maxAttempts;
  const next = {
    ...job,
    state: canRetry ? 'QUEUED' : 'FAILED',
    last_error: clean(error, 3000),
    failed_at: now(),
    not_before: canRetry ? new Date(Date.now() + Math.max(30, retryAfterSeconds) * 1000).toISOString() : null,
  };
  const targetState = canRetry ? 'inbox' : 'failed';
  writeJsonAtomic(jobRel(targetState, jobId), next, root);
  try { fs.unlinkSync(resolveControlPath(jobRel('processing', jobId), root)); } catch {}
  appendJsonl('events/review-fabric.jsonl', {
    event: canRetry ? 'REVIEW_JOB_REQUEUED' : 'REVIEW_JOB_FAILED',
    review_job_id: jobId,
    checkpoint_id: job.checkpoint_id,
    reviewer_harness: reviewerHarness,
    attempt: attempts,
    error: next.last_error,
    not_before: next.not_before,
    at: next.failed_at,
  }, root);
  return next;
}

export function submitReviewReceipt({
  reviewJobId,
  reviewerHarness,
  verdict,
  findings = [],
  summary = null,
  reviewedRepositorySha,
  modelProvenance = null,
  evidenceRefs = [],
} = {}, root = DEFAULT_CONTROL_HOME) {
  const jobId = safeReviewId(reviewJobId);
  const job = readJson(jobRel('processing', jobId), null, root);
  if (!job) throw new Error(`processing review job not found: ${jobId}`);
  if (job.reviewer_harness !== reviewerHarness) throw new Error('reviewer harness mismatch');
  if (job.author_harness === reviewerHarness) throw new Error('authoring harness cannot satisfy independent review');
  if (reviewedRepositorySha !== job.repository_sha) throw new Error('review receipt SHA mismatch');
  assertNoSecretMaterial(modelProvenance, 'review model provenance');

  const normalizedFindings = (Array.isArray(findings) ? findings : []).slice(0, 100).map((finding) => ({
    severity: String(finding?.severity || 'INFO').toUpperCase(),
    category: clean(finding?.category || 'GENERAL', 120),
    file: clean(finding?.file, 500),
    line: Number.isFinite(Number(finding?.line)) ? Number(finding.line) : null,
    claim: clean(finding?.claim || finding?.message, 4000),
    evidence: clean(finding?.evidence, 4000),
  }));
  const body = {
    schema_version: 1,
    project: job.project,
    review_job_id: jobId,
    checkpoint_id: job.checkpoint_id,
    reviewed_repository_sha: reviewedRepositorySha,
    author_harness: job.author_harness,
    reviewer_harness: reviewerHarness,
    verdict: String(verdict || 'COMMENT').toUpperCase(),
    summary: clean(summary, 8000),
    findings: normalizedFindings,
    model_provenance: modelProvenance,
    evidence_refs: cleanList(evidenceRefs),
    completed_at: now(),
  };
  const receiptHash = hashObject(body);
  const receipt = { ...body, review_receipt_hash: receiptHash };
  const stored = writeContentAddressedJson(`review/receipts/${job.project}`, receipt, { root, prefix: 'review-receipt' });

  const completed = {
    ...job,
    state: 'COMPLETED',
    receipt_rel: stored.rel,
    receipt_hash: receiptHash,
    completed_at: receipt.completed_at,
  };
  writeJsonAtomic(jobRel('completed', jobId), completed, root);
  try { fs.unlinkSync(resolveControlPath(jobRel('processing', jobId), root)); } catch {}

  const memoryCandidate = writeMemoryCandidate({
    project: job.project,
    tier: 'HOT',
    type: 'REVIEW',
    text: [
      `Review of ${job.checkpoint_id} by ${reviewerHarness}: ${receipt.verdict}.`,
      receipt.summary,
      ...normalizedFindings.map((f) => `${f.severity} ${f.category}: ${f.claim}`),
    ].filter(Boolean).join('\n'),
    refs: [stored.rel, ...receipt.evidence_refs],
    sourceHarness: reviewerHarness,
    repositorySha: reviewedRepositorySha,
    checkpointId: job.checkpoint_id,
    metadata: { review_receipt_hash: receiptHash },
  }, root);
  const admitted = admitMemoryCandidate({
    project: job.project,
    candidateRel: memoryCandidate.object_rel,
    admissionAuthority: 'VERIFIED_SYSTEM',
    evidenceRefs: [stored.rel],
    reconciliation: 'Structured review receipt bound to immutable checkpoint SHA; still non-authoritative project context.',
  }, root);

  appendJsonl('events/review-fabric.jsonl', {
    event: 'REVIEW_RECEIPT_SUBMITTED',
    review_job_id: jobId,
    checkpoint_id: job.checkpoint_id,
    reviewer_harness: reviewerHarness,
    verdict: receipt.verdict,
    receipt_hash: receiptHash,
    admitted_memory_id: admitted.memory_id,
    at: receipt.completed_at,
  }, root);
  return { receipt, receipt_rel: stored.rel, completed_job: completed, admitted_memory: admitted };
}

export function reviewCheckpointStatus(checkpointId, root = DEFAULT_CONTROL_HOME) {
  const jobs = ['inbox', 'processing', 'completed', 'failed']
    .flatMap((state) => listReviewJobs({ state }, root))
    .filter((job) => job.checkpoint_id === checkpointId);
  const completed = jobs.filter((job) => job.state === 'COMPLETED');
  const receipts = completed.map((job) => readJson(job.receipt_rel, null, root)).filter(Boolean);
  const providers = new Set(receipts.map((r) => r.model_provenance?.provider_family).filter(Boolean));
  const checkpointRel = jobs[0]?.checkpoint_rel;
  const checkpoint = checkpointRel ? readJson(checkpointRel, null, root) : null;
  const required = Number(checkpoint?.review_policy?.required_independent_reviews || 1);
  const diversityRequired = checkpoint?.review_policy?.provider_diversity_required === true;
  const blockingFindings = receipts.flatMap((r) => r.findings || []).filter((f) => ['CRITICAL', 'HIGH'].includes(f.severity));
  const quorum = receipts.length >= required && (!diversityRequired || providers.size >= 2);
  return {
    checkpoint_id: checkpointId,
    repository_sha: checkpoint?.repository_sha ?? null,
    required_reviews: required,
    completed_reviews: receipts.length,
    provider_families: [...providers].sort(),
    provider_diversity_required: diversityRequired,
    quorum_met: quorum,
    blocking_findings: blockingFindings.length,
    state: quorum ? (blockingFindings.length ? 'REVIEWED_CHANGES_REQUIRED' : 'REVIEWED') : 'REVIEW_PENDING',
    jobs,
    receipts,
  };
}

export function publishCheckpointIfChanged({
  project = 'dial',
  repoDir,
  root = DEFAULT_CONTROL_HOME,
  authorHarness,
  featureId = null,
  summary = null,
} = {}) {
  const git = captureGitState(repoDir);
  const cursor = readJson(`review/cursor-${projectSlug(project)}.json`, null, root);
  if (git.dirty) return { published: false, reason: 'DIRTY_REPOSITORY_NOT_IMMUTABLE', repository_sha: git.commit };
  if (cursor?.repository_sha === git.commit) return { published: false, reason: 'NO_NEW_COMMIT', repository_sha: git.commit };
  return publishReviewCheckpoint({ project, repoDir, root, authorHarness, featureId, summary });
}

async function main() {
  const command = process.argv[2] || 'status';
  if (command === 'publish-if-changed') {
    const result = publishCheckpointIfChanged({
      project: process.env.DIAL_PROJECT_ID || 'dial',
      repoDir: process.env.DIAL_REPO_DIR || process.cwd(),
      root: process.env.DIAL_CONTROL_HOME,
      authorHarness: process.env.DIAL_HARNESS_ID || 'chatgpt-hermes',
      featureId: process.env.DIAL_FEATURE_ID || null,
      summary: process.env.DIAL_CHECKPOINT_SUMMARY || null,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'status') {
    const checkpointId = process.argv[3];
    if (!checkpointId) throw new Error('checkpoint id is required');
    process.stdout.write(`${JSON.stringify(reviewCheckpointStatus(checkpointId, process.env.DIAL_CONTROL_HOME), null, 2)}\n`);
    return;
  }
  throw new Error(`unknown review-fabric command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
