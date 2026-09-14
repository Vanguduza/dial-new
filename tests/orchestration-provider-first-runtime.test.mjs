import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROVIDER_OUTCOMES,
  ROUTER_ACTIONS,
} from '../agent-system/orchestration/execution-fabric/constants.mjs';
import {
  generateVenueSigningKeyPair,
  serializePrivateKey,
  serializePublicKey,
} from '../agent-system/orchestration/execution-fabric/venue-decision.mjs';
import { executeProviderFirstHermesInstruction } from '../agent-system/orchestration/provider-first-hermes-executor.mjs';

function fixture(role = 'CONTROL_AUTHORITY') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-provider-first-runtime-'));
  fs.mkdirSync(path.join(root, 'secrets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'state'), { recursive: true });
  fs.mkdirSync(path.join(root, 'execution'), { recursive: true });
  const registryPath = path.join(root, 'provider-registry.json');
  const rolePath = path.join(root, 'host-role');
  fs.writeFileSync(registryPath, JSON.stringify({
    schema: 'dial.provider_registry/v1',
    attempt_budget_defaults: {
      max_provider_attempts: 3,
      max_attempt_wall_clock: 300,
      max_total_wall_clock: 900,
    },
    providers: [
      { provider_id: 'codex.cloud', eligible: true, envelope_status: 'UNVERIFIED', envelope: {} },
      { provider_id: 'claude.remote', eligible: true, envelope_status: 'UNVERIFIED', envelope: {} },
    ],
  }, null, 2));
  const hostname = role === 'RECOVERY_CONTROL_ONLY' ? 'oracle-admin' : 'dial-hermes-control';
  fs.writeFileSync(rolePath, `ROLE=${role}\nHOSTNAME=${hostname}\n`);
  const keys = generateVenueSigningKeyPair();
  fs.writeFileSync(path.join(root, 'secrets/venue-ed25519.pem'), serializePrivateKey(keys.privateKey), { mode: 0o600 });
  fs.writeFileSync(path.join(root, 'secrets/venue-ed25519.pub'), serializePublicKey(keys.publicKey), { mode: 0o600 });
  fs.writeFileSync(path.join(root, 'state/venue-guard.json'), JSON.stringify({
    state: 'ACTIVE',
    observed_at: new Date().toISOString(),
    max_age_ms: 60_000,
  }));
  return { root, registryPath, rolePath };
}

async function withFixture(fx, run) {
  const before = {
    registry: process.env.DIAL_PROVIDER_REGISTRY,
    role: process.env.DIAL_HOST_ROLE_FILE,
  };
  process.env.DIAL_PROVIDER_REGISTRY = fx.registryPath;
  process.env.DIAL_HOST_ROLE_FILE = fx.rolePath;
  try {
    return await run();
  } finally {
    if (before.registry == null) delete process.env.DIAL_PROVIDER_REGISTRY;
    else process.env.DIAL_PROVIDER_REGISTRY = before.registry;
    if (before.role == null) delete process.env.DIAL_HOST_ROLE_FILE;
    else process.env.DIAL_HOST_ROLE_FILE = before.role;
    fs.rmSync(fx.root, { recursive: true, force: true });
  }
}

describe('mandatory provider-first Hermes runtime boundary', () => {
  it('admits ordinary work before invoking Hermes and audits the provider attempt', async () => {
    const fx = fixture();
    await withFixture(fx, async () => {
      let calls = 0;
      const result = await executeProviderFirstHermesInstruction({
        root: fx.root,
        packetId: 'runtime-gate-1',
        instruction: 'test only',
        requestedBy: 'codex:owner',
        hermesExecutor: async () => {
          calls += 1;
          return {
            event: 'HERMES_OPERATIONAL_TURN_COMPLETED',
            runtime: 'codex_app_server',
            resolved_model: 'gpt-5.6-sol',
            fallback_used: false,
            primary: { ok: true, state: 'HEALTHY' },
          };
        },
      });
      expect(calls).toBe(1);
      expect(result.fabric_route.action).toBe(ROUTER_ACTIONS.DISPATCH_PROVIDER);
      expect(result.fabric_route.venue).toBe('provider/codex.cloud');
      expect(result.fabric_provider_attempts[0].outcome).toBe(PROVIDER_OUTCOMES.SUCCESS);
      expect(fs.readFileSync(path.join(fx.root, 'execution/fabric-audit.jsonl'), 'utf8'))
        .toContain('runtime-gate-1');
    });
  });

  it('fails closed before invoking Hermes when the fabric is unavailable', async () => {
    const fx = fixture();
    await withFixture(fx, async () => {
      fs.rmSync(fx.registryPath);
      let called = false;
      const result = await executeProviderFirstHermesInstruction({
        root: fx.root,
        packetId: 'runtime-gate-missing',
        instruction: 'test only',
        hermesExecutor: async () => { called = true; return {}; },
      });
      expect(called).toBe(false);
      expect(result.failure_state).toBe('EXECUTION_FABRIC_REJECTED');
      expect(result.reason).toMatch(/FABRIC_PREFLIGHT_ERROR/);
    });
  });

  it('never allows oracle-admin recovery authority to execute project work', async () => {
    const fx = fixture('RECOVERY_CONTROL_ONLY');
    await withFixture(fx, async () => {
      let called = false;
      const result = await executeProviderFirstHermesInstruction({
        root: fx.root,
        packetId: 'runtime-gate-admin',
        instruction: 'test only',
        hermesExecutor: async () => { called = true; return {}; },
      });
      expect(called).toBe(false);
      expect(result.failure_state).toBe('EXECUTION_FABRIC_REJECTED');
      expect(result.reason).toMatch(/ORACLE_ADMIN_REJECTS_PROJECT_AND_FALLBACK/);
    });
  });
});
