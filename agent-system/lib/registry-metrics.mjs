import fs from 'node:fs';
import path from 'node:path';

const PACK = 'docs/dial/final-audit';
export function load(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}
export function readRegistries(root) {
  const p = (rest) => `${PACK}/${rest}`;
  return {
    features: load(root, 'agent-system/registries/FEATURE_REGISTRY.json'),
    frcs: load(root, p('20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json')),
    realization: load(root, p('11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json')),
    facets: load(root, p('11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json')),
    capabilities: load(root, p('11_FEATURE_REALIZATION/SUPPORTING_CAPABILITY_REGISTRY.json')),
    eventualities: load(root, p('20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/EXECUTABLE_EVENTUALITY_CONTRACT_REGISTRY.json')),
    donors: load(root, p('20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/DONOR_QUALIFICATION_STATUS.json')),
    nfr: load(root, p('20_IMPLEMENTATION_CLOSURE/04_NFR/NFR_BUDGET_REGISTRY.json')),
    environments: load(root, p('20_IMPLEMENTATION_CLOSURE/05_DEPLOYMENT/ENVIRONMENT_REGISTRY.json')),
    blockers: load(root, p('20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/ACTIVATION_BLOCKER_REGISTRY.json')),
    operations: load(root, p('20_IMPLEMENTATION_CLOSURE/07_OPERATING_MODEL/OPERATIONAL_RESPONSIBILITY_REGISTRY.json')),
    masterData: load(root, p('20_IMPLEMENTATION_CLOSURE/08_MASTER_DATA/MASTER_DATA_REGISTRY.json')),
    branches: load(root, p('20_IMPLEMENTATION_CLOSURE/10_ACTIVATION_CONFIG/BRANCH_ACTIVATION_REGISTRY.json')),
    security: load(root, p('17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json')),
    controls: load(root, p('17_SECURITY/SECURITY_CONTROL_REGISTRY.json')),
    endpoints: load(root, p('12_CLIENT_EXPERIENCE/CUSTOMER_ENDPOINT_REGISTRY.json')),
    whatsapp: load(root, p('16_HOME_IDENTITY_WHATSAPP/WHATSAPP_FLOW_REGISTRY.json')),
  };
}
const distinct = (items) => new Set(items.map((v) => JSON.stringify(v))).size;
const skeleton = (frc) => [...(frc.commands ?? [])].sort().map((c) => c.split(frc.aggregate).join('<A>'));
const LIFECYCLE = new Set(['Create<A>', 'Start<A>', 'Block<A>', 'Resume<A>', 'Complete<A>', 'Cancel<A>']);
export function computeCt1(frcs) {
  let total = 0, boilerplate = 0;
  for (const frc of frcs) for (const command of skeleton(frc)) {
    total += 1;
    if (LIFECYCLE.has(command)) boilerplate += 1;
  }
  return {
    features: frcs.length,
    frcs: frcs.length,
    distinct_command_skeletons_after_aggregate_substitution: distinct(frcs.map(skeleton)),
    lifecycle_boilerplate_commands: boilerplate,
    total_commands: total,
    feature_specific_command_ratio: Number(((total - boilerplate) / total).toFixed(3)),
    distinct_state_models: distinct(frcs.map((f) => f.states)),
    distinct_acceptance_contracts: distinct(frcs.map((f) => f.acceptance_contract)),
    distinct_permission_skeletons: distinct(frcs.map((f) => [...(f.permissions ?? [])].map((p) => p.split('.').pop()).sort())),
    distinct_eventuality_ref_sets: distinct(frcs.map((f) => f.eventuality_refs)),
  };
}
export function computeCt2(eventualities) {
  const material = eventualities.filter((e) => e.materiality === 'MATERIAL');
  return {
    eventualities: eventualities.length,
    material: material.length,
    distinct_test_definitions: distinct(eventualities.map((e) => e.tests)),
    distinct_procedures: distinct(eventualities.map((e) => e.procedure_steps)),
    distinct_compensation_rules: distinct(eventualities.map((e) => e.compensation_rule)),
    distinct_evidence_sets: distinct(eventualities.map((e) => e.evidence_to_freeze)),
  };
}
export function computeCounts(r) {
  return {
    top_level_features: r.features.length,
    mandatory_realization_facets: r.facets.length,
    feature_implementation_contracts: r.frcs.length,
    executable_eventuality_contracts: r.eventualities.length,
    material_eventualities: r.eventualities.filter((e) => e.materiality === 'MATERIAL').length,
    qualified_donor_records: r.donors.length,
    nfr_system_profiles: r.nfr.length,
    deployment_environments: r.environments.length,
    activation_blockers: r.blockers.length,
    operational_responsibility_records: r.operations.length,
    master_data_families: r.masterData.length,
    branch_activation_records: r.branches.length,
    feature_security_profiles: r.security.length,
    security_controls: r.controls.length,
    customer_endpoint_records: r.endpoints.length,
    supporting_capabilities: r.capabilities.length,
    whatsapp_flows: r.whatsapp.length,
  };
}
