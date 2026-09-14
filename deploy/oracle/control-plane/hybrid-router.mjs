#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = JSON.parse(fs.readFileSync(path.join(here, 'CONTROL_PLANE_REGISTRY.json'), 'utf8'));

export const TRANSPORT_ORDER = Object.freeze(['LOCAL', 'DIRECT_SSH', 'RELAY_SSH', 'OCI_RUN_COMMAND']);

export function hostPolicy(hostId, registry = REGISTRY) {
  return registry.hosts?.[hostId] ?? null;
}

export function allowedOnHost(hostId, workloadClass, registry = REGISTRY) {
  const host = hostPolicy(hostId, registry);
  if (!host) return false;
  return host.allowed_workloads.includes(String(workloadClass ?? '').toUpperCase());
}

export function chooseHost(workloadClass, { preferredHost = null, registry = REGISTRY } = {}) {
  const klass = String(workloadClass ?? '').toUpperCase();
  const candidates = registry.routing?.[klass] ?? [];
  if (preferredHost && candidates.includes(preferredHost) && allowedOnHost(preferredHost, klass, registry)) return preferredHost;
  return candidates.find((h) => allowedOnHost(h, klass, registry)) ?? null;
}

export function chooseTransport(hostId, { localHost = null, health = {} } = {}) {
  const host = hostPolicy(hostId);
  if (!host) return null;
  if (hostId === localHost) return 'LOCAL';
  if (host.transports.direct_ssh && health.direct_ssh !== false) return 'DIRECT_SSH';
  if (host.transports.relay_ssh && health.relay_ssh !== false) return 'RELAY_SSH';
  if (host.transports.oci_recovery && health.oci_recovery !== false) return 'OCI_RUN_COMMAND';
  return null;
}

export function route(request, options = {}) {
  const workloadClass = String(request?.workload_class ?? '').toUpperCase();
  if (!workloadClass) return { decision: 'REFUSE', reason: 'WORKLOAD_CLASS_REQUIRED' };
  const target = chooseHost(workloadClass, { preferredHost: request?.target_host ?? null });
  if (!target) return { decision: 'REFUSE', reason: 'NO_ELIGIBLE_HOST', workload_class: workloadClass };
  if (!allowedOnHost(target, workloadClass)) return { decision: 'REFUSE', reason: 'HOST_ROLE_MISMATCH', target_host: target };
  const transport = chooseTransport(target, options);
  if (!transport) return { decision: 'REFUSE', reason: 'NO_HEALTHY_TRANSPORT', target_host: target };
  return { decision: 'ALLOW', workload_class: workloadClass, target_host: target, transport };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.argv[2] || fs.readFileSync(0, 'utf8');
  const request = JSON.parse(raw);
  const result = route(request, { localHost: process.env.DIAL_LOCAL_HOST || null });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.decision === 'ALLOW' ? 0 : 3);
}
