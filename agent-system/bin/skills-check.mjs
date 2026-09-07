#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateEngineeringSkillRegistry } from '../orchestration/skill-registry.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const base = path.join(repoDir, 'agent-system/engineering-knowledge');
const failures = [];
const check = validateEngineeringSkillRegistry(repoDir);
if (!check.ok) failures.push(...check.failures);
for (const rel of [
  'schemas/engineering-skill.schema.json',
  'schemas/skill-activation-manifest.schema.json',
  'schemas/skill-outcome.schema.json',
  'registries/SKILL_CONFLICT_REGISTRY.json',
  'registries/SKILL_BUNDLE_REGISTRY.json',
  'vendors/google/GOOGLE_SKILLS_SOURCE.lock.json',
  'vendors/google/GOOGLE_ANDROID_SKILLS_SOURCE.lock.json',
]) {
  const target = path.join(base, rel);
  if (!fs.existsSync(target)) failures.push(`missing ${rel}`);
  else if (target.endsWith('.json')) { try { JSON.parse(fs.readFileSync(target, 'utf8')); } catch (e) { failures.push(`${rel}: invalid JSON: ${e.message}`); } }
}
const sourceLocks = ['GOOGLE_SKILLS_SOURCE.lock.json', 'GOOGLE_ANDROID_SKILLS_SOURCE.lock.json'].map((name) => JSON.parse(fs.readFileSync(path.join(base, 'vendors/google', name), 'utf8')));
for (const source of sourceLocks) {
  if (source.state === 'RESEARCH_REFERENCE_ONLY' && source.production_pin) failures.push(`${source.repo}: research-only source must not declare production_pin`);
  if (source.activation_allowed === true && !source.production_pin) failures.push(`${source.repo}: activation cannot be allowed without production_pin`);
}
const result = { status: failures.length ? 'RED' : 'GREEN', policy_version: 'vekl-1.0', skill_count: check.skill_count, approved_skill_count: check.approved_count, failures };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
