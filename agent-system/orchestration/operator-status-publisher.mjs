#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  OPERATOR_STATUS_BRANCH,
  OPERATOR_STATUS_FILE,
  operatorStatusSemanticHash,
  operatorStatusSnapshot,
} from './operator-status.mjs';
import { readJson, writeJsonAtomic } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const STATE_REL = 'state/operator-status-publisher.json';
const DEFAULT_MAX_IDLE_REFRESH_MS = 5 * 60 * 1000;

function git(repoDir, args, { input, env = {} } = {}) {
  return execFileSync('git', args, {
    cwd: repoDir,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(input === undefined ? {} : { input }),
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', ...env },
  }).trim();
}

function dueForHeartbeat(previous, nowMs, maxIdleRefreshMs) {
  const prior = Date.parse(previous?.published_at || '');
  return !Number.isFinite(prior) || nowMs - prior >= maxIdleRefreshMs;
}
export function createStatusCommit(repoDir, { tree, parent, observedAt }) {
  if (!tree || !parent || !observedAt) throw new Error('status commit requires tree, canonical parent and observedAt');
  return git(repoDir, ['commit-tree', tree, '-p', parent], {
    input: `DIAL Oracle runtime status ${observedAt}\n`,
    env: {
      GIT_AUTHOR_NAME: 'DIAL Oracle Status',
      GIT_AUTHOR_EMAIL: 'dial-oracle-status@invalid.local',
      GIT_COMMITTER_NAME: 'DIAL Oracle Status',
      GIT_COMMITTER_EMAIL: 'dial-oracle-status@invalid.local',
      GIT_AUTHOR_DATE: observedAt,
      GIT_COMMITTER_DATE: observedAt,
    },
  });
}

export function publishOperatorStatus({
  repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO,
  root,
  remote = 'origin',
  branch = OPERATOR_STATUS_BRANCH,
  nowMs = Date.now(),
  maxIdleRefreshMs = Number(process.env.DIAL_OPERATOR_STATUS_MAX_IDLE_MS || DEFAULT_MAX_IDLE_REFRESH_MS),
  push = true,
} = {}) {
  const status = operatorStatusSnapshot({ repoDir, root, nowMs });
  const semanticHash = operatorStatusSemanticHash(status);
  const previous = readJson(STATE_REL, null, root);
  if (previous?.pushed === true && previous?.semantic_hash === semanticHash && !dueForHeartbeat(previous, nowMs, maxIdleRefreshMs)) {
    return {
      state: 'CURRENT',
      branch,
      semantic_hash: semanticHash,
      published_at: previous.published_at,
      commit: previous.commit ?? null,
    };
  }

  const payload = `${JSON.stringify(status, null, 2)}\n`;
  const blob = git(repoDir, ['hash-object', '-w', '--stdin'], { input: payload });
  const tree = git(repoDir, ['mktree'], { input: `100644 blob ${blob}\t${OPERATOR_STATUS_FILE}\n` });
  const observedAt = status.observed_at;
  const parent = git(repoDir, ['rev-parse', 'HEAD']);
  const commit = createStatusCommit(repoDir, { tree, parent, observedAt });
  if (push) git(repoDir, ['push', '--quiet', '--force', remote, `${commit}:refs/heads/${branch}`]);
  const record = {
    schema_version: 1,
    authority: 'NON_AUTHORITATIVE_OPERATOR_STATUS_MIRROR',
    branch,
    commit,
    parent,
    semantic_hash: semanticHash,
    published_at: observedAt,
    pushed: Boolean(push),
  };
  writeJsonAtomic(STATE_REL, record, root);
  return { state: 'PUBLISHED', ...record };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = publishOperatorStatus({ push: !process.argv.includes('--no-push') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`DIAL operator status publish failed: ${String(error?.stderr || error?.message || error).slice(0, 3000)}\n`);
    process.exitCode = 1;
  }
}
