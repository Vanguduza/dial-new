import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Backup-before-alter. Every file the bootstrap changes is copied, hashed and indexed under
// <control-home>/bootstrap/backups/<run-id>/ so `--rollback <run-id>` can restore it byte-for-byte.
export function backupRoot(controlHome) { return path.join(controlHome, 'bootstrap', 'backups'); }

export function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

export function backupFile({ controlHome, runId, file }) {
  const root = path.join(backupRoot(controlHome), runId);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const index = path.join(root, 'index.json');
  const entries = fs.existsSync(index) ? JSON.parse(fs.readFileSync(index, 'utf8')) : [];
  const existed = fs.existsSync(file);
  const id = `${entries.length}-${path.basename(file)}`;
  let copy = null; let hash = null; let mode = null;
  if (existed) {
    copy = path.join(root, id);
    fs.copyFileSync(file, copy);
    fs.chmodSync(copy, 0o600);
    hash = sha256File(file);
    mode = (fs.statSync(file).mode & 0o777).toString(8);
  }
  entries.push({ id, file, existed, copy, sha256: hash, mode, at: new Date().toISOString() });
  fs.writeFileSync(index, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
  return entries[entries.length - 1];
}

export function listBackups(controlHome) {
  const root = backupRoot(controlHome);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'index.json'))).sort();
}

export function rollback({ controlHome, runId, dryRun = false }) {
  const root = path.join(backupRoot(controlHome), runId);
  const index = path.join(root, 'index.json');
  if (!fs.existsSync(index)) throw new Error(`no backup index for run ${runId}`);
  const entries = JSON.parse(fs.readFileSync(index, 'utf8')).slice().reverse();
  const actions = [];
  for (const e of entries) {
    if (e.existed) {
      if (!dryRun) { fs.mkdirSync(path.dirname(e.file), { recursive: true }); fs.copyFileSync(e.copy, e.file); fs.chmodSync(e.file, parseInt(e.mode, 8)); }
      actions.push({ action: 'RESTORE', file: e.file, sha256: e.sha256 });
    } else {
      if (!dryRun && fs.existsSync(e.file)) fs.rmSync(e.file, { force: true });
      actions.push({ action: 'REMOVE_CREATED', file: e.file });
    }
  }
  return { run_id: runId, dry_run: dryRun, actions };
}
