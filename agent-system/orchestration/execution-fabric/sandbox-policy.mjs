import { SANDBOX_DEFAULTS } from './constants.mjs';

const DENY_ARG_RE = [
  /--privileged/,
  /docker\.sock/,
  /--network=host/,
  /--pid=host/,
  /--ipc=host/,
];

const DENY_MOUNT_RE = [
  /^\/etc(\/|$)/,
  /^\/root(\/|$)/,
  /^\/home(\/|$)/,
  /^\/var\/lib(\/|$)/,
  /^\/var\/run(\/|$)/,
  /\/\.ssh(\/|$)/,
  /id_rsa|id_ed25519|authorized_keys/,
];

export function assertSandboxArgs(args) {
  const text = Array.isArray(args) ? args.join(' ') : String(args || '');
  for (const re of DENY_ARG_RE) {
    if (re.test(text)) {
      return { ok: false, reason: `SANDBOX_DENIED:${re}` };
    }
  }
  return { ok: true, reason: null };
}

export function assertSandboxMount(hostPath) {
  const normalized = String(hostPath || '').replace(/\\/g, '/');
  for (const re of DENY_MOUNT_RE) {
    if (re.test(normalized)) return { ok: false, reason: `SANDBOX_MOUNT_DENIED:${normalized}` };
  }
  return { ok: true, reason: null };
}

export function buildSandboxSpec({ taskId, jobToken, profile = 'disposable' } = {}) {
  if (!taskId) throw new Error('taskId is required');
  const workspace = `/srv/dial/workspaces/${taskId}`;
  return {
    ...SANDBOX_DEFAULTS,
    container_persistent: profile === 'persistent',
    docker_volumes: [
      `${workspace}:/workspace:rw`,
      '/srv/dial/reference:/reference:ro',
    ],
    docker_forward_env: ['MCP_JOB_TOKEN'],
    env: jobToken ? { MCP_JOB_TOKEN: jobToken } : {},
    docker_network: false,
    approvals: {
      mode: 'smart',
      deny: ['*--privileged*', '*docker.sock*', '*--network=host*'],
    },
  };
}

export function dockerRunArgv(spec) {
  const args = ['run'];
  if (!spec.container_persistent) args.push('--rm');
  args.push(
    '--name',
    `dial-sandbox-${spec.task_id || spec.taskId || 'unit'}`,
    '--cpus', String(spec.container_cpu),
    '--memory', `${spec.container_memory}m`,
    '--network', 'none',
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
  );
  for (const volume of spec.docker_volumes || []) {
    const hostPath = String(volume).split(':')[0];
    const mountGate = assertSandboxMount(hostPath);
    if (!mountGate.ok) throw new Error(mountGate.reason);
    args.push('-v', volume);
  }
  for (const key of spec.docker_forward_env || []) {
    if (key !== 'MCP_JOB_TOKEN') throw new Error('SANDBOX_ENV_DENIED');
    if (spec.env?.[key] != null) args.push('-e', `${key}=${spec.env[key]}`);
  }
  args.push(spec.docker_image);
  const gate = assertSandboxArgs(args);
  if (!gate.ok) throw new Error(gate.reason);
  return args;
}

export function forwardedEnvNames(spec) {
  return Object.keys(spec?.env || {}).sort();
}
