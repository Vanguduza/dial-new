import fs from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('Usage: node agent-system/bin/context-get.mjs <FEATURE_ID>');
  process.exit(2);
}
const root = process.cwd();
const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const canonicalPath = 'docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md';

const reg = load('agent-system/registries/FEATURE_REGISTRY.json');
const feature = reg.find((x) => x.feature_id === id);
if (!feature) {
  console.error(`Unknown Feature ID: ${id}`);
  process.exit(1);
}

const realization = load('docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json')
  .find((x) => x.feature_id === id);
const facets = load('docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json')
  .filter((x) => x.parent_feature_id === id);
const eventualities = load('docs/dial/final-audit/11_FEATURE_REALIZATION/EVENTUALITY_PLAYBOOK_REGISTRY.json')
  .filter((x) => x.module === feature.module || (x.applies_to || []).includes(feature.module));
const endpoints = load('docs/dial/final-audit/12_CLIENT_EXPERIENCE/CUSTOMER_ENDPOINT_REGISTRY.json')
  .filter((x) => x.feature_id === id);
const donors = load('docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json')
  .filter((x) => (feature.donor_refs || []).includes(x.donor_id));
const securityProfile = load('docs/dial/final-audit/17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json')
  .find((x) => x.feature_id === id);
const securityControls = load('docs/dial/final-audit/17_SECURITY/SECURITY_CONTROL_REGISTRY.json')
  .filter((x) => (securityProfile?.required_control_categories || []).includes(x.category));
const canonical = fs.readFileSync(path.join(root, canonicalPath), 'utf8');
const truth = fs.readFileSync(path.join(root, 'agent-system/canon/PROJECT_TRUTH.md'), 'utf8');

console.log(JSON.stringify({
  authority: {
    canonical_source: canonicalPath,
    rule: 'The canonical source overrides every subordinate artifact. A conflict is a migration finding, never permission to follow the stale artifact.',
    canonical_text: canonical,
    project_truth_projection: truth,
  },
  feature,
  realization,
  mandatory_facets: facets,
  applicable_eventualities: eventualities,
  customer_endpoints: endpoints,
  donors,
  security_profile: securityProfile,
  applicable_security_controls: securityControls,
  next: [
    'Apply the canonical master before interpreting any feature-specific artifact.',
    'Inspect actual code/test paths before planning.',
    'If source_doc/FRC/code conflicts with canon, classify IMPLEMENTATION_CONFLICT and migrate it.',
    'Resolve donor exact source paths after pin/import, never from memory.',
    'Implement all applicable facets/eventualities/customer/support endpoints.',
    'Do not advance feature gate without fresh evidence.',
    'Implement and verify the SECURITY_PRIVACY facet and applicable security controls.'
  ]
}, null, 2));
