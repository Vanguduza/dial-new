const BINDING_KEYS = [
  'project_id',
  'project_slug',
  'predevelopment_standard_id',
  'predevelopment_certificate_source',
  'repositories',
  'workspace_roots',
  'mcp_endpoint',
  'capability_subset',
  'credential_references',
  'attempt_budget_overrides',
  'audit_sink',
];

export function loadProjectBinding(source) {
  const binding = typeof source === 'string' ? JSON.parse(source) : { ...source };
  if (!binding?.project_id) throw new Error('project binding requires project_id');
  const out = { project_id: String(binding.project_id) };
  if (binding.project_slug !== undefined) out.project_slug = String(binding.project_slug);
  if (binding.predevelopment_standard_id !== undefined) out.predevelopment_standard_id = String(binding.predevelopment_standard_id);
  if (binding.predevelopment_certificate_source !== undefined) out.predevelopment_certificate_source = String(binding.predevelopment_certificate_source);
  for (const key of BINDING_KEYS) {
    if (key === 'project_id') continue;
    if (binding[key] !== undefined) out[key] = binding[key];
  }
  return out;
}

export function opaqueProjectFields(binding) {
  const known = new Set(BINDING_KEYS);
  return Object.keys(binding || {}).filter((key) => !known.has(key));
}
