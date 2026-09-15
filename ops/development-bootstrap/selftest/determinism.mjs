#!/usr/bin/env node
// Determinism gate (mission section 34): run the same bounded routing scenario N times and require
// identical control-plane decisions (project truth, unit/revision, capsule manifest, policy class,
// provider class, forbidden actions). Output text is not compared; decisions are.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runE2ESelfTest } from './e2e-selftest.mjs';
import { workloadDecision } from '../roles/role-guard.mjs';
import { loadRoles } from '../lib/manifest.mjs';

export async function runDeterminism({ repoDir, runs = 3, featureId = 'SPARE-F001', role = null } = {}) {
  const results = [];
  for (let i = 0; i < runs; i += 1) results.push(await runE2ESelfTest({ repoDir, featureId, role }));
  const hashes = results.map((r) => r.decision_fingerprint.hash);
  const identical = hashes.every((h) => h === hashes[0]);
  // Forbidden actions must remain forbidden on every run for every role.
  const roles = loadRoles();
  const forbidden = [];
  for (const [role, def] of Object.entries(roles.roles)) for (const w of def.forbidden_workloads || []) {
    const decisions = Array.from({ length: runs }, () => workloadDecision({ role, workload: w, roles }).allowed);
    if (decisions.some(Boolean)) forbidden.push({ role, workload: w, decisions });
  }
  return { ok: identical && results.every((r) => r.ok) && forbidden.length === 0, runs, identical_decisions: identical, decision_hashes: hashes, decision_fields: results[0]?.decision_fingerprint.fields, failed_runs: results.filter((r) => !r.ok).map((r) => ({ id: r.correlation_id, error: r.error })), forbidden_leaks: forbidden };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoDir = process.env.DIAL_REPO_DIR || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
  const r = await runDeterminism({ repoDir, runs: Number(process.argv[2] || 3) });
  console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1);
}
