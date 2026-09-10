import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function temp(name) { return mkdtempSync(path.join(tmpdir(), `${name}-`)); }

describe('project-isolated Codex app-server process ownership', () => {
  it('forces a live Codex probe before attempting the SIGKILL soak', () => {
    const soak = execFileSync('bash', ['-c', "cat deploy/oracle/hermes-codex/soak-control-plane.sh"], { encoding: 'utf8' });
    expect(soak).toMatch(/codex-app-server-probe\.mjs --force-live >\"\$probe_out\"/);
  });

  it('finds a nested probe descendant and ignores an unrelated matching process', async () => {
    if (!existsSync(`/proc/${process.pid}/task/${process.pid}/children`)) return;
    const helper = path.resolve('deploy/oracle/hermes-codex/process-tree.sh');
    const dir = temp('dial-proc-tree');
    const fakeCodex = path.join(dir, 'codex');
    writeFileSync(fakeCodex, '#!/usr/bin/env bash\ntrap "exit 0" TERM INT\nsleep 60\n');
    chmodSync(fakeCodex, 0o755);

    const unrelated = spawn(fakeCodex, ['app-server'], { stdio: 'ignore', detached: true });
    const root = spawn('bash', ['-c', `bash -c '${fakeCodex} app-server & wait' & wait`], {
      stdio: 'ignore', detached: true,
    });
    const runHelper = (body) => execFileSync('bash', ['-c', `source ${JSON.stringify(helper)}; ${body}`], { encoding: 'utf8' }).trim();

    try {
      const deadline = Date.now() + 3_000;
      let found = null;
      while (Date.now() < deadline && found === null) {
        try {
          const raw = runHelper(`dial_find_probe_owned_codex_app_server ${root.pid}`);
          if (/^[1-9][0-9]*$/.test(raw)) found = Number(raw);
        } catch {}
        if (found === null) await new Promise((resolve) => setTimeout(resolve, 40));
      }
      expect(found).not.toBeNull();
      expect(found).not.toBe(unrelated.pid);
      const descendants = runHelper(`dial_proc_descendants_postorder ${root.pid}`).split(/\s+/).filter(Boolean).map(Number);
      expect(descendants).toContain(found);
    } finally {
      try { process.kill(-root.pid, 'SIGTERM'); } catch {}
      try { process.kill(-unrelated.pid, 'SIGTERM'); } catch {}
    }
  }, 10_000);
});
