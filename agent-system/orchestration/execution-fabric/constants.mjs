export const FABRIC_ID = 'PROVIDER_FIRST_EXECUTION_FABRIC';
export const FABRIC_REVISION = '2.0';

export const VENUE_BASES = Object.freeze({
  HOST_SUBJECT: 'HOST_SUBJECT',
  PROVIDER_ENVELOPE_EXCEEDED: 'PROVIDER_ENVELOPE_EXCEEDED',
  PROVIDER_ATTEMPTED_INADEQUATE: 'PROVIDER_ATTEMPTED_INADEQUATE',
});

export const FORBIDDEN_LOCAL_BASIS = 'PROVIDER_UNAVAILABLE';

export const HOST_ROLES = Object.freeze({
  CONTROL_AUTHORITY: 'CONTROL_AUTHORITY',
  BACKGROUND_COORDINATOR: 'BACKGROUND_COORDINATOR',
  RECOVERY_CONTROL_ONLY: 'RECOVERY_CONTROL_ONLY',
});

export const NODE_NAMES = Object.freeze({
  CONTROL: 'dial-hermes-control',
  WORKER: 'vekl-worker',
  ADMIN: 'oracle-admin',
});

export const PROVIDER_OUTCOMES = Object.freeze({
  SUCCESS: 'SUCCESS',
  UNAVAILABLE: 'UNAVAILABLE',
  INFRASTRUCTURE_INADEQUATE: 'INFRASTRUCTURE_INADEQUATE',
});

export const ROUTER_ACTIONS = Object.freeze({
  DISPATCH_PROVIDER: 'DISPATCH_PROVIDER',
  ORACLE_SANDBOX: 'ORACLE_SANDBOX',
  ORACLE_PRIVILEGED: 'ORACLE_PRIVILEGED',
  RETRY_PROVIDER: 'RETRY_PROVIDER',
  SWITCH_PROVIDER: 'SWITCH_PROVIDER',
  QUEUE: 'QUEUE',
  FAIL: 'FAIL',
  REJECT: 'REJECT',
});

export const ENVELOPE_DIMENSIONS = Object.freeze([
  'cpu',
  'memory_mb',
  'disk_mb',
  'wall_clock_s',
  'network_egress_mb',
]);

export const DEFAULT_ATTEMPT_BUDGET = Object.freeze({
  max_provider_attempts: 3,
  max_attempt_wall_clock: 300,
  max_total_wall_clock: 900,
});

export const SANDBOX_DEFAULTS = Object.freeze({
  backend: 'docker',
  docker_image: 'dial/toolbox:2026.09',
  docker_run_as_host_user: false,
  docker_mount_cwd_to_workspace: false,
  docker_network: false,
  container_cpu: 0.75,
  container_memory: 2560,
  container_disk: 12288,
  timeout: 300,
  lifetime_seconds: 900,
  docker_forward_env: ['MCP_JOB_TOKEN'],
});

export const CONTROL_SLICE_BUDGET = Object.freeze({
  'dial-survival.slice': { MemoryMin: '384M', MemoryLow: '384M', CPUWeight: 10000 },
  'dial-hermes.slice': {
    MemoryMin: '2G',
    MemoryLow: '3.5G',
    MemoryHigh: '5G',
    MemoryMax: '6G',
    CPUWeight: 800,
    CPUQuota: '200%',
    steadyCpuQuota: '125%',
  },
  'dial-dev.slice': { MemoryHigh: '3G', MemoryMax: '3.5G', CPUWeight: 400, CPUQuota: '150%' },
  'dial-commander.slice': {
    MemoryLow: '256M',
    MemoryHigh: '512M',
    MemoryMax: '768M',
    CPUWeight: 200,
    CPUQuota: '50%',
  },
});
