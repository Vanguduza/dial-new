#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';

export const PROJECT_REGISTRY_REL = 'operations/project-registry.json';
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const DIAL_SERVICES = ['dial-hermes-runtime.service', 'hermes-gateway.service', 'hermes-dial-dashboard.service', 'dial-hermes-orchestrator.service', 'dial-hermes-operations.service', 'dial-mission-controller.service', 'dial-chat-control.service'];

function now() { return new Date().toISOString(); }
function validateSlug(slug) {
  const value = String(slug || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) throw new Error('project slug must match ^[a-z0-9][a-z0-9-]{0,62}$');
  return value;
}
function normalizeRepo(repoDir) {
  const value = path.resolve(String(repoDir || ''));
  if (!path.isAbsolute(value) || !fs.existsSync(value)) throw new Error(`project repository does not exist: ${value}`);
  return fs.realpathSync(value);
}

export function defaultDialProject(repoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO) {
  return {
    slug: 'dial',
    name: 'DIAL Main',
    repo_dir: normalizeRepo(repoDir),
    project_kind: 'software',
    manager_policy: 'GPT-5.6_SOL_THEN_CLAUDE_SONNET_5',
    development_authority: 'EXTERNAL_HERMES_PRODUCTION_GREEN_ONLY',
    auxiliary_operations_authority: 'NON_AUTHORITATIVE',
    services: DIAL_SERVICES,
    created_at: now(),
    updated_at: now(),
  };
}

export function ensureProjectRegistry(root, { dialRepoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO } = {}) {
  ensureControlLayout(root);
  const existing = readJson(PROJECT_REGISTRY_REL, null, root);
  if (existing?.schema_version === 1 && Array.isArray(existing.projects)) return existing;
  const registry = { schema_version: 1, isolation: 'STRICT_PER_PROJECT_OPERATIONS_STATE', projects: [defaultDialProject(dialRepoDir)], updated_at: now() };
  writeJsonAtomic(PROJECT_REGISTRY_REL, registry, root);
  appendJsonl('events/project-registry.jsonl', { event: 'PROJECT_REGISTRY_CREATED', projects: ['dial'], at: now() }, root);
  return registry;
}

export function listProjects(root) { return ensureProjectRegistry(root).projects; }
export function getProject(slug, root) {
  const key = validateSlug(slug);
  const project = listProjects(root).find((item) => item.slug === key);
  if (!project) throw new Error(`unknown project: ${key}`);
  return project;
}

export function registerProject({ slug, name, repoDir, projectKind = 'software', managerPolicy = 'PROJECT_SPECIFIC_LOCKED_POLICY', services = [] } = {}, root) {
  const key = validateSlug(slug);
  const registry = ensureProjectRegistry(root);
  const repo = normalizeRepo(repoDir);
  if (registry.projects.some((item) => item.slug !== key && item.repo_dir === repo)) throw new Error(`repository is already registered under another project: ${repo}`);
  const previous = registry.projects.find((item) => item.slug === key);
  const project = {
    slug: key,
    name: String(name || key).trim().slice(0, 120),
    repo_dir: repo,
    project_kind: String(projectKind || 'software').trim().slice(0, 80),
    manager_policy: String(managerPolicy || 'PROJECT_SPECIFIC_LOCKED_POLICY').trim().slice(0, 200),
    development_authority: key === 'dial' ? 'EXTERNAL_HERMES_PRODUCTION_GREEN_ONLY' : 'PROJECT_POLICY_REQUIRED',
    auxiliary_operations_authority: 'NON_AUTHORITATIVE',
    services: Array.isArray(services) ? services.map(String).filter(Boolean).slice(0, 30) : [],
    created_at: previous?.created_at ?? now(),
    updated_at: now(),
  };
  const projects = [...registry.projects.filter((item) => item.slug !== key), project].sort((a, b) => a.slug.localeCompare(b.slug));
  writeJsonAtomic(PROJECT_REGISTRY_REL, { ...registry, projects, updated_at: now() }, root);
  appendJsonl('events/project-registry.jsonl', { event: previous ? 'PROJECT_REGISTRY_UPDATED' : 'PROJECT_REGISTERED', project: key, repo_dir: repo, at: now() }, root);
  return project;
}

function argValue(args, name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
function main() {
  const command = process.argv[2] || 'list'; const args = process.argv.slice(3);
  if (command === 'init') return console.log(JSON.stringify(ensureProjectRegistry(), null, 2));
  if (command === 'list') return console.log(JSON.stringify(listProjects(), null, 2));
  if (command === 'show') return console.log(JSON.stringify(getProject(args[0] || 'dial'), null, 2));
  if (command === 'register') return console.log(JSON.stringify(registerProject({ slug: argValue(args, '--slug'), name: argValue(args, '--name'), repoDir: argValue(args, '--repo'), projectKind: argValue(args, '--kind') || 'software', managerPolicy: argValue(args, '--manager-policy') || 'PROJECT_SPECIFIC_LOCKED_POLICY' }), null, 2));
  throw new Error(`unknown project registry command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
