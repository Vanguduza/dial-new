import { describe, expect, it } from 'vitest';
import { spawnCapture } from '../agent-system/orchestration/process-capture.mjs';

const node = process.execPath;

describe('spawnCapture', () => {
  it('captures stdout, stderr and a zero exit status', async () => {
    const result = await spawnCapture(node, ['-e', "process.stdout.write('out'); process.stderr.write('err');"]);
    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
    expect(result.error).toBeNull();
  });

  it('reports a non-zero exit status', async () => {
    const result = await spawnCapture(node, ['-e', 'process.exit(3);']);
    expect(result.status).toBe(3);
  });

  it('does not block the event loop while the child runs, unlike spawnSync', async () => {
    let ticks = 0;
    const ticker = setInterval(() => { ticks += 1; }, 10);
    try {
      const result = await spawnCapture(node, ['-e', 'setTimeout(() => {}, 150);']);
      expect(result.status).toBe(0);
      // A real spawnSync call here would have frozen the event loop for the
      // full 150ms and this would still read 0 — that stall is exactly what
      // starved the external-orchestrator heartbeat interval during long
      // Hermes/Claude turns.
      expect(ticks).toBeGreaterThan(0);
    } finally {
      clearInterval(ticker);
    }
  });

  it('kills the child and reports a timeout error', async () => {
    const result = await spawnCapture(node, ['-e', 'setTimeout(() => {}, 5000);'], { timeout: 50 });
    expect(result.status).toBeNull();
    expect(result.signal).toBe('SIGTERM');
    expect(result.error?.code).toBe('ETIMEDOUT');
  });

  it('kills the child and reports an overflow error once maxBuffer is exceeded', async () => {
    const result = await spawnCapture(
      node,
      ['-e', "setInterval(() => process.stdout.write('x'.repeat(1024)), 1);"],
      { maxBuffer: 2048, timeout: 5000 },
    );
    expect(result.signal).toBe('SIGTERM');
    expect(result.error?.code).toBe('ENOBUFS');
  });

  it('reports a spawn error for a missing executable', async () => {
    const result = await spawnCapture('dial-command-that-does-not-exist', []);
    expect(result.status).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
