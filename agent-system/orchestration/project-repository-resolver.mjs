import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_CONTROL_HOME, readJson } from './state-store.mjs';

function slug(value) {
  const project = String(value || 'dial').toLowerCase().replace(/[^a-z0-9._:-]+/g, '-');
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(project)) throw new Error(`invalid project: ${value}`);
  return project;
}
function git(cwd, args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}
function normalizeOrigin(value) {
  let url = String(value || '').trim();
  if (/^git@github\.com:/.test(url)) url = `https://github.com/${url.slice('git@github.com:'.length)}`;
  if (url && !url.endsWith('.git')) url += '.git';
  return url;
}

export function loadProjectRepositoryRegistry(root = DEFAULT_CONTROL_HOME) {
  return readJson('config/project-repositories.json', {
    schema_version: 1,
    projects: {},
  }, root);
}

export function resolveProjectRepository({
  project = 'dial',
  root = DEFAULT_CONTROL_HOME,
  defaultRepoDir = null,
} = {}) {
  const id = slug(project);
  const registry = loadProjectRepositoryRegistry(root);
  const entry = registry.projects?.[id] ?? null;
  const candidate = entry?.path || (id === 'dial' ? defaultRepoDir : null);
  if (!candidate) {
    throw new Error(`PROJECT_REPOSITORY_UNAVAILABLE:${id}: no allowlisted repository path is configured`);
  }
  const repoDir = path.resolve(candidate);
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`PROJECT_REPOSITORY_UNAVAILABLE:${id}: ${repoDir} is not a Git checkout`);
  }
  const observedOrigin = normalizeOrigin(git(repoDir, ['remote', 'get-url', 'origin']));
  const expectedOrigin = normalizeOrigin(entry?.origin_url || '');
  if (expectedOrigin && observedOrigin !== expectedOrigin) {
    throw new Error(`PROJECT_REPOSITORY_ORIGIN_MISMATCH:${id}`);
  }
  return {
    project: id,
    repo_dir: repoDir,
    origin_url: observedOrigin || expectedOrigin || null,
    default_branch: entry?.default_branch || null,
    authority_mode: entry?.authority_mode || (id === 'dial' ? 'DIAL_PROJECT_TRUTH' : 'REPOSITORY_CANON'),
    repository_sha: git(repoDir, ['rev-parse', 'HEAD']) || null,
    branch: git(repoDir, ['branch', '--show-current']) || null,
  };
}
