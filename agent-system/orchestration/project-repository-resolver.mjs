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

function loadSeedRegistry(repoDir) {
  if (!repoDir) return null;
  const file = path.join(repoDir, 'agent-system/registries/UNIVERSAL_PROJECT_REGISTRY.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function runtimeProjectEntry(id, root) {
  const runtime = readJson('operations/project-registry.json', null, root);
  const rows = Array.isArray(runtime?.projects) ? runtime.projects : [];
  return rows.find((row) => row.slug === id || row.project_id === id) || null;
}

export function resolveProjectRepository({
  project = 'dial',
  root = DEFAULT_CONTROL_HOME,
  defaultRepoDir = null,
} = {}) {
  const id = slug(project);
  const configRegistry = loadProjectRepositoryRegistry(root);
  const configured = configRegistry.projects?.[id] ?? null;
  const runtime = runtimeProjectEntry(id, root);
  const seedRegistry = loadSeedRegistry(defaultRepoDir);
  const system = seedRegistry?.development_system || null;
  const seed = seedRegistry?.seed_projects?.[id] || null;

  const defaultOrigin = defaultRepoDir ? normalizeOrigin(git(defaultRepoDir, ['remote', 'get-url', 'origin'])) : '';
  const seedOrigin = normalizeOrigin(seed?.repository?.origin_url || '');
  const systemOrigin = normalizeOrigin(system?.repository?.origin_url || '');
  const isSystem = id === 'dial' || id === system?.project_id;
  const seedUsesDefaultRepo = Boolean(defaultRepoDir && seedOrigin && seedOrigin === defaultOrigin);
  const candidate = configured?.path || runtime?.repo_dir || (isSystem || seedUsesDefaultRepo ? defaultRepoDir : null);

  if (!candidate) {
    const knownOrigin = seedOrigin || normalizeOrigin(configured?.origin_url || '');
    throw new Error(`PROJECT_REPOSITORY_UNAVAILABLE:${id}: admitted project has no local checkout${knownOrigin ? ` for ${knownOrigin}` : ''}`);
  }

  const repoDir = path.resolve(candidate);
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`PROJECT_REPOSITORY_UNAVAILABLE:${id}: ${repoDir} is not a Git checkout`);
  }

  const observedOrigin = normalizeOrigin(git(repoDir, ['remote', 'get-url', 'origin']));
  const expectedOrigin = normalizeOrigin(
    configured?.origin_url
    || seed?.repository?.origin_url
    || (isSystem ? system?.repository?.origin_url : '')
    || '',
  );
  if (expectedOrigin && observedOrigin && observedOrigin !== expectedOrigin) {
    throw new Error(`PROJECT_REPOSITORY_ORIGIN_MISMATCH:${id}`);
  }

  const classification = seed?.classification || runtime?.classification || (isSystem ? 'DEVELOPMENT_SYSTEM' : 'APPLICATION_PROJECT');
  return {
    project: id,
    project_id: runtime?.project_id || seed?.project_id || (isSystem ? system?.project_id || 'dial-development-system' : id),
    classification,
    repo_dir: repoDir,
    origin_url: observedOrigin || expectedOrigin || null,
    default_branch: configured?.default_branch || seed?.repository?.default_branch || (isSystem ? system?.repository?.default_branch : null) || runtime?.default_branch || null,
    repository_mode: seed?.repository?.mode || runtime?.repository_mode || 'DEDICATED_REPOSITORY',
    scope_selector: seed?.scope_selector || runtime?.scope_selector || null,
    authority_mode: configured?.authority_mode || (
      isSystem
        ? 'DIAL_DEVELOPMENT_SYSTEM_PROJECT_TRUTH'
        : classification === 'INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT'
          ? 'INDEPENDENT_PROJECT_REPOSITORY_CANON'
          : 'PROJECT_REPOSITORY_CANON'
    ),
    repository_sha: git(repoDir, ['rev-parse', 'HEAD']) || null,
    branch: git(repoDir, ['branch', '--show-current']) || null,
  };
}
