import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HOST_ROLES,
  PROVIDER_OUTCOMES,
  ROUTER_ACTIONS,
  VENUE_BASES,
} from '../agent-system/orchestration/execution-fabric/constants.mjs';
import { loadProviderRegistry } from '../agent-system/orchestration/execution-fabric/provider-registry.mjs';
import { envelopeCheck } from '../agent-system/orchestration/execution-fabric/envelope-check.mjs';
import { classifyProviderFailure } from '../agent-system/orchestration/execution-fabric/failure-class.mjs';
import { routeWorkUnit } from '../agent-system/orchestration/execution-fabric/venue-router.mjs';
import {
  generateVenueSigningKeyPair,
  signVenueDecision,
  serializePublicKey,
} from '../agent-system/orchestration/execution-fabric/venue-decision.mjs';
import { admitVenueDecision } from '../agent-system/orchestration/execution-fabric/venue-guard.mjs';
import { assertSandboxArgs, buildSandboxSpec, dockerRunArgv, forwardedEnvNames } from '../agent-system/orchestration/execution-fabric/sandbox-policy.mjs';
import { classifyPressure } from '../agent-system/orchestration/execution-fabric/pressure-policy.mjs';
import { loadProjectBinding, opaqueProjectFields } from '../agent-system/orchestration/execution-fabric/project-binding.mjs';
import { parseHostRoleText } from '../agent-system/orchestration/execution-fabric/host-role.mjs';

const keys = generateVenueSigningKeyPair();
const controlRole = { role: HOST_ROLES.CONTROL_AUTHORITY, hostname: 'dial-hermes-control' };
const workerRole = { role: HOST_ROLES.BACKGROUND_COORDINATOR, hostname: 'vekl-worker' };
const adminRole = { role: HOST_ROLES.RECOVERY_CONTROL_ONLY, hostname: 'oracle-admin' };

function registry(overrides = {}) {
  return loadProviderRegistry({
    schema: 'dial.provider_registry/v1',
    attempt_budget_defaults: { max_provider_attempts: 3, max_attempt_wall_clock: 300, max_total_wall_clock: 900 },
    providers: [
      {
        provider_id: 'codex.cloud',
        subscription_identity: 'chatgpt-subscription',
        execution_surface: 'codex_cloud_container',
        envelope_status: 'VERIFIED',
        envelope: { cpu: 2, memory_mb: 8192, disk_mb: 20480, wall_clock_s: 600 },
        eligible: true,
      },
      {
        provider_id: 'claude.remote',
        subscription_identity: 'claude-subscription',
        execution_surface: 'claude_remote_container',
        envelope_status: 'VERIFIED',
        envelope: { cpu: 2, memory_mb: 8192, disk_mb: 20480, wall_clock_s: 600 },
        eligible: true,
      },
      {
        provider_id: 'antigravity.cloud',
        subscription_identity: 'google-antigravity',
        execution_surface: 'antigravity_cloud',
        envelope_status: 'UNVERIFIED',
        envelope: { cpu: 4, memory_mb: 16384, disk_mb: 40960, wall_clock_s: 1200 },
        eligible: true,
      },
    ],
    ...overrides,
  });
}

function unit(facts = {}, extra = {}) {
  return { unit_id: 'u1', requested_by: 'owner.primary', work_class: 'PROJECT', control_plane_facts: facts, ...extra };
}

function pulse(dir) {
  const file = path.join(dir, 'venue-guard.json');
  fs.writeFileSync(file, JSON.stringify({ state: 'ACTIVE', observed_at: new Date().toISOString(), max_age_ms: 60_000 }));
  return file;
}

describe('DIAL Provider-First Execution Fabric Rev2', () => {
  it('A-shaped ordinary unit attempts a provider and does not pre-select Oracle', () => {
    const route = routeWorkUnit({ unit: unit(), registry: registry(), hostRole: controlRole });
    expect(route.action).toBe(ROUTER_ACTIONS.DISPATCH_PROVIDER);
    expect(route.attempt_first).toBe(true);
    expect(String(route.venue).startsWith('provider/')).toBe(true);
    expect(route.venue_basis).toBeNull();
    expect(route.model_selection).toBe('UNCHANGED');
  });

  it('B provider unavailable never becomes Oracle', () => {
    const route = routeWorkUnit({
      unit: unit({ attempt_budget: { max_provider_attempts: 6 } }),
      registry: registry(),
      hostRole: controlRole,
      attempts: [
        { provider_id: 'codex.cloud', outcome: PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: 'rate limit 429' },
        { provider_id: 'claude.remote', outcome: PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: 'oauth expired' },
        { provider_id: 'antigravity.cloud', outcome: PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: 'queue stall' },
      ],
    });
    expect(route.forbid_oracle).toBe(true);
    expect(route.action).toBe(ROUTER_ACTIONS.QUEUE);
    expect(route.venue).toBeNull();
  });

  it('C infrastructure inadequacy records the provider reason and selects Oracle sandbox', () => {
    const route = routeWorkUnit({
      unit: unit(),
      registry: registry(),
      hostRole: controlRole,
      attempts: [{
        provider_id: 'codex.cloud',
        outcome: PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE,
        observed_reason: 'workspace clone exceeded container disk',
        wall_clock_s: 214,
      }],
    });
    expect(route.action).toBe(ROUTER_ACTIONS.ORACLE_SANDBOX);
    expect(route.venue_basis).toBe(VENUE_BASES.PROVIDER_ATTEMPTED_INADEQUATE);
    expect(route.evidence.observed_reason).toBe('workspace clone exceeded container disk');
  });

  it('C2 known requirement exceeding every verified envelope routes to Oracle with no attempt', () => {
    const route = routeWorkUnit({
      unit: unit({ requirement: { memory_mb: 65536 } }),
      registry: loadProviderRegistry({
        schema: 'dial.provider_registry/v1',
        providers: [{
          provider_id: 'codex.cloud',
          envelope_status: 'VERIFIED',
          envelope: { memory_mb: 8192, cpu: 2, disk_mb: 20480, wall_clock_s: 600 },
          eligible: true,
        }],
      }),
      hostRole: controlRole,
    });
    expect(route.attempt_first).toBe(false);
    expect(route.venue_basis).toBe(VENUE_BASES.PROVIDER_ENVELOPE_EXCEEDED);
    expect(route.evidence.requirement.memory_mb).toBe(65536);
    expect(route.evidence.envelopes_compared[0].envelope.memory_mb).toBe(8192);
    expect(route.evidence.exceeded_dimension).toBe('memory_mb');
  });

  it('C3 requirement not in hand is attempted and performs no probe', () => {
    const check = envelopeCheck({ unit: unit(), registry: registry() });
    expect(check.in_hand).toBe(false);
    expect(check.investigated).toBe(false);
    const route = routeWorkUnit({ unit: unit(), registry: registry(), hostRole: controlRole });
    expect(route.attempt_first).toBe(true);
    expect(route.venue_basis).toBeNull();
  });

  it('G3 submitter-supplied requirement is ignored; control-plane figure is used', () => {
    const u = unit(
      { requirement: { memory_mb: 1024 } },
      { submitter_requirement: { memory_mb: 999999 }, requirement: { memory_mb: 999999 } },
    );
    const check = envelopeCheck({ unit: u, registry: registry() });
    expect(check.requirement.memory_mb).toBe(1024);
    expect(check.exceeded).toBe(false);
    const route = routeWorkUnit({ unit: u, registry: registry(), hostRole: controlRole });
    expect(route.attempt_first).toBe(true);
  });

  it('D host-subject work skips providers and is privileged', () => {
    const route = routeWorkUnit({
      unit: unit({ host_subject: { hostname: 'dial-hermes-control', kind: 'systemd' } }),
      registry: registry(),
      hostRole: controlRole,
    });
    expect(route.attempt_first).toBe(false);
    expect(route.venue_basis).toBe(VENUE_BASES.HOST_SUBJECT);
    expect(route.action).toBe(ROUTER_ACTIONS.ORACLE_PRIVILEGED);
  });

  it('E oracle-admin denies project work', () => {
    const route = routeWorkUnit({ unit: unit(), registry: registry(), hostRole: adminRole });
    expect(route.action).toBe(ROUTER_ACTIONS.REJECT);
    expect(route.visible_failure).toBe('ORACLE_ADMIN_REJECTS_PROJECT_AND_FALLBACK');
  });

  it('F vekl-worker rejects heavy local compute', () => {
    const route = routeWorkUnit({
      unit: unit({ heavy_local: true }),
      registry: registry(),
      hostRole: workerRole,
    });
    expect(route.action).toBe(ROUTER_ACTIONS.REJECT);
    expect(route.visible_failure).toBe('VEKL_WORKER_REJECTS_HEAVY_LOCAL_COMPUTE');
  });

  it('G forged venue basis is rejected as signature invalid', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-g-'));
    const heartbeatPath = pulse(dir);
    const route = routeWorkUnit({
      unit: unit(),
      registry: registry(),
      hostRole: controlRole,
      attempts: [{ provider_id: 'codex.cloud', outcome: PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE, observed_reason: 'disk full' }],
    });
    const decision = signVenueDecision({ route, privateKey: keys.privateKey });
    decision.venue_basis = VENUE_BASES.PROVIDER_ATTEMPTED_INADEQUATE;
    decision.signature = 'Zm9yZ2Vk';
    const other = generateVenueSigningKeyPair();
    const admission = admitVenueDecision({
      decision,
      publicKey: serializePublicKey(other.publicKey),
      hostRole: controlRole,
      heartbeatPath,
      requireHeartbeat: true,
    });
    expect(admission.ok).toBe(false);
    expect(admission.reason).toBe('SIGNATURE_INVALID');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('G2 signed ENVELOPE_EXCEEDED whose figures do not exceed is rejected after recompute', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-g2-'));
    const heartbeatPath = pulse(dir);
    const route = routeWorkUnit({
      unit: unit({ requirement: { memory_mb: 1024 } }),
      registry: loadProviderRegistry({
        schema: 'dial.provider_registry/v1',
        providers: [{
          provider_id: 'codex.cloud',
          envelope_status: 'VERIFIED',
          envelope: { memory_mb: 8192 },
          eligible: true,
        }],
      }),
      hostRole: controlRole,
    });
    expect(route.venue_basis).toBeNull();
    const forged = signVenueDecision({
      route: {
        ...route,
        action: ROUTER_ACTIONS.ORACLE_SANDBOX,
        venue: 'dial-hermes-control/sandbox',
        venue_basis: VENUE_BASES.PROVIDER_ENVELOPE_EXCEEDED,
        evidence: {
          requirement: { memory_mb: 1024 },
          envelopes_compared: [{
            provider_id: 'codex.cloud',
            envelope_status: 'VERIFIED',
            envelope: { memory_mb: 8192 },
            fits: false,
            exceeded_dimension: 'memory_mb',
          }],
        },
      },
      privateKey: keys.privateKey,
    });
    const admission = admitVenueDecision({
      decision: forged,
      publicKey: keys.publicKey,
      hostRole: controlRole,
      heartbeatPath,
    });
    expect(admission.ok).toBe(false);
    expect(admission.reason).toBe('ENVELOPE_COMPARISON_DOES_NOT_SUPPORT_BASIS');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('H unsigned decisions from cron/systemd/shell are rejected', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-h-'));
    const heartbeatPath = pulse(dir);
    for (const source of ['cron', 'systemd', 'shell']) {
      const admission = admitVenueDecision({
        decision: null,
        publicKey: keys.publicKey,
        hostRole: controlRole,
        unit: unit({}, { arrival: source }),
        heartbeatPath,
      });
      expect(admission.ok).toBe(false);
      expect(admission.reason).toBe('UNSIGNED');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('I fails closed when the guard heartbeat is stopped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-i-'));
    const heartbeatPath = path.join(dir, 'missing.json');
    const route = routeWorkUnit({
      unit: unit({ host_subject: { hostname: 'dial-hermes-control', kind: 'systemd' } }),
      registry: registry(),
      hostRole: controlRole,
    });
    const decision = signVenueDecision({ route, privateKey: keys.privateKey });
    const admission = admitVenueDecision({
      decision,
      publicKey: keys.publicKey,
      hostRole: controlRole,
      heartbeatPath,
    });
    expect(admission.ok).toBe(false);
    expect(admission.reason).toBe('GUARD_STOPPED');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('L denies privileged, docker.sock and host-network sandbox arguments', () => {
    expect(assertSandboxArgs(['run', '--privileged', 'img']).ok).toBe(false);
    expect(assertSandboxArgs(['run', '-v', '/var/run/docker.sock:/var/run/docker.sock', 'img']).ok).toBe(false);
    expect(assertSandboxArgs(['run', '--network=host', 'img']).ok).toBe(false);
  });

  it('O sandbox forwards only the job-scoped token', () => {
    const spec = buildSandboxSpec({ taskId: 'task-1', jobToken: 'job-token-1' });
    const args = dockerRunArgv({ ...spec, task_id: 'task-1' });
    expect(forwardedEnvNames(spec)).toEqual(['MCP_JOB_TOKEN']);
    expect(args.join(' ')).toContain('MCP_JOB_TOKEN=job-token-1');
    expect(args.join(' ')).not.toContain('OPENAI_API_KEY');
    expect(args.join(' ')).toContain('--network none');
  });

  it('P exhausted attempt budget is a visible failure with no Oracle fallback', () => {
    const route = routeWorkUnit({
      unit: unit(),
      registry: registry(),
      hostRole: controlRole,
      attempts: [
        { provider_id: 'codex.cloud', outcome: PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: '429' },
        { provider_id: 'claude.remote', outcome: PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: '429' },
        { provider_id: 'antigravity.cloud', outcome: PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: '429' },
      ],
    });
    expect(route.action).toBe(ROUTER_ACTIONS.FAIL);
    expect(route.visible_failure).toBe('ATTEMPT_BUDGET_EXHAUSTED');
    expect(route.venue).toBeNull();
  });

  it('ambiguous provider failures are treated as unavailable', () => {
    expect(classifyProviderFailure('something went wrong').class).toBe(PROVIDER_OUTCOMES.UNAVAILABLE);
    expect(classifyProviderFailure('workspace clone exceeded container disk').class).toBe(PROVIDER_OUTCOMES.INFRASTRUCTURE_INADEQUATE);
    expect(classifyProviderFailure('oauth expired').class).toBe(PROVIDER_OUTCOMES.UNAVAILABLE);
  });

  it('project binding stays fabric-level and leaves project fields opaque', () => {
    const binding = loadProjectBinding({
      project_id: 'dial',
      repositories: ['Vanguduza/dial-new'],
      mcp_endpoint: 'http://127.0.0.1:9130',
      predevelopment_standard_id: 'DIAL_FABLE_FORENSIC_PREDEVELOPMENT_STANDARD',
      predevelopment_certificate_ref: 'agent-system/registries/PREDEVELOPMENT_FORENSIC_CERTIFICATE.json',
      truth_model: 'must-not-be-copied-into-fabric-policy',
    });
    expect(binding.project_id).toBe('dial');
    expect(binding.predevelopment_standard_id).toBe('DIAL_FABLE_FORENSIC_PREDEVELOPMENT_STANDARD');
    expect(binding.predevelopment_certificate_ref).toContain('PREDEVELOPMENT_FORENSIC_CERTIFICATE.json');
    expect(binding.truth_model).toBeUndefined();
    expect(opaqueProjectFields({ project_id: 'dial', truth_model: 'x' })).toContain('truth_model');
    expect(() => loadProjectBinding({ project_id: 'unprepared' })).toThrow('predevelopment_standard_id');
  });

  it('parses the control-host role file', () => {
    const parsed = parseHostRoleText('ROLE=CONTROL_AUTHORITY\nHOSTNAME=dial-hermes-control\n');
    expect(parsed.role).toBe(HOST_ROLES.CONTROL_AUTHORITY);
  });

  it('pressure policy stops local sandbox admission above the 125% steady budget', () => {
    expect(classifyPressure({ cpuQuotaPercent: 130 }).level).toBe('YELLOW');
    expect(classifyPressure({ cpuQuotaPercent: 130 }).admit_local_sandbox).toBe(false);
    expect(classifyPressure({ availableMemoryGb: 10 }).level).toBe('GREEN');
  });

  it('admits a correctly signed HOST_SUBJECT decision when the guard is alive', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabric-ok-'));
    const heartbeatPath = pulse(dir);
    const route = routeWorkUnit({
      unit: unit({ host_subject: { hostname: 'dial-hermes-control', kind: 'systemd' } }),
      registry: registry(),
      hostRole: controlRole,
    });
    const decision = signVenueDecision({ route, privateKey: keys.privateKey });
    const admission = admitVenueDecision({
      decision,
      publicKey: keys.publicKey,
      hostRole: controlRole,
      heartbeatPath,
    });
    expect(admission.ok).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
