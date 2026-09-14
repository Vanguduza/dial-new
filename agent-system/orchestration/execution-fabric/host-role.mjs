import fs from 'node:fs';
import { HOST_ROLES, NODE_NAMES } from './constants.mjs';

export const DEFAULT_HOST_ROLE_PATH = process.env.DIAL_HOST_ROLE_FILE || '/etc/dial/host-role';

export function parseHostRoleText(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  const role = values.ROLE || values.role;
  if (!Object.values(HOST_ROLES).includes(role)) {
    throw new Error(`invalid host ROLE: ${role || '(missing)'}`);
  }
  return {
    role,
    hostname: values.HOSTNAME || values.hostname || null,
    node_id: values.NODE_ID || values.node_id || values.HOSTNAME || null,
    source: values,
  };
}

export function loadHostRole(filePath = DEFAULT_HOST_ROLE_PATH) {
  return parseHostRoleText(fs.readFileSync(filePath, 'utf8'));
}

export function expectedRoleForHostname(hostname) {
  if (hostname === NODE_NAMES.CONTROL) return HOST_ROLES.CONTROL_AUTHORITY;
  if (hostname === NODE_NAMES.WORKER) return HOST_ROLES.BACKGROUND_COORDINATOR;
  if (hostname === NODE_NAMES.ADMIN) return HOST_ROLES.RECOVERY_CONTROL_ONLY;
  return null;
}

export function evaluateHostRole({ hostRole, unit, requestedVenue = null }) {
  const role = hostRole?.role;
  const isProjectWork = unit?.work_class !== 'RECOVERY' && unit?.work_class !== 'CONTROL_PLANE';
  const heavy = unit?.control_plane_facts?.heavy_local === true || requestedVenue === 'ORACLE_SANDBOX' || requestedVenue === 'ORACLE_LOCAL_HEAVY';

  if (role === HOST_ROLES.RECOVERY_CONTROL_ONLY) {
    if (isProjectWork || requestedVenue === 'ORACLE_SANDBOX' || requestedVenue === 'FALLBACK_VENUE') {
      return { ok: false, reason: 'ORACLE_ADMIN_REJECTS_PROJECT_AND_FALLBACK' };
    }
    return { ok: true, reason: 'RECOVERY_ONLY' };
  }

  if (role === HOST_ROLES.BACKGROUND_COORDINATOR) {
    if (requestedVenue === 'CONTROL_AUTHORITY') {
      return { ok: false, reason: 'VEKL_WORKER_REJECTS_CONTROL_AUTHORITY' };
    }
    if (heavy) {
      return { ok: false, reason: 'VEKL_WORKER_REJECTS_HEAVY_LOCAL_COMPUTE' };
    }
    return { ok: true, reason: 'COORDINATION_ONLY' };
  }

  if (role === HOST_ROLES.CONTROL_AUTHORITY) {
    return { ok: true, reason: 'CONTROL_AUTHORITY' };
  }

  return { ok: false, reason: 'UNKNOWN_HOST_ROLE' };
}
