#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJsonl, ensureControlLayout, readJson, writeJsonAtomic } from './state-store.mjs';

export const PROJECT_REGISTRY_REL = 'operations/project-registry.json';
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const DIAL_SERVICES = ['dial-hermes-runtime.service', 'hermes-gateway.service', 'hermes-dial-dashboard.service', 'dial-hermes-orchestrator.service', 'dial-hermes-operations.service', 'dial-mission-controller.service', 'dial-chat-control.service', 'dial-hermes-whatsapp-operator.service'];

function now() { return new Date().toISOString(); }
function validateSlug(slug) {
  const value = String(slug || '').trim();
  if (!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(value)) throw new Error('project slug is invalid');
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
    project_id: 'dial-development-system',
    name: 'DIAL Development System',
    classification: 'DEVELOPMENT_SYSTEM',
    repo_dir: normalizeRepo(repoDir),
    repository_mode: 'DEDICATED_REPOSITORY',
    scope_selector: null,
    project_kind: 'development-system',
    manager_policy: 'GPT-5.6_SOL_THEN_CLAUDE_SONNET_5',
    development_authority: 'EXTERNAL_HERMES_PRODUCTION_GREEN_ONLY',
    auxiliary_operations_authority: 'NON_AUTHORITATIVE',
    owns_complete_e2e_pipeline: true,
    runtime_dependency_on_dde: false,
    authority_dependency_on_dde: false,
    services: DIAL_SERVICES,
    created_at: now(),
    updated_at: now(),
  };
}

export function ensureProjectRegistry(root, { dialRepoDir = process.env.DIAL_REPO_DIR || DEFAULT_REPO } = {}) {
  ensureControlLayout(root);
  const existing = readJson(PROJECT_REGISTRY_REL, null, root);
  if (existing?.schema_version === 1 && Array.isArray(existing.projects)) {
    const dial = existing.projects.find((item) => item.slug === 'dial');
    if (!dial) return existing;
    const priorServices = Array.isArray(dial.services) ? dial.services : [];
    const services = [...new Set([...priorServices, ...DIAL_SERVICES])];
    if (services.length === priorServices.length && services.every((item, index) => item === priorServices[index])) return existing;
    const projects = existing.projects.map((item) => item.slug === 'dial' ? { ...item, services, updated_at: now() } : item);
    const next = { ...existing, projects, updated_at: now() };
    writeJsonAtomic(PROJECT_REGISTRY_REL, next, root);
    appendJsonl('events/project-registry.jsonl', { event: 'PROJECT_REGISTRY_RECONCILED', project: 'dial', added_services: services.filter((item) => !priorServices.includes(item)), at: now() }, root);
    return next;
  }
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

export function registerProject({ slug, name, repoDir, projectKind = 'software', classification = 'APPLICATION_PROJECT', managerPolicy = 'PROJECT_SPECIFIC_LOCKED_POLICY', services = [], repositoryMode = 'DEDICATED_REPOSITORY', scopeSelector = null, independence = null } = {}, root) {
  const key = validateSlug(slug);
  const registry = ensureProjectRegistry(root);
  const repo = normalizeRepo(repoDir);
  const sameRepo = registry.projects.filter((item) => item.slug !== key && item.repo_dir === repo);
  if (sameRepo.length) {
    const shared = repositoryMode === 'SHARED_MONOREPO' && sameRepo.every((item) => item.repository_mode === 'SHARED_MONOREPO');
    const selector = JSON.stringify(scopeSelector ?? null);
    const selectorConflict = sameRepo.some((item) => JSON.stringify(item.scope_selector ?? null) === selector);
    if (!shared || !scopeSelector || selectorConflict) throw new Error(`repository is already registered under another project: ${repo}`);
  }
  const previous = registry.projects.find((item) => item.slug === key);
  const project = {
    slug: key,
    project_id: key,
    name: String(name || key).trim().slice(0, 120),
    classification: String(classification || 'APPLICATION_PROJECT').trim().slice(0, 100),
    repo_dir: repo,
    repository_mode: repositoryMode === 'SHARED_MONOREPO' ? 'SHARED_MONOREPO' : 'DEDICATED_REPOSITORY',
    scope_selector: scopeSelector && typeof scopeSelector === 'object' ? scopeSelector : null,
    project_kind: String(projectKind || 'software').trim().slice(0, 80),
    manager_policy: String(managerPolicy || 'PROJECT_SPECIFIC_LOCKED_POLICY').trim().slice(0, 200),
    development_authority: key === 'dial' ? 'EXTERNAL_HERMES_PRODUCTION_GREEN_ONLY' : 'PROJECT_POLICY_REQUIRED',
    auxiliary_operations_authority: 'NON_AUTHORITATIVE',
    independence: independence && typeof independence === 'object' ? {
      runtime_dependency_of_dial_development_system: independence.runtime_dependency_of_dial_development_system === true,
      authority_dependency_of_dial_development_system: independence.authority_dependency_of_dial_development_system === true,
      shared_product_truth: independence.shared_product_truth === true,
      shared_mutable_memory: independence.shared_mutable_memory === true,
      shared_deployment_lifecycle: independence.shared_deployment_lifecycle === true,
    } : null,
    services: Array.isArray(services) ? services.map(String).filter(Boolean).slice(0, 30) : [],
    created_at: previous?.created_at ?? now(),
    updated_at: now(),
  };
  if (project.classification === 'INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT') {
    const i = project.independence || {};
    if (i.runtime_dependency_of_dial_development_system || i.authority_dependency_of_dial_development_system || i.shared_product_truth || i.shared_mutable_memory || i.shared_deployment_lifecycle) {
      throw new Error(`independent development system project ${key} cannot share DIAL runtime, authority, truth, mutable memory or deployment lifecycle`);
    }
  }
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
  if (command === 'register') return console.log(JSON.stringify(registerProject({ slug: argValue(args, '--slug'), name: argValue(args, '--name'), repoDir: argValue(args, '--repo'), projectKind: argValue(args, '--kind') || 'software', classification: argValue(args, '--classification') || 'APPLICATION_PROJECT', repositoryMode: argValue(args, '--repository-mode') || 'DEDICATED_REPOSITORY', managerPolicy: argValue(args, '--manager-policy') || 'PROJECT_SPECIFIC_LOCKED_POLICY' }), null, 2));
  throw new Error(`unknown project registry command: ${command}`);
}
if (import.meta.url === `file://${process.argv[1]}`) { try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; } }
