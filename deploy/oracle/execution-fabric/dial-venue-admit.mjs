#!/usr/bin/env node
import fs from 'node:fs';
import { loadProviderRegistry } from '../../../agent-system/orchestration/execution-fabric/provider-registry.mjs';
import { loadHostRole } from '../../../agent-system/orchestration/execution-fabric/host-role.mjs';
import { admitAndSign, recordFabricAudit } from '../../../agent-system/orchestration/execution-fabric/dispatch.mjs';
import { loadPrivateKey, loadPublicKey } from '../../../agent-system/orchestration/execution-fabric/venue-decision.mjs';

const root = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const unit = JSON.parse(fs.readFileSync(process.argv[2] === '-' ? '/dev/stdin' : process.argv[2], 'utf8'));
const registry = loadProviderRegistry(process.env.DIAL_PROVIDER_REGISTRY);
const hostRole = loadHostRole(process.env.DIAL_HOST_ROLE_FILE);
const privateKey = loadPrivateKey(fs.readFileSync(`${root}/secrets/venue-ed25519.pem`, 'utf8'));
const publicKey = loadPublicKey(fs.readFileSync(`${root}/secrets/venue-ed25519.pub`, 'utf8'));
const result = admitAndSign({
  unit,
  registry,
  hostRole,
  attempts: unit.provider_attempts || [],
  privateKey,
  publicKey,
  heartbeatPath: `${root}/state/venue-guard.json`,
});
recordFabricAudit({
  auditPath: `${root}/execution/fabric-audit.jsonl`,
  unit,
  route: result.route,
  decision: result.decision,
  result: result.admission.ok ? 'ADMITTED' : 'REJECTED',
});
console.log(JSON.stringify(result, null, 2));
process.exit(result.admission.ok ? 0 : 2);
