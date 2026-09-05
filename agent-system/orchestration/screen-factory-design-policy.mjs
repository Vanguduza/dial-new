import fs from 'node:fs';
import path from 'node:path';

export const SCREEN_FACTORY_DESIGN_POLICY = 'DIAL_HEALTH_SCREEN_FACTORY_UX_REV3';
export const SCREEN_FACTORY_DESIGN_SYSTEM = 'DIAL_HEALTH_UI_CANONICAL_3_0';
export const REQUIRED_CONTRACT_FIELDS = Object.freeze([
  'purpose', 'features', 'interaction', 'next_routes', 'required_variants', 'archetype',
]);

const RECORD_WORDS = /claim|result|report|record|document|payment|shortfall|prescription|order|transaction|balance|receipt|statement|timeline|appointment|pre-author/i;

export function isConsumerMyHealth(task = {}) {
  return String(task.business_unit || '') === 'My Health';
}

export function contractReadiness(task = {}) {
  const missing = REQUIRED_CONTRACT_FIELDS.filter((key) => !String(task?.[key] ?? '').trim());
  const evidence = Array.isArray(task.evidence_basis) && task.evidence_basis.length > 0;
  const durableContract = Boolean(task.contract_evidence?.source && !String(task.contract_evidence.source).startsWith('/tmp/'));
  return {
    ready: missing.length === 0 && (evidence || durableContract), missing,
    evidence_ready: evidence || durableContract,
    reason: missing.length ? `missing fields: ${missing.join(', ')}` : (!(evidence || durableContract) ? 'missing durable evidence basis' : null),
  };
}

export function assertTaskContractReady(task = {}) {
  const r = contractReadiness(task);
  if (!r.ready) throw new Error(`SCREEN_CONTRACT_NOT_READY ${task.task_id || task.screen_id || 'UNKNOWN'}: ${r.reason}`);
  return r;
}

export function experiencePolicy(task = {}) {
  const consumer = isConsumerMyHealth(task);
  const recordRelated = RECORD_WORDS.test(`${task.title || ''} ${task.features || ''} ${task.archetype || ''}`);
  // Export belongs on the focused screen whose canonical interaction contract asks for it.
  // A home/list teaser that merely links to a record must not be forced to expose export inline.
  const exportOnThisScreen = /export|download|share/i.test(String(task.interaction || ''));
  return {
    policy_version: SCREEN_FACTORY_DESIGN_POLICY,
    design_system: SCREEN_FACTORY_DESIGN_SYSTEM,
    audience: consumer ? 'CONSUMER_PATIENT_FAMILY' : 'PROFESSIONAL_OPERATOR',
    progressive_disclosure: consumer,
    max_primary_decisions_per_view: consumer ? 1 : 4,
    max_primary_content_regions: consumer ? 4 : 8,
    record_detail_required: recordRelated,
    export_required_when_record_or_transaction: true,
    export_action_required_on_this_screen: exportOnThisScreen,
    cosmetic_controls_allowed: false,
    frontend_authoritative_truth_allowed: false,
    additional_features_must_be_documented: true,
  };
}

function requireArray(packet, key) {
  if (!Array.isArray(packet?.[key])) throw new Error(`generator ${key} must be array`);
}

export function validateDesignPacket(packet, task) {
  assertTaskContractReady(task);
  for (const key of ['interaction_map','data_bindings','state_map','feature_coverage','evidence_map','additional_features','component_contracts']) requireArray(packet, key);
  const policy = experiencePolicy(task);
  for (const feature of packet.additional_features) {
    if (!feature || !String(feature.feature_id || '').trim() || !String(feature.name || '').trim() || !String(feature.rationale || '').trim()) {
      throw new Error('additional feature requires feature_id, name and rationale');
    }
    const p = feature.integration_plan;
    if (!p || typeof p !== 'object') throw new Error(`additional feature ${feature.feature_id} missing integration_plan`);
    for (const key of ['domain_owner','data','api_or_service','events','security_privacy','audit','qa','rollout']) {
      if (!String(p[key] ?? '').trim()) throw new Error(`additional feature ${feature.feature_id} integration_plan.${key} missing`);
    }
  }
  if (!packet.evidence_map.length) throw new Error('evidence_map may not be empty');
  if (!packet.feature_coverage.length) throw new Error('feature_coverage may not be empty');
  if (isConsumerMyHealth(task)) {
    if (!packet.experience_profile || typeof packet.experience_profile !== 'object') throw new Error('My Health experience_profile is required');
    const density = String(packet.experience_profile.information_density || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!['LOW','LOW_TO_MODERATE','MODERATE'].includes(density)) throw new Error('My Health information_density must be LOW, LOW_TO_MODERATE or MODERATE');
    packet.experience_profile.information_density = density;
    if (String(packet.experience_profile.progressive_disclosure).toLowerCase() === 'true') packet.experience_profile.progressive_disclosure = true;
    if (packet.experience_profile.progressive_disclosure !== true) throw new Error('My Health progressive_disclosure must be true');
  }
  return { packet, policy };
}

export function renderedPolicyFailures({ task, packet, layout = [], metrics = null } = {}) {
  const failures = [];
  const actions = new Set((packet?.interaction_map || []).flatMap((item) => [item?.data_action, item?.action_id, item?.action].filter(Boolean).map(String)));
  const actionable = layout.filter((item) => ['button','a'].includes(item.tag) || item.role === 'button');
  const missingAction = actionable.filter((item) => !item.action);
  const unmappedAction = actionable.filter((item) => item.action && !actions.has(String(item.action)));
  if (missingAction.length) failures.push('COSMETIC_OR_UNMAPPED_CONTROL');
  if (unmappedAction.length) failures.push('ACTION_NOT_IN_INTERACTION_MAP');
  const policy = experiencePolicy(task);
  if (policy.export_action_required_on_this_screen) {
    const exportAction = [...actions].some((id) => /export|download|share|statement|receipt/i.test(id));
    if (!exportAction) failures.push('RECORD_OR_TRANSACTION_EXPORT_ACTION_MISSING');
  }
  if (isConsumerMyHealth(task)) {
    const profile = packet?.experience_profile || {};
    if (profile.progressive_disclosure !== true) failures.push('MY_HEALTH_PROGRESSIVE_DISCLOSURE_NOT_DECLARED');
    if (!['LOW','LOW_TO_MODERATE','MODERATE'].includes(String(profile.information_density || '').toUpperCase())) failures.push('MY_HEALTH_DENSITY_NOT_CONSUMER_SAFE');
    const primary = actionable.filter((item) => /primary/i.test(String(item.ui || '')) || /primary/i.test(String(item.action || '')));
    if (primary.length > 2) failures.push('MY_HEALTH_TOO_MANY_PRIMARY_ACTIONS');
    const visibleActionable = actionable.filter((item) => Number(item.rect?.width || 0) > 0 && Number(item.rect?.height || 0) > 0);
    if (visibleActionable.length > 14) failures.push('MY_HEALTH_TOO_MANY_VISIBLE_ACTIONS');
    const visibleSemantic = layout.filter((item) => item.ui && Number(item.rect?.width || 0) > 0 && Number(item.rect?.height || 0) > 0);
    if (visibleSemantic.length > 50) failures.push('MY_HEALTH_EXCESSIVE_SEMANTIC_DENSITY');
    const longForm = /terms|privacy policy|consent document|legal|full report document/i.test(`${task.title || ''} ${task.archetype || ''}`);
    if (!longForm && metrics?.viewport_height && metrics?.scroll_height / metrics.viewport_height > 1.75) failures.push('MY_HEALTH_EXCESSIVE_SCROLL_DEPTH');
    const rev3 = String(task.design_policy_version || '') === SCREEN_FACTORY_DESIGN_POLICY || /3\.0/.test(String(task.design_version || ''));
    if (rev3 && !/class=["'][^"']*\bdh-screen\b/i.test(String(packet?.semantic_html || ''))) failures.push('MY_HEALTH_PREMIUM_ROOT_MISSING');
    if (rev3 && /<table\b/i.test(String(packet?.semantic_html || ''))) failures.push('MY_HEALTH_CONSUMER_TABLE_LAYOUT');
    if (rev3 && /[\u{1F300}-\u{1FAFF}]/u.test(String(packet?.semantic_html || ''))) failures.push('MY_HEALTH_EMOJI_ICONOGRAPHY');
  }
  return failures;
}

function md(value) { return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|'); }
export function additionalFeaturesMarkdown({ businessUnit, platform, tasks = [], packetByTask = new Map() } = {}) {
  const additions = [];
  for (const task of tasks) {
    const packet = packetByTask.get(task.task_id);
    for (const feature of packet?.additional_features || []) additions.push({ task, feature });
  }
  const lines = [
    `# ${businessUnit} — ${platform} — Additional Features Integration`, '',
    `Policy: \`${SCREEN_FACTORY_DESIGN_POLICY}\`  `,
    'Status: generated integration evidence; not implementation/UX/clinical green.', '',
    'This file is mandatory in the platform image pack. Features listed here were not silently invented: each was declared by the screen compiler and must be integrated into Dial Health before implementation is considered complete.', '',
  ];
  if (!additions.length) {
    lines.push('## No screen-specific additions', '', 'All rendered features in this platform pack map to existing documented screen contracts.');
    return `${lines.join('\n')}\n`;
  }
  for (const { task, feature } of additions) {
    lines.push(`## ${md(feature.feature_id)} — ${md(feature.name)}`, '', `**Screen:** ${md(task.screen_id)} — ${md(task.title)}  `, `**Rationale:** ${md(feature.rationale)}  `, `**Source gap:** ${md(feature.source_gap || 'Not specified')}`, '');
    for (const [label, key] of [['Domain owner','domain_owner'],['Data','data'],['API/service','api_or_service'],['Events','events'],['Security/privacy','security_privacy'],['Audit','audit'],['QA','qa'],['Rollout','rollout']]) lines.push(`- **${label}:** ${md(feature.integration_plan?.[key])}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function implementationHandoffMarkdown({ businessUnit, platform, tasks = [] } = {}) {
  const lines = [
    `# ${businessUnit} — ${platform} — Implementation Handoff`, '',
    `Design system: \`${SCREEN_FACTORY_DESIGN_SYSTEM}\`  `,
    `Factory policy: \`${SCREEN_FACTORY_DESIGN_POLICY}\`  `,
    `Required screens: ${tasks.length}  `,
    'Packaging scope: one business-unit/platform pack; no batch ZIPs.', '',
    '## Implementation rules', '',
    '- Treat the screen images as visual evidence, not as authoritative business logic.',
    '- Implement from each screen contract, interaction map, state map, evidence map and data bindings.',
    '- Every visible control must execute its mapped behaviour; cosmetic-only controls are prohibited.',
    '- Clinical, claims, eligibility, benefit, pricing, inventory and ledger truth remains service-owned.',
    '- Record/transaction collection items open a focused full detail route or modal/sheet.',
    '- Permitted record/transaction detail experiences expose functional export/download/share flows.',
    '- Formal visual approval, UX green, implementation green and clinical/regulatory certification are separate gates.', '',
    '## Screen inventory', '',
    '| Screen ID | Title | Status | Basic QA | Visual QA | Implementation ready |',
    '|---|---|---|---|---|---|',
  ];
  for (const task of tasks) lines.push(`| ${md(task.screen_id)} | ${md(task.title)} | ${md(task.status)} | ${md(task.basic_qa)} | ${md(task.visual_qa)} | ${task.implementation_ready === true ? 'yes' : 'no'} |`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function readPacketFromBundle(task) {
  if (!task?.bundle_dir) return null;
  const file = path.join(task.bundle_dir, `${task.screen_id}__${task.platform}.contract.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8'))?.packet || null; } catch { return null; }
}
