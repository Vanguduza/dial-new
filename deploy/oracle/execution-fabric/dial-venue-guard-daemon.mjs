#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const target = path.join(root, 'state/venue-guard.json');

function pulse() {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const body = {
    state: 'ACTIVE',
    observed_at: new Date().toISOString(),
    max_age_ms: 60_000,
    pid: process.pid,
    fabric: 'PROVIDER_FIRST_EXECUTION_FABRIC',
    revision: '2.0',
  };
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, target);
}

pulse();
setInterval(pulse, 15_000).unref?.();
setInterval(() => {}, 1 << 30);
