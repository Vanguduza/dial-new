#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(root, p));
let fail = [];

const features = load('agent-system/registries/FEATURE_REGISTRY.json');
const facets = load('docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json');
const realization = load('docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json');
const frcs = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json');
const ev = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/EXECUTABLE_EVENTUALITY_CONTRACT_REGISTRY.json');
const donors = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/DONOR_QUALIFICATION_STATUS.json');
const nfr = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/04_NFR/NFR_BUDGET_REGISTRY.json');
const envs = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/05_DEPLOYMENT/ENVIRONMENT_REGISTRY.json');
const blockers = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/ACTIVATION_BLOCKER_REGISTRY.json');
const ops = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/07_OPERATING_MODEL/OPERATIONAL_RESPONSIBILITY_REGISTRY.json');
const md = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/08_MASTER_DATA/MASTER_DATA_REGISTRY.json');
const branches = load('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/10_ACTIVATION_CONFIG/BRANCH_ACTIVATION_REGISTRY.json');
const capabilities = load('docs/dial/final-audit/11_FEATURE_REALIZATION/SUPPORTING_CAPABILITY_REGISTRY.json');
const baseline = load('agent-system/registries/REGISTRY_BASELINE.json');
const idsOf = (rows, key) => new Set(rows.map((r) => r[key]));
const featureIds = idsOf(features, 'feature_id');

if (featureIds.size !== features.length) fail.push('FEATURE_REGISTRY contains duplicate feature_ids');
if (features.length < baseline.min_features) fail.push(`features=${features.length} below recorded floor ${baseline.min_features}`);
for (const [name, rows] of [['FRC', frcs], ['REALIZATION', realization]]) {
  const ids = idsOf(rows, 'feature_id');
  const missing = [...featureIds].filter((id) => !ids.has(id));
  const extra = [...ids].filter((id) => !featureIds.has(id));
  if (ids.size !== rows.length) fail.push(`${name} contains duplicate feature ids`);
  if (missing.length) fail.push(`${name} missing ${missing.length} registered feature(s)`);
  if (extra.length) fail.push(`${name} has ${extra.length} orphan feature(s)`);
}
const facetsByParent = new Map();
for (const f of facets) facetsByParent.set(f.parent_feature_id, (facetsByParent.get(f.parent_feature_id) ?? 0) + 1);
const wrongFacets = [...featureIds].filter((id) => (facetsByParent.get(id) ?? 0) !== baseline.facets_per_feature);
if (wrongFacets.length) fail.push(`${wrongFacets.length} features do not have exactly ${baseline.facets_per_feature} facets`);
const forbidden = /feature-specific typed commands|domain state change event|all eight realization facets/i;
for (const f of frcs) {
  if (!f.aggregate) fail.push(`${f.feature_id}: aggregate missing`);
  if (!Array.isArray(f.states) || f.states.length < 3) fail.push(`${f.feature_id}: concrete states missing`);
  if (!Array.isArray(f.commands) || f.commands.length < 3) fail.push(`${f.feature_id}: concrete commands missing`);
  if (!Array.isArray(f.queries) || f.queries.length < 3) fail.push(`${f.feature_id}: queries missing`);
  if (!Array.isArray(f.events) || f.events.length < 3) fail.push(`${f.feature_id}: events missing`);
  if (forbidden.test(JSON.stringify(f))) fail.push(`${f.feature_id}: placeholder remains`);
}
for (const r of realization) if (forbidden.test(JSON.stringify(r))) fail.push(`${r.feature_id}: realization placeholder remains`);
if (ev.length < 250) fail.push(`eventuality contracts unexpectedly thin: ${ev.length}`);
for (const e of ev.filter((x) => x.materiality === 'MATERIAL')) for (const k of ['owner_queue','commands','procedure_steps','terminal_states','closure_evidence']) {
  if (!e[k] || (Array.isArray(e[k]) && e[k].length === 0)) fail.push(`${e.eventuality_id}: ${k} missing`);
}
if (donors.length < 40) fail.push(`donor qualification unexpectedly thin: ${donors.length}`);
if (nfr.length < 15) fail.push(`NFR systems unexpectedly thin: ${nfr.length}`);
if (envs.length < 6) fail.push(`environment model unexpectedly thin: ${envs.length}`);
if (blockers.length < 8) fail.push(`activation blockers unexpectedly thin: ${blockers.length}`);
if (ops.length < 10) fail.push(`operations responsibility unexpectedly thin: ${ops.length}`);
if (md.length < 10) fail.push(`master data registry unexpectedly thin: ${md.length}`);
if (branches.length < 10) fail.push(`branch activation registry unexpectedly thin: ${branches.length}`);

const gateOrder = ['SPECIFIED','DESIGN_CLOSED','BUILDABLE','CODE_PRESENT','DOMAIN_TESTED','INTEGRATION_GREEN','STAGING_GREEN','CERTIFIED_DORMANT','ACTIVATION_BLOCKERS_GREEN','ACTIVE'];
for (const c of capabilities) {
  const open = Array.isArray(c.blockers) ? c.blockers : [];
  if (!open.length) continue;
  for (const b of open) for (const k of ['blocker_id','source_clause','statement','clears_when']) if (!b?.[k]) fail.push(`${c.capability_id}: blocker missing ${k}`);
  const gate = gateOrder.indexOf(c.current_gate);
  if (gate >= gateOrder.indexOf('DOMAIN_TESTED')) fail.push(`${c.capability_id}: claims ${c.current_gate} with open blockers`);
}

for (const p of [
  'docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md',
  'docs/dial/canon/CANON_INDEX.json',
  'docs/dial/status/BUILD_READINESS_SCORECARD.json',
  'CLAUDE.md',
  'agent-system/canon/PROJECT_TRUTH.md',
  'docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/02_TRANSITION_EPC_LOCK/TRANSITION_EPC_INTEGRATION_LOCK.md',
  'docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md',
  'docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md',
]) if (!exists(p)) fail.push(`missing ${p}`);

if (fail.length) {
  console.error('DIAL closure: RED');
  console.error(fail.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({
  status: 'CANON_RECONCILED_REPOSITORY_STRUCTURALLY_CLOSED',
  canonical_source: 'docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md',
  features: features.length,
  facets: facets.length,
  frcs: frcs.length,
  material_eventualities: ev.filter((x) => x.materiality === 'MATERIAL').length,
  donors: donors.length,
  nfr_systems: nfr.length,
  environments: envs.length,
  activation_blockers: blockers.length,
}, null, 2));
