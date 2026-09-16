import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOOTSTRAP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = path.join(BOOTSTRAP_DIR, 'manifest.json');
export const ROLES_PATH = path.join(BOOTSTRAP_DIR, 'roles', 'roles.json');
export const REGISTRY_PATH = path.join(BOOTSTRAP_DIR, 'DEVELOPMENT_CAPABILITY_REGISTRY.json');
export const PINS_PATH = path.join(BOOTSTRAP_DIR, 'supply-chain', 'PINS.json');

const AUTH_TYPES = new Set(['NON_INTERACTIVE_SECRET', 'SSH_KEY', 'SERVICE_ACCOUNT', 'API_KEY', 'DEVICE_CODE', 'OAUTH_BROWSER', 'PROVIDER_LOGIN', 'HUMAN_APPROVAL', 'NONE']);
const CRITICALITY = new Set(['MANDATORY', 'REQUIRED', 'OPTIONAL']);
const READINESS = new Set(['CORE_DEVELOPMENT_REQUIRED', 'OWNER_CONTROL_REQUIRED', 'RECOVERY_REQUIRED', 'OPTIONAL_CAPABILITY', 'REFERENCE_ONLY']);
// Every install method is either verifiable at install time or explicitly not a host install.
const INSTALL = new Set(['APT_PINNED', 'APT_SIGNED_REPO', 'NPM_EXACT', 'RELEASE_TARBALL_SHA256', 'SOURCE_ARCHIVE_SHA256', 'INSTALLER_SHA256', 'REPO_PINNED_SCRIPT', 'REPO_LOCAL', 'PREINSTALLED', 'PROVIDER_MANAGED', 'MANUAL', 'NONE']);
const FORBIDDEN_INSTALL = new Set(['VENDOR_INSTALLER_UNPINNED', 'CURL_BASH', 'NPM_LATEST']);
const TOOLING_KINDS = new Set(['HOST_SOFTWARE', 'PROVIDER_RUNTIME', 'MCP_SERVICE', 'HOOK', 'SKILL', 'PLUGIN', 'OAUTH_CONNECTOR', 'REMOTE_API', 'WEB_APPLICATION', 'REPO_LOCAL', 'CREDENTIAL', 'NETWORK', 'HEALTH_CHECK', 'GATE', 'CLI']);

function fail(errors, msg) { errors.push(msg); }

export function validateManifest(m) {
  const errors = [];
  if (m.schema_version !== 2) fail(errors, 'schema_version must be 2');
  if (!m.roles || typeof m.roles !== 'object') fail(errors, 'roles map required');
  if (!m.readiness_profiles || typeof m.readiness_profiles !== 'object') fail(errors, 'readiness_profiles map required');
  for (const [key, list] of Object.entries({ packages: m.packages, runtimes: m.runtimes, services: m.services, mcp_servers: m.mcp_servers, providers: m.providers, plugins: m.plugins, credentials: m.credentials, network_dependencies: m.network_dependencies, health_checks: m.health_checks, certification_gates: m.certification_gates, containers: m.containers })) {
    if (!Array.isArray(list)) { fail(errors, `${key} must be an array`); continue; }
    const ids = new Set();
    for (const item of list) {
      if (!item.id) { fail(errors, `${key}: entry without id`); continue; }
      if (ids.has(item.id)) fail(errors, `${key}: duplicate id ${item.id}`);
      ids.add(item.id);
      if (!item.readiness_class) fail(errors, `${key}/${item.id}: readiness_class required`);
      else if (!READINESS.has(item.readiness_class)) fail(errors, `${key}/${item.id}: bad readiness_class ${item.readiness_class}`);
      if (item.criticality && !CRITICALITY.has(item.criticality)) fail(errors, `${key}/${item.id}: bad criticality ${item.criticality}`);
      if (item.auth_type && !AUTH_TYPES.has(item.auth_type)) fail(errors, `${key}/${item.id}: bad auth_type ${item.auth_type}`);
      if (item.install_method && FORBIDDEN_INSTALL.has(item.install_method)) fail(errors, `${key}/${item.id}: forbidden install_method ${item.install_method} (curl|bash, @latest and unpinned vendor installers are not permitted)`);
      if (item.install_method && !INSTALL.has(item.install_method)) fail(errors, `${key}/${item.id}: bad install_method ${item.install_method}`);
      if (item.hosts && !item.hosts.every((h) => m.roles[h])) fail(errors, `${key}/${item.id}: unknown host role in ${item.hosts.join(',')}`);
      if (key === 'credentials' && item.secret_value !== undefined) fail(errors, `${key}/${item.id}: manifests never carry secret values`);
      if (item.tooling_kind && !TOOLING_KINDS.has(item.tooling_kind)) fail(errors, `${key}/${item.id}: bad tooling_kind ${item.tooling_kind}`);
      // Reference-only items are never host software: they may not declare a binary, unit or install method.
      if (item.readiness_class === 'REFERENCE_ONLY' && (item.binary || item.unit || (item.install_method && item.install_method !== 'NONE'))) fail(errors, `${key}/${item.id}: REFERENCE_ONLY items cannot declare a binary/unit/install_method`);
      if (item.readiness_class === 'REFERENCE_ONLY' && item.hosts && item.hosts.length) fail(errors, `${key}/${item.id}: REFERENCE_ONLY items have no host placement`);
      // Optional capabilities are non-blocking only when canon says so.
      if (item.readiness_class === 'OPTIONAL_CAPABILITY' && !item.canon_non_blocking_ref) fail(errors, `${key}/${item.id}: OPTIONAL_CAPABILITY requires canon_non_blocking_ref`);
      // Required tooling must have install/config/auth/probe semantics (closure item 9).
      if (['CORE_DEVELOPMENT_REQUIRED', 'OWNER_CONTROL_REQUIRED', 'RECOVERY_REQUIRED'].includes(item.readiness_class) && ['runtimes', 'mcp_servers', 'providers', 'plugins', 'credentials'].includes(key)) {
        for (const f of ['install_semantics', 'config_semantics', 'auth_semantics', 'probe_semantics']) if (!item[f]) fail(errors, `${key}/${item.id}: required tooling must declare ${f}`);
      }
      // Policy may not mandate absent tooling: a policy_mandate item must be provisioned somewhere.
      if (item.policy_mandate === true && item.readiness_class === 'OPTIONAL_CAPABILITY') fail(errors, `${key}/${item.id}: policy_mandate=true contradicts OPTIONAL_CAPABILITY (closure item 7)`);
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
export function loadPins(file = PINS_PATH) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

export function itemsForRole(list, role) { return (list || []).filter((x) => !x.hosts || x.hosts.includes(role)); }
