#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
export const STATE_DIR = process.env.DIAL_FABRIC_STATE || '/var/lib/dial-fabric';
const RETAIN = new Set(['telemetry','recovery-state']);
export function cleanup({ stateDir = STATE_DIR, nowMs = Date.now(), maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  const removed = [];
  for (const dir of ['decisions','archive','rejected','recovery-evidence','recovery-leases']) {
    if (RETAIN.has(dir)) continue;
    const root = path.join(stateDir, dir);
    let files = [];
    try { files = fs.readdirSync(root); } catch { continue; }
    for (const name of files) {
      const target = path.join(root, name);
      let st; try { st = fs.statSync(target); } catch { continue; }
      if (!st.isFile()) continue;
      if (nowMs - st.mtimeMs > maxAgeMs) { fs.rmSync(target, { force: true }); removed.push(target); }
    }
  }
  return removed;
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify({ removed: cleanup() }, null, 2));
