import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOOTSTRAP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = path.join(BOOTSTRAP_DIR, 'manifest.json');
export const ROLES_PATH = path.join(BOOTSTRAP_DIR, 'roles', 'roles.json');
export const REGISTRY_PATH = path.join(BOOTSTRAP_DIR, 'DEVELOPMENT_CAPABILITY_REGISTRY.json');

const AUTH_TYPES = new Set(['NON_INTERACTIVE_SECRET', 'SSH_KEY', 'SERVICE_ACCOUNT', 'API_KEY', 'DEVICE_CODE', 'OAUTH_BROWSER', 'PROVIDER_LOGIN', 'HUMAN_APPROVAL', 'NONE']);
const CRITICALITY = new Set(['MANDATORY', 'REQUIRED', 'OPTIONAL']);
const INSTALL = new Set(['APT_PINNED', 'NPM_EXACT', 'RELEASE_TARBALL_SHA256', 'VENDOR_INSTALLER_UNPINNED', 'REPO_LOCAL', 'PREINSTALLED', 'MANUAL', 'NONE']);

function fail(errors, msg) { errors.push(msg); }

export function validateManifest(m) {
  const errors = [];
  if (m.schema_version !== 1) fail(errors, 'schema_version must be 1');
  if (!m.roles || typeof m.roles !== 'object') fail(errors, 'roles map required');
  for (const [key, list] of Object.entries({ packages: m.packages, runtimes: m.runtimes, services: m.services, mcp_servers: m.mcp_servers, providers: m.providers, plugins: m.plugins, credentials: m.credentials, network_dependencies: m.network_dependencies, health_checks: m.health_checks, certification_gates: m.certification_gates, containers: m.containers })) {
    if (!Array.isArray(list)) { fail(errors, `${key} must be an array`); continue; }
    const ids = new Set();
    for (const item of list) {
      if (!item.id) fail(errors, `${key}: entry without id`);
      if (ids.has(item.id)) fail(errors, `${key}: duplicate id ${item.id}`);
      ids.add(item.id);
      if (item.criticality && !CRITICALITY.has(item.criticality)) fail(errors, `${key}/${item.id}: bad criticality ${item.criticality}`);
      if (item.auth_type && !AUTH_TYPES.has(item.auth_type)) fail(errors, `${key}/${item.id}: bad auth_type ${item.auth_type}`);
      if (item.install_method && !INSTALL.has(item.install_method)) fail(errors, `${key}/${item.id}: bad install_method ${item.install_method}`);
      if (item.hosts && !item.hosts.every((h) => m.roles[h])) fail(errors, `${key}/${item.id}: unknown host role in ${item.hosts.join(',')}`);
      if (key === 'credentials' && item.secret_value !== undefined) fail(errors, `${key}/${item.id}: manifests never carry secret values`);
    }
  }
  return errors;
}

export function loadManifest(file = MANIFEST_PATH) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = validateManifest(m);
  if (errors.length) throw new Error(`manifest invalid:\n - ${errors.join('\n - ')}`);
  return m;
}

export function loadRoles(file = ROLES_PATH) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function loadRegistry(file = REGISTRY_PATH) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

export function itemsForRole(list, role) { return (list || []).filter((x) => !x.hosts || x.hosts.includes(role)); }
