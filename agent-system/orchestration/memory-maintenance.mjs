#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compactFeatureMemory } from './feature-memory.mjs';
import { DEFAULT_CONTROL_HOME, appendJsonl, ensureControlLayout, resolveControlPath } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');

function now() { return new Date().toISOString(); }

function listFeatureIds(root) {
  const base = resolveControlPath('memory/features', root);
  try {
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function sqliteQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function backupHermesState({ root = DEFAULT_CONTROL_HOME, hermesHome = DEFAULT_HERMES_HOME, retain = 7 } = {}) {
  ensureControlLayout(root);
  const source = path.join(hermesHome, 'state.db');
  if (!fs.existsSync(source)) return { backed_up: false, reason: 'HERMES_STATE_DB_MISSING', source };
  const backupDir = resolveControlPath('sessions/hermes/backups', root);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = now().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `state-${stamp}.db`);

  // SQLite's online backup command yields a transaction-consistent copy while
  // Hermes is using WAL mode. No OAuth files or ~/.hermes/.env are copied.
  execFileSync('sqlite3', [source, `.backup ${sqliteQuote(target)}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  fs.chmodSync(target, 0o600);

  const backups = fs.readdirSync(backupDir)
    .filter((name) => /^state-.*\.db$/.test(name))
    .sort()
    .reverse();
  const removed = [];
  for (const old of backups.slice(Math.max(1, retain))) {
    fs.rmSync(path.join(backupDir, old), { force: true });
    removed.push(old);
  }
  return { backed_up: true, target, retained: Math.min(backups.length, Math.max(1, retain)), removed };
}

export function maintainMemory({ root = DEFAULT_CONTROL_HOME, hermesHome = DEFAULT_HERMES_HOME, featureKeep = 120, backupRetain = 7 } = {}) {
  ensureControlLayout(root);
  const features = [];
  for (const featureId of listFeatureIds(root)) {
    try {
      features.push(compactFeatureMemory(featureId, { keep: featureKeep }, root));
    } catch (error) {
      features.push({ feature_id: featureId, error: String(error) });
    }
  }

  let hermesBackup;
  try {
    hermesBackup = backupHermesState({ root, hermesHome, retain: backupRetain });
  } catch (error) {
    hermesBackup = { backed_up: false, reason: 'BACKUP_FAILED', error: String(error) };
  }

  const result = {
    event: 'MEMORY_MAINTENANCE',
    feature_memory: features,
    hermes_session_backup: hermesBackup,
    policy: {
      feature_hot_records_retained: featureKeep,
      hermes_session_backups_retained: backupRetain,
      hermes_native_session_pruning_enabled_by_this_tool: false,
    },
    observed_at: now(),
  };
  appendJsonl('events/memory-maintenance.jsonl', result, root);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = maintainMemory({
    root: process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME,
    hermesHome: process.env.HERMES_HOME || DEFAULT_HERMES_HOME,
    featureKeep: Number(process.env.DIAL_FEATURE_MEMORY_KEEP || 120),
    backupRetain: Number(process.env.DIAL_HERMES_BACKUP_RETAIN || 7),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.hermes_session_backup?.reason === 'BACKUP_FAILED') process.exitCode = 1;
}
