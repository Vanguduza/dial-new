import { spawn } from 'node:child_process';

/**
 * spawnSync-shape { status, signal, stdout, stderr, error } but built on the
 * async `spawn`, so the caller's event loop keeps running (timers, other I/O)
 * while the child executes. Long Hermes/Claude runtime turns previously used
 * spawnSync here, which froze the orchestrator's heartbeat interval for the
 * entire turn because a synchronous child-process wait blocks all timers.
 */
export function spawnCapture(command, args = [], {
  cwd,
  env,
  timeout = 0,
  maxBuffer = 32 * 1024 * 1024,
} = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let terminationError = null;
    let timeoutTimer = null;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      resolve(result);
    };

    const overflow = () => {
      if (terminationError) return;
      terminationError = Object.assign(
        new Error(`spawnCapture output exceeded maxBuffer (${maxBuffer} bytes)`),
        { code: 'ENOBUFS' },
      );
      child.kill('SIGTERM');
    };

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > maxBuffer) overflow();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > maxBuffer) overflow();
    });

    child.once('error', (error) => {
      settle({ status: null, signal: null, stdout, stderr, error });
    });

    child.once('close', (code, signal) => {
      settle({ status: code, signal, stdout, stderr, error: terminationError });
    });

    if (timeout > 0) {
      timeoutTimer = setTimeout(() => {
        terminationError = terminationError || Object.assign(
          new Error(`spawnCapture timed out after ${timeout}ms`),
          { code: 'ETIMEDOUT' },
        );
        child.kill('SIGTERM');
      }, timeout);
      timeoutTimer.unref?.();
    }
  });
}
