#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadEngineeringSkillRegistry, APPROVED_SKILL_STATES } from '../orchestration/skill-registry.mjs';
import { hashSkillDirectory } from '../orchestration/skill-activation-store.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = path.resolve(process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control');
const vendorRoot = path.resolve(root, 'knowledge/vendor');
const failures = [];
const approved = loadEngineeringSkillRegistry(repoDir).filter((row) => APPROVED_SKILL_STATES.has(row.approval_state));
function walk(target, out = []) {
  const st = fs.statSync(target);
  out.push({ target, st });
  if (st.isDirectory()) for (const name of fs.readdirSync(target)) walk(path.join(target, name), out);
  return out;
}
for (const skill of approved) {
  if (!skill.snapshot_rel) { failures.push(`${skill.skill_id}: snapshot_rel missing`); continue; }
  const target = path.resolve(root, skill.snapshot_rel);
  const rel = path.relative(vendorRoot, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { failures.push(`${skill.skill_id}: snapshot escapes DIAL vendor root`); continue; }
  if (!fs.existsSync(target)) { failures.push(`${skill.skill_id}: snapshot missing`); continue; }
  try {
    const observed = hashSkillDirectory(target);
    if (observed.value !== skill.content_hash) failures.push(`${skill.skill_id}: content hash mismatch`);
    if (!fs.existsSync(path.join(target, 'SKILL.md'))) failures.push(`${skill.skill_id}: SKILL.md missing`);
    for (const { target: entry, st } of walk(target)) {
      if ((st.mode & 0o222) !== 0) failures.push(`${skill.skill_id}: approved vendor snapshot is writable (${(st.mode & 0o777).toString(8)}) at ${entry}`);
    }
  } catch (error) { failures.push(`${skill.skill_id}: ${String(error?.message || error)}`); }
}
const result = { status: failures.length ? 'RED' : 'GREEN', policy_version: 'vekl-1.0', approved_skill_count: approved.length, vendor_root: vendorRoot, vendor_snapshots_immutable: failures.every((f) => !f.includes('writable') && !f.includes('hash')), failures };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
