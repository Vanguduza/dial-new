import fs from 'node:fs';
import path from 'node:path';
import { FABRIC_ID, FABRIC_REVISION } from './constants.mjs';

export function auditRecord({ unit, route, decision, result, limits = {} }) {
  return {
    unit_id: unit?.unit_id || unit?.job_id || decision?.unit_id || null,
    requested_by: unit?.requested_by || decision?.requested_by || null,
    fabric: FABRIC_ID,
    revision: FABRIC_REVISION,
    provider_attempts: unit?.provider_attempts || route?.evidence?.attempts || [],
    selected_venue: decision?.venue || route?.venue || null,
    venue_basis: decision?.venue_basis || route?.venue_basis || null,
    cpu_limit: limits.cpu_limit ?? 0.75,
    memory_limit_mb: limits.memory_limit_mb ?? 2560,
    network_mode: limits.network_mode ?? 'airgapped',
    started_at: unit?.started_at || null,
    ended_at: unit?.ended_at || new Date().toISOString(),
    result: result || null,
  };
}

export function appendAuditRecord(filePath, record) {
  if (!filePath) throw new Error('audit path is required');
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}
