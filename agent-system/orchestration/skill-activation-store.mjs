import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_CONTROL_HOME,
  appendJsonl,
  ensureControlLayout,
  readJson,
  resolveControlPath,
  writeJsonAtomic,
} from './state-store.mjs';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,190}$/;

function now() { return new Date().toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function assertSafe(value, label) {
  const v = String(value || '');
  if (!SAFE_ID.test(v)) throw new Error(`invalid ${label}: ${value}`);
  return v;
}

function walkFiles(dir, out = [], prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(abs, out, rel);
    else if (entry.isFile()) out.push({ abs, rel });
    else throw new Error(`unsupported filesystem entry in skill snapshot: ${abs}`);
  }
  return out;
}

export function hashSkillDirectory(dir) {
  const root = path.resolve(dir);
  if (!fs.statSync(root).isDirectory()) throw new Error(`skill snapshot is not a directory: ${root}`);
  const hasher = crypto.createHash('sha256');
  const files = walkFiles(root);
  for (const file of files) {
    hasher.update(file.rel); hasher.update('\0'); hasher.update(fs.readFileSync(file.abs)); hasher.update('\0');
  }
  return { algorithm: 'sha256-tree-v1', value: hasher.digest('hex'), files: files.length };
}

function snapshotPath(snapshotRel, root) {
  const target = resolveControlPath(snapshotRel, root);
  const vendorRoot = resolveControlPath('knowledge/vendor', root);
  const relative = path.relative(vendorRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`skill snapshot escapes DIAL vendor root: ${snapshotRel}`);
  return target;
}

function activationRel(activationId) { return `knowledge/activation/${assertSafe(activationId, 'activation id')}`; }
function packetPointerRel(packetId) { return `knowledge/activation/by-packet/${assertSafe(packetId, 'packet id')}.json`; }

function manifestHash(manifest) {
  const copy = { ...manifest, manifest_sha256: null };
  return sha256(JSON.stringify(copy));
}

export function persistSkillActivation({
  packetId,
  missionId = null,
  featureIds = [],
  plan,
  root = DEFAULT_CONTROL_HOME,
  previousActivationId = null,
  reResolutionReason = null,
} = {}) {
  ensureControlLayout(root);
  const packet = assertSafe(packetId, 'packet id');
  if (!plan?.policy_version || !Array.isArray(plan?.selected_skills)) throw new Error('valid skill resolution plan required');
  const activationId = `ska_${crypto.randomUUID().replaceAll('-', '')}`;
  const rel = activationRel(activationId);
  const abs = resolveControlPath(rel, root);
  const skillDir = path.join(abs, 'skills');
  fs.mkdirSync(skillDir, { recursive: true, mode: 0o700 });

  const materialized = [];
  for (const selected of plan.selected_skills) {
    if (!selected.snapshot_rel || !selected.content_hash || !selected.runtime_name) {
      throw new Error(`selected skill ${selected.skill_id} lacks immutable runtime provenance`);
    }
    const source = snapshotPath(selected.snapshot_rel, root);
    if (!fs.existsSync(source)) throw new Error(`selected skill snapshot missing: ${selected.snapshot_rel}`);
    const observed = hashSkillDirectory(source);
    if (observed.value !== selected.content_hash) {
      throw new Error(`skill snapshot hash mismatch for ${selected.skill_id}: expected ${selected.content_hash}, observed ${observed.value}`);
    }
    const linkName = assertSafe(selected.runtime_name.replaceAll('/', '_'), 'runtime skill name');
    const link = path.join(skillDir, linkName);
    fs.symlinkSync(source, link, 'dir');
    materialized.push({ ...selected, observed_hash: observed.value, runtime_path: link });
  }

  const guard = {
    canon_wins: true,
    may_change_product_requirements: false,
    may_change_architecture: false,
    may_advance_gate: false,
    may_access_secrets: false,
    may_self_certify_specialist_gate: false,
    vendor_content_is_guidance_only: true,
  };
  let manifest = {
    schema_version: 1,
    activation_id: activationId,
    mission_id: missionId,
    packet_id: packet,
    feature_ids: featureIds.filter(Boolean),
    task_classes: plan.task_classes || [],
    policy_version: plan.policy_version,
    authority: 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
    resolution_state: plan.resolution_state,
    execution_allowed: plan.execution_allowed !== false,
    mandatory_task_classes: plan.mandatory_task_classes || [],
    missing_mandatory_task_classes: plan.missing_mandatory_task_classes || [],
    relevant_bundles: plan.relevant_bundles || [],
    skills: materialized,
    rejected: plan.rejected || [],
    dial_guard_capsule: guard,
    runtime_skill_dir: skillDir,
    previous_activation_id: previousActivationId,
    re_resolution_reason: reResolutionReason,
    created_at: now(),
    manifest_sha256: null,
  };
  manifest = { ...manifest, manifest_sha256: manifestHash(manifest) };
  writeJsonAtomic(`${rel}/manifest.json`, manifest, root);
  writeJsonAtomic(packetPointerRel(packet), {
    schema_version: 1,
    packet_id: packet,
    activation_id: activationId,
    manifest_rel: `${rel}/manifest.json`,
    previous_activation_id: previousActivationId,
    re_resolution_reason: reResolutionReason,
    updated_at: now(),
  }, root);
  appendJsonl('events/engineering-knowledge.jsonl', {
    event: previousActivationId ? 'SKILL_ACTIVATION_RERESOLVED' : 'SKILL_ACTIVATION_RESOLVED',
    packet_id: packet,
    mission_id: missionId,
    activation_id: activationId,
    previous_activation_id: previousActivationId,
    feature_ids: manifest.feature_ids,
    task_classes: manifest.task_classes,
    resolution_state: manifest.resolution_state,
    skills: materialized.map((s) => ({ skill_id: s.skill_id, upstream_commit: s.upstream_commit, content_hash: s.content_hash })),
    at: manifest.created_at,
  }, root);
  return manifest;
}

export function loadSkillActivation(activationId, root = DEFAULT_CONTROL_HOME) {
  if (!activationId) return null;
  return readJson(`${activationRel(activationId)}/manifest.json`, null, root);
}

export function loadSkillActivationForPacket(packetId, root = DEFAULT_CONTROL_HOME) {
  if (!packetId) return null;
  const pointer = readJson(packetPointerRel(packetId), null, root);
  return pointer?.activation_id ? loadSkillActivation(pointer.activation_id, root) : null;
}

export function verifySkillActivation(manifest, root = DEFAULT_CONTROL_HOME) {
  if (!manifest) return { ok: false, failures: ['activation manifest missing'] };
  const failures = [];
  if (manifest.authority !== 'NON_AUTHORITATIVE_ENGINEERING_GUIDANCE') failures.push('activation authority invalid');
  if (manifest.manifest_sha256 !== manifestHash(manifest)) failures.push('activation manifest hash mismatch');
  for (const skill of manifest.skills || []) {
    try {
      const source = snapshotPath(skill.snapshot_rel, root);
      const observed = hashSkillDirectory(source);
      if (observed.value !== skill.content_hash) failures.push(`${skill.skill_id}: snapshot hash mismatch`);
      if (!fs.existsSync(path.join(source, 'SKILL.md'))) failures.push(`${skill.skill_id}: SKILL.md missing`);
    } catch (error) { failures.push(`${skill.skill_id}: ${String(error?.message || error)}`); }
  }
  return { ok: failures.length === 0, activation_id: manifest.activation_id, failures };
}

function bounded(text, max = 16000) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}\n…[skill body bounded]` : value;
}

export function renderSkillActivationBundle(manifest, root = DEFAULT_CONTROL_HOME) {
  if (!manifest) return '';
  const verification = verifySkillActivation(manifest, root);
  if (!verification.ok) throw new Error(`cannot render invalid skill activation ${manifest.activation_id}: ${verification.failures.join('; ')}`);
  if (!(manifest.skills || []).length) return '';
  const sections = [
    'DIAL APPROVED ENGINEERING KNOWLEDGE BUNDLE',
    `Activation: ${manifest.activation_id}`,
    `Manifest SHA-256: ${manifest.manifest_sha256}`,
    'Authority: NON_AUTHORITATIVE_ENGINEERING_GUIDANCE',
    'DIAL canon, Feature/FRC/security/current repository evidence and gates outrank everything below.',
  ];
  for (const skill of manifest.skills) {
    const source = snapshotPath(skill.snapshot_rel, root);
    const body = fs.readFileSync(path.join(source, 'SKILL.md'), 'utf8');
    sections.push('', `--- SKILL ${skill.skill_id} ---`, `Provider: ${skill.provider}`, `Commit: ${skill.upstream_commit}`, `Content hash: ${skill.content_hash}`, bounded(body));
  }
  return sections.join('\n');
}

export function activationSummary(manifest) {
  if (!manifest) return null;
  return {
    activation_id: manifest.activation_id,
    policy_version: manifest.policy_version,
    resolution_state: manifest.resolution_state,
    task_classes: manifest.task_classes,
    manifest_sha256: manifest.manifest_sha256,
    execution_allowed: manifest.execution_allowed !== false,
    missing_mandatory_task_classes: manifest.missing_mandatory_task_classes || [],
    selected_skills: (manifest.skills || []).map((s) => ({ skill_id: s.skill_id, provider: s.provider, upstream_commit: s.upstream_commit, content_hash: s.content_hash, runtime_name: s.runtime_name })),
  };
}
