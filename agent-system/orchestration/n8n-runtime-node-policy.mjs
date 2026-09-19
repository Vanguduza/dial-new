#!/usr/bin/env node
// Runtime node policy, compiled FROM the VEKL n8n corpus (Rev 3.1 §7.6).
//
// The corpus and the runtime are distinct planes with one direction of flow:
//
//     VEKL node capability knowledge
//             ↓  (this compiler)
//     DEV node policy / PROD node policy
//
// There is no second allowlist. Every node class the runtime knows about comes
// from n8n-node-capability-map.json, and the estate may only subtract from what
// the corpus permits — `runtime_may_be_looser_than_corpus: false` is checked
// here rather than merely declared, because a projection that can add
// capability is not a projection.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');
export const RUNTIME_POLICY_REL = 'agent-system/registries/N8N_RUNTIME_POLICY.json';
const CAPABILITY_MAP_REL = 'agent-system/engineering-knowledge/automation/n8n-node-capability-map.json';
const SECURITY_RULES_REL = 'agent-system/engineering-knowledge/automation/n8n-security-rules.json';

export function loadRuntimePolicy(repoDir = DEFAULT_REPO) {
  const policy = loadRegistry(repoDir, RUNTIME_POLICY_REL, null);
  if (!policy) throw new Error(`n8n runtime policy missing: ${RUNTIME_POLICY_REL}`);
  return policy;
}

export function loadCorpusKnowledge(repoDir = DEFAULT_REPO) {
  const capabilities = loadRegistry(repoDir, CAPABILITY_MAP_REL, null);
  const security = loadRegistry(repoDir, SECURITY_RULES_REL, null);
  if (!capabilities || !security) throw new Error('VEKL n8n corpus knowledge missing; runtime policy cannot be projected');
  return { capabilities, security };
}

// A node type is resolved to capabilities the same way the corpus resolves it:
// lowercase substring match against the rule table, official prefixes noted.
export function classifyNodeType({ nodeType, capabilities }) {
  const normalized = String(nodeType || '').toLowerCase();
  const official = (capabilities.official_prefixes || []).some((p) => String(nodeType || '').startsWith(p));
  const matched = (capabilities.rules || []).filter((rule) => normalized.includes(String(rule.match).toLowerCase()));
  const caps = [...new Set(matched.flatMap((r) => r.capabilities || []))].sort();
  const controls = [...new Set(matched.flatMap((r) => r.controls || []))].sort();
  const risks = matched.map((r) => r.risk).filter(Boolean);
  const order = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const risk = risks.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] || (caps.length ? 'LOW' : 'UNKNOWN');
  return { node_type: nodeType, official, capabilities: caps, controls, risk_class: risk, known_to_corpus: matched.length > 0 };
}

export function compileRuntimeNodePolicy({ repoDir = DEFAULT_REPO, estate, policy = null, corpus = null } = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const { capabilities, security } = corpus || loadCorpusKnowledge(repoDir);
  const estateRow = p.estates?.[estate];
  if (!estateRow) throw new Error(`unknown n8n estate: ${estate}`);

  const corpusCapabilities = [...new Set((capabilities.rules || []).flatMap((r) => r.capabilities || []))].sort();
  const denied = new Set(estateRow.denied_capabilities || []);
  const approval = new Set(estateRow.approval_required_capabilities || []);

  // The projection must not invent capability. Anything the estate names must
  // exist in the corpus, or the compile fails rather than silently widening.
  const invented = [...denied, ...approval].filter((c) => !corpusCapabilities.includes(c));
  if (invented.length) {
    throw new Error(`estate ${estate} references capabilities absent from the VEKL corpus: ${invented.sort().join(', ')}`);
  }

  const rows = corpusCapabilities.map((capability) => ({
    capability,
    capability_class: p.capability_class_by_capability?.[capability] || 'INTEGRATION',
    high_risk: (p.high_risk_capabilities || []).includes(capability),
    allowed: !denied.has(capability),
    approval_required: approval.has(capability),
    outbound_network_class: capability.startsWith('HTTP') ? estateRow.outbound_network_default : 'NONE',
  })).sort((a, b) => a.capability.localeCompare(b.capability));

  const base = {
    schema_version: 1,
    estate_id: estateRow.estate_id,
    environment: estateRow.environment,
    projected_from: {
      capability_map_hash: hashObject(capabilities),
      security_rules_hash: hashObject(security),
      runtime_policy_version: p.policy_version,
    },
    capabilities: rows,
    denied_capabilities: [...denied].sort(),
    approval_required_capabilities: [...approval].sort(),
    outbound_network_default: estateRow.outbound_network_default,
    prod_credentials_permitted: estateRow.prod_credentials_permitted === true,
    authority: 'DERIVED_RUNTIME_NODE_POLICY',
  };
  return { ...base, node_policy_hash: hashObject(base) };
}

// Production may be stricter than the corpus and stricter than DEV; it may never
// be looser than either. This is the check that makes §7.6 enforceable.
export function assertProductionNotLooserThanDev({ devPolicy, prodPolicy }) {
  const failures = [];
  const devAllowed = new Map(devPolicy.capabilities.map((c) => [c.capability, c]));
  for (const row of prodPolicy.capabilities) {
    const dev = devAllowed.get(row.capability);
    if (!dev) { failures.push(`PROD_CAPABILITY_ABSENT_IN_DEV:${row.capability}`); continue; }
    if (row.allowed && !dev.allowed) failures.push(`PROD_LOOSER_THAN_DEV:${row.capability}`);
    if (!row.approval_required && dev.approval_required && row.allowed) failures.push(`PROD_DROPS_APPROVAL:${row.capability}`);
  }
  if (prodPolicy.outbound_network_default === 'ALLOWLIST' && devPolicy.outbound_network_default === 'DENY') {
    failures.push('PROD_NETWORK_LOOSER_THAN_DEV');
  }
  return { ok: failures.length === 0, failures: failures.sort() };
}

export function evaluateWorkflowNodes({ repoDir = DEFAULT_REPO, estate, nodes = [], policy = null, corpus = null } = {}) {
  const p = policy || loadRuntimePolicy(repoDir);
  const c = corpus || loadCorpusKnowledge(repoDir);
  const compiled = compileRuntimeNodePolicy({ repoDir, estate, policy: p, corpus: c });
  const byCapability = new Map(compiled.capabilities.map((row) => [row.capability, row]));
  const findings = [];
  const classified = [];
  for (const node of nodes) {
    const info = classifyNodeType({ nodeType: node.type, capabilities: c.capabilities });
    classified.push(info);
    if (!info.official) findings.push({ node: node.name ?? node.type, reason: 'UNOFFICIAL_NODE_PACKAGE', severity: 'HIGH' });
    // A node the corpus has no knowledge of is not thereby safe. Unknown means
    // unqualified, and unqualified is refused in both estates.
    if (!info.known_to_corpus) findings.push({ node: node.name ?? node.type, reason: 'NODE_UNKNOWN_TO_CORPUS', severity: 'HIGH' });
    for (const capability of info.capabilities) {
      const row = byCapability.get(capability);
      if (!row) { findings.push({ node: node.name ?? node.type, reason: `CAPABILITY_NOT_PROJECTED:${capability}`, severity: 'HIGH' }); continue; }
      if (!row.allowed) findings.push({ node: node.name ?? node.type, reason: `CAPABILITY_DENIED_IN_${estate}:${capability}`, severity: 'CRITICAL' });
      else if (row.approval_required) findings.push({ node: node.name ?? node.type, reason: `CAPABILITY_REQUIRES_APPROVAL:${capability}`, severity: 'MEDIUM' });
    }
  }
  const blocking = findings.filter((f) => ['HIGH', 'CRITICAL'].includes(f.severity));
  return {
    ok: blocking.length === 0,
    estate,
    node_policy_hash: compiled.node_policy_hash,
    classified,
    findings: findings.sort((a, b) => String(a.node).localeCompare(String(b.node)) || a.reason.localeCompare(b.reason)),
    blocking_findings: blocking,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const estate = process.argv[2] || 'DEV';
  console.log(JSON.stringify(compileRuntimeNodePolicy({ estate }), null, 2));
}
