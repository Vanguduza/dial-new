#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readJson, resolveControlPath, writeJsonAtomic } from './state-store.mjs';

export const STORAGE_AUTHORITY = 'DIAL_HEALTH_SCREEN_FACTORY_STORAGE_PLANE';
export const STORAGE_POLICY = 'R2_PRIMARY_DRIVE_ARCHIVE_LOCAL_BOUNDED_CACHE_V1';
const STATUS_REL = 'screen-factory/storage-status.json';
const CONFIG_REL = 'screen-factory/storage-config.json';
const DEFAULT_LOCAL_LIMIT = 2 * 1024 ** 3;
const DEFAULT_DISK_RESERVE = 8 * 1024 ** 3;

function now() { return new Date().toISOString(); }
function bytesIn(target) {
  if (!fs.existsSync(target)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const p = path.join(target, entry.name);
    try { total += entry.isDirectory() ? bytesIn(p) : fs.statSync(p).size; } catch {}
  }
  return total;
}
function freeBytes(target) {
  try { const s = fs.statfsSync(target); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}
export function storageConfig(root) {
  const raw = readJson(CONFIG_REL, {}, root) || {};
  return {
    local_limit_bytes: Number(raw.local_limit_bytes || DEFAULT_LOCAL_LIMIT),
    disk_reserve_bytes: Number(raw.disk_reserve_bytes || DEFAULT_DISK_RESERVE),
    r2_remote: raw.r2_remote || 'dial-r2',
    drive_remote: raw.drive_remote || 'dial-drive',
    drive_enabled: raw.drive_enabled !== false,
    drive_account_email: raw.drive_account_email || process.env.DIAL_SCREEN_FACTORY_DRIVE_ACCOUNT || null,
    drive_root_folder_id: raw.drive_root_folder_id || process.env.DIAL_SCREEN_FACTORY_DRIVE_ROOT_FOLDER_ID || null,
    drive_platform_packs_folder_id: raw.drive_platform_packs_folder_id || process.env.DIAL_SCREEN_FACTORY_DRIVE_PLATFORM_PACKS_FOLDER_ID || null,
    drive_final_coverage_folder_id: raw.drive_final_coverage_folder_id || process.env.DIAL_SCREEN_FACTORY_DRIVE_FINAL_COVERAGE_FOLDER_ID || null,
    rclone_config: raw.rclone_config || resolveControlPath('secrets/rclone.conf', root),
  };
}
export function ensureStorageConfig(root) {
  const current = readJson(CONFIG_REL, null, root);
  if (!current) writeJsonAtomic(CONFIG_REL, {
    schema_version: 1, authority: STORAGE_AUTHORITY, policy: STORAGE_POLICY,
    local_limit_bytes: DEFAULT_LOCAL_LIMIT, disk_reserve_bytes: DEFAULT_DISK_RESERVE,
    r2_remote: 'dial-r2', drive_remote: 'dial-drive', drive_enabled: true,
    drive_account_email: process.env.DIAL_SCREEN_FACTORY_DRIVE_ACCOUNT || null,
    drive_root_folder_id: process.env.DIAL_SCREEN_FACTORY_DRIVE_ROOT_FOLDER_ID || null,
    drive_platform_packs_folder_id: process.env.DIAL_SCREEN_FACTORY_DRIVE_PLATFORM_PACKS_FOLDER_ID || null,
    drive_final_coverage_folder_id: process.env.DIAL_SCREEN_FACTORY_DRIVE_FINAL_COVERAGE_FOLDER_ID || null,
    rclone_config: resolveControlPath('secrets/rclone.conf', root), updated_at: now(),
  }, root);
  return storageConfig(root);
}
export function storageStatus(root) {
  const cfg = ensureStorageConfig(root);
  const base = resolveControlPath('screen-factory', root);
  const outputs = resolveControlPath('screen-factory/outputs', root);
  const packages = resolveControlPath('screen-factory/packages', root);
  const stages = resolveControlPath('screen-factory/platform-packs', root);
  const observed = readJson(STATUS_REL, {}, root) || {};
  const localBytes = bytesIn(outputs) + bytesIn(packages) + bytesIn(stages);
  const diskFree = freeBytes(base);
  return {
    schema_version: 1, authority: STORAGE_AUTHORITY, policy: STORAGE_POLICY,
    local_bytes: localBytes, local_limit_bytes: cfg.local_limit_bytes,
    local_percent: cfg.local_limit_bytes ? Number(((localBytes / cfg.local_limit_bytes) * 100).toFixed(2)) : null,
    disk_free_bytes: diskFree, disk_reserve_bytes: cfg.disk_reserve_bytes,
    r2: observed.r2 || { configured: false, state: 'WAITING_AUTH' },
    google_drive: { ...(observed.google_drive || { configured: false, state: 'WAITING_AUTH' }), account_email: cfg.drive_account_email || null, root_folder_id: cfg.drive_root_folder_id || null, platform_packs_folder_id: cfg.drive_platform_packs_folder_id || null, final_coverage_folder_id: cfg.drive_final_coverage_folder_id || null },
    last_sync_at: observed.last_sync_at || null,
    last_error: observed.last_error || null, updated_at: now(),
  };
}
export function storagePressure(root) {
  const s = storageStatus(root);
  const overLocal = Number(s.local_bytes || 0) >= Number(s.local_limit_bytes || Infinity);
  const underReserve = s.disk_free_bytes !== null && Number(s.disk_free_bytes) <= Number(s.disk_reserve_bytes || 0);
  return {
    blocked: overLocal || underReserve,
    reason: overLocal ? 'LOCAL_CACHE_LIMIT_REACHED' : (underReserve ? 'ORACLE_DISK_RESERVE_REACHED' : null),
    ...s,
  };
}
