const BINDING_KEYS = [
  'project_id',
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
