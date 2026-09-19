import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BOOTSTRAP_DIR } from './manifest.mjs';

// Topology authority adapter. deploy/oracle/resource-fabric/hosts.json is the ONLY source of host identity,
// class and permitted workload classes. This module reads it, never rewrites it, and compares live host
// facts against it so the bootstrap reports drift instead of trusting static metadata (closure item 6).
export const REPO_DIR = path.resolve(BOOTSTRAP_DIR, '../..');
export const HOSTS_PATH = process.env.DIAL_FABRIC_HOSTS_FILE || path.join(REPO_DIR, 'deploy/oracle/resource-fabric/hosts.json');
export const HOSTS_REL = 'deploy/oracle/resource-fabric/hosts.json';

let cached = null;
export function loadHosts(file = HOSTS_PATH) {
  if (file === HOSTS_PATH && cached) return cached;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.hosts)) throw new Error(`${file}: hosts[] required`);
  for (const h of parsed.hosts) {
    for (const k of ['host_id', 'host_class', 'architecture', 'cpu_total', 'memory_total_mb', 'private_ip', 'allowed_workload_classes']) {
      if (h[k] === undefined) throw new Error(`${file}: host ${h.host_id || '?'} lacks ${k}`);
    }
  }
  if (file === HOSTS_PATH) cached = parsed;
  return parsed;
}

export function hostEntry(hostId, hosts = loadHosts()) { return (hosts.hosts || []).find((h) => h.host_id === hostId) || null; }
export function hostForClass(hostClass, hosts = loadHosts()) {
  const matches = (hosts.hosts || []).filter((h) => h.host_class === hostClass);
  return matches.length === 1 ? matches[0] : null;
}

export function normalizeArch(arch) {
  const a = String(arch || '').toLowerCase();
  if (a === 'x64' || a === 'x86_64' || a === 'amd64') return 'x86_64';
  if (a === 'arm64' || a === 'aarch64') return 'arm64';
  return a || null;
}

export function liveHostFacts({ hostname = os.hostname(), interfaces = os.networkInterfaces(), cpus = os.cpus().length, memoryBytes = os.totalmem(), arch = os.arch() } = {}) {
  const ipv4 = [];
  for (const [name, list] of Object.entries(interfaces || {})) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ipv4.push({ interface: name, address: i.address });
  return { hostname, architecture: normalizeArch(arch), cpu_total: cpus, memory_total_mb: Math.round(memoryBytes / 1048576), private_ipv4: ipv4.map((x) => x.address), interfaces: ipv4 };
}

// Memory reported by the OS is below the nominal shape size (kernel reservations), so a tolerance applies.
// CPU, architecture and address are exact.
export function compareHostInventory({ entry, facts, memoryTolerance = 0.12 } = {}) {
  if (!entry) return { ok: false, known_host: false, drift: [{ field: 'host_id', declared: null, observed: facts?.hostname ?? null, severity: 'MANDATORY', reason: 'host is not declared in hosts.json' }] };
  const drift = [];
  if (normalizeArch(entry.architecture) !== facts.architecture) drift.push({ field: 'architecture', declared: normalizeArch(entry.architecture), observed: facts.architecture, severity: 'MANDATORY' });
  if (Number(entry.cpu_total) !== Number(facts.cpu_total)) drift.push({ field: 'cpu_total', declared: Number(entry.cpu_total), observed: Number(facts.cpu_total), severity: 'REQUIRED' });
  const declaredMem = Number(entry.memory_total_mb);
  const lower = Math.floor(declaredMem * (1 - memoryTolerance));
  if (!(facts.memory_total_mb >= lower && facts.memory_total_mb <= declaredMem * (1 + memoryTolerance))) drift.push({ field: 'memory_total_mb', declared: declaredMem, observed: facts.memory_total_mb, tolerance: memoryTolerance, severity: 'REQUIRED' });
  if (entry.private_ip && !(facts.private_ipv4 || []).includes(entry.private_ip)) drift.push({ field: 'private_ip', declared: entry.private_ip, observed: facts.private_ipv4 || [], severity: 'REQUIRED' });
  if (entry.host_id !== facts.hostname) drift.push({ field: 'hostname', declared: entry.host_id, observed: facts.hostname, severity: 'REQUIRED' });
  return { ok: drift.length === 0, known_host: true, host_id: entry.host_id, host_class: entry.host_class, immutable_role: entry.immutable_role === true, drift };
}

// The topology authority must agree with the canonical qualifier and the fabric document. Where they
// disagree the bootstrap reports it as a repository defect rather than silently choosing one.
export function authorityConsistency({ repoDir = REPO_DIR, hosts = loadHosts() } = {}) {
  const problems = [];
  const control = hostForClass('CONTROL_AUTHORITY', hosts);
  const qualifier = path.join(repoDir, 'deploy/oracle/execution-fabric/qualify-execution-fabric.sh');
  if (fs.existsSync(qualifier) && control) {
    const m = fs.readFileSync(qualifier, 'utf8').match(/nproc\)"\s+-eq\s+(\d+)/);
    if (m && Number(m[1]) !== Number(control.cpu_total)) problems.push({ source: 'deploy/oracle/execution-fabric/qualify-execution-fabric.sh', field: 'cpu_total', declared: Number(m[1]), topology: Number(control.cpu_total) });
  }
  const doc = path.join(repoDir, 'docs/infrastructure/DIAL_PROVIDER_FIRST_EXECUTION_FABRIC_REV2.md');
  if (fs.existsSync(doc) && control) {
    const text = fs.readFileSync(doc, 'utf8');
    const m = text.match(/\*\*(\d+)\s+OCPU\s*\/\s*(\d+)\s*GB RAM\*\*/);
    if (m) {
      // Canon and inventory use host-visible logical CPUs, matching nproc/os.cpus on A1 and E2.
      const docCpu = Number(m[1]);
      const docMemMb = Number(m[2]) * 1024;
      if (docCpu !== Number(control.cpu_total)) problems.push({ source: 'docs/infrastructure/DIAL_PROVIDER_FIRST_EXECUTION_FABRIC_REV2.md', field: 'cpu_total', declared: docCpu, topology: control.cpu_total });
      if (docMemMb !== Number(control.memory_total_mb)) problems.push({ source: 'docs/infrastructure/DIAL_PROVIDER_FIRST_EXECUTION_FABRIC_REV2.md', field: 'memory_total_mb', declared: docMemMb, topology: Number(control.memory_total_mb) });
    }
  }
  return { ok: problems.length === 0, problems, topology_authority: HOSTS_REL, policy_id: hosts.policy_id || null };
}
