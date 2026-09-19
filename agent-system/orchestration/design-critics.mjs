#!/usr/bin/env node
// Specialist design critics (Rev 3.1 §6.12).
//
// Critics produce structured evidence, not prose verdicts. Each returns a
// DesignCriticReport with named findings, so admission can act on them
// mechanically and so a rejection is traceable to a rule rather than to taste.
//
// These are deterministic structural critics. They check what can be checked
// from the candidate's own declared structure against Product Truth and the
// packet; they do not attempt to judge beauty. A model-based aesthetic critic
// is a provider behind the same contract, and its findings arrive in the same
// shape via `mergeCriticReports`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashObject } from './knowledge-graph-core.mjs';
import { loadDesignAntiPatterns } from './design-authority-projector.mjs';
import { CRITICS } from './screen-quality-packet.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO = path.resolve(here, '../..');

export const SEVERITIES = Object.freeze(['BLOCKING', 'MAJOR', 'MINOR']);

function report({ critic, candidateId, findings }) {
  const sorted = [...findings].sort((a, b) =>
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.finding_id.localeCompare(b.finding_id));
  const base = {
    schema_version: 1,
    critic,
    candidate_id: candidateId,
    findings: sorted,
    blocking_count: sorted.filter((f) => f.severity === 'BLOCKING').length,
    verdict: sorted.some((f) => f.severity === 'BLOCKING') ? 'REJECT' : sorted.length ? 'REVISE' : 'PASS',
    authority: 'CRITIC_EVIDENCE_ONLY',
  };
  return { ...base, report_hash: hashObject(base) };
}

const finding = (id, severity, detail) => ({ finding_id: id, severity, detail });

// A candidate declares its own structure: the actions it exposes, the states it
// renders, the surfaces it uses, the values it displays and where each came
// from. A provider that will not declare this cannot be critiqued, and an
// undeclared candidate fails the product critic rather than passing silently.
export function productCritic({ candidate, productTruth }) {
  const findings = [];
  const declared = candidate?.declared || null;
  if (!declared) findings.push(finding('CANDIDATE_STRUCTURE_UNDECLARED', 'BLOCKING', 'candidate declares no structure to check'));
  else {
    const actions = new Set(declared.actions || []);
    for (const required of productTruth.required_actions || []) {
      if (!actions.has(required)) findings.push(finding(`REQUIRED_ACTION_MISSING:${required}`, 'BLOCKING', 'required action absent from candidate'));
    }
    const states = new Set(declared.states || []);
    for (const required of productTruth.required_states || []) {
      if (!states.has(required)) findings.push(finding(`REQUIRED_STATE_MISSING:${required}`, 'BLOCKING', 'required state absent from candidate'));
    }
    const permitted = new Set(productTruth.required_actions || []);
    for (const action of actions) {
      if (!permitted.has(action) && !(declared.supporting_actions || []).includes(action)) {
        findings.push(finding(`INVENTED_CAPABILITY:${action}`, 'BLOCKING', 'candidate exposes an action Product Truth does not define'));
      }
    }
    for (const value of declared.displayed_values || []) {
      if (!value.source) findings.push(finding(`FAKE_DATA:${value.label ?? 'unlabelled'}`, 'BLOCKING', 'displayed value has no product data source'));
      else if (value.source === 'INVENTED') findings.push(finding(`INVENTED_METRICS:${value.label}`, 'BLOCKING', 'metric has no product data source'));
    }
    if (candidate.product_truth_hash && candidate.product_truth_hash !== productTruth.product_truth_hash) {
      findings.push(finding('PRODUCT_TRUTH_DRIFT', 'BLOCKING', 'candidate was generated against a different Product Truth'));
    }
  }
  return report({ critic: 'product', candidateId: candidate?.candidate_id, findings });
}

export function donorCritic({ candidate, productTruth, designProvenanceMode, donorApplicability = null }) {
  const findings = [];
  if (!['DONOR_ADAPT', 'DONOR_PRESERVE'].includes(designProvenanceMode)) {
    return report({ critic: 'donor', candidateId: candidate?.candidate_id, findings });
  }
  const declared = candidate?.declared || {};
  const preserved = new Set(declared.donor_semantics_preserved || []);
  for (const constraint of productTruth.donor_constraints || []) {
    if (!preserved.has(constraint)) findings.push(finding(`DONOR_SEMANTICS_NOT_PRESERVED:${constraint}`, 'BLOCKING', 'donor constraint not carried into the candidate'));
  }
  if (declared.donor_branding_present === true) {
    findings.push(finding('DONOR_BRAND_AUTHORITY', 'BLOCKING', 'donor branding retained where DIAL brand authority applies'));
  }
  if (designProvenanceMode === 'DONOR_PRESERVE' && declared.donor_workflow_reinterpreted === true) {
    findings.push(finding('DONOR_WORKFLOW_REINTERPRETED', 'BLOCKING', 'DONOR_PRESERVE forbids silently reinterpreting donor workflow'));
  }
  if (donorApplicability && donorApplicability.applicable === false) {
    findings.push(finding('DONOR_NOT_APPLICABLE', 'BLOCKING', 'donor material used outside its applicability registry entry'));
  }
  return report({ critic: 'donor', candidateId: candidate?.candidate_id, findings });
}

export function uxCritic({ candidate }) {
  const findings = [];
  const declared = candidate?.declared || {};
  if (!declared.primary_task) findings.push(finding('PRIMARY_TASK_UNCLEAR', 'MAJOR', 'no primary task is emphasised'));
  const emphasised = (declared.emphasis || []).filter((x) => x.level === 'primary');
  if (emphasised.length > 1) findings.push(finding('VISUAL_CLUTTER', 'MAJOR', `${emphasised.length} elements claim primary emphasis`));
  const destinations = (declared.navigation || []).map((n) => n.destination);
  const duplicated = destinations.filter((d, i) => destinations.indexOf(d) !== i);
  for (const dup of [...new Set(duplicated)]) findings.push(finding(`DUPLICATED_NAVIGATION:${dup}`, 'MAJOR', 'the same destination is offered twice'));
  for (const control of declared.controls || []) {
    if (!control.action && !control.destination) findings.push(finding(`DEAD_CONTROLS:${control.label ?? 'unlabelled'}`, 'BLOCKING', 'control has no action or destination'));
  }
  return report({ critic: 'ux', candidateId: candidate?.candidate_id, findings });
}

export function visualCritic({ candidate, repoDir = DEFAULT_REPO }) {
  const findings = [];
  const declared = candidate?.declared || {};
  const registry = loadDesignAntiPatterns(repoDir);
  const known = new Set([...registry.enforced_baseline, ...registry.guided_additional]);
  // A candidate may self-declare anti-patterns it knowingly carries; an
  // undeclared one found by an aesthetic critic arrives through mergeCriticReports.
  for (const id of declared.anti_patterns_present || []) {
    if (!known.has(id)) { findings.push(finding(`UNKNOWN_ANTI_PATTERN:${id}`, 'MINOR', 'anti-pattern not in the registry')); continue; }
    findings.push(finding(id, registry.severity_by_pattern[id] || 'MAJOR', 'declared anti-pattern present'));
  }
  if (Number(declared.card_nesting_depth || 0) > 2) findings.push(finding('EXCESSIVE_CARD_NESTING', 'MAJOR', `nesting depth ${declared.card_nesting_depth}`));
  const radii = [...new Set(declared.radii_used || [])];
  const scale = new Set(declared.radius_scale || radii);
  const offScale = radii.filter((r) => !scale.has(r));
  if (offScale.length) findings.push(finding('INCONSISTENT_RADII', 'MINOR', `off-scale radii: ${offScale.join(', ')}`));
  const weights = [...new Set(declared.icon_weights || [])];
  if (weights.length > 1) findings.push(finding('INCONSISTENT_ICON_WEIGHT', 'MINOR', `icon weights: ${weights.join(', ')}`));
  if (declared.hero && !declared.hero.carries_primary_task) findings.push(finding('MEANINGLESS_HERO', 'MAJOR', 'hero region carries no primary task'));
  return report({ critic: 'visual', candidateId: candidate?.candidate_id, findings });
}

export function accessibilityCritic({ candidate }) {
  const findings = [];
  const declared = candidate?.declared || {};
  for (const pair of declared.contrast_pairs || []) {
    const min = pair.large_text === true ? 3 : 4.5;
    if (Number(pair.ratio) < min) findings.push(finding(`CONTRAST_BELOW_MINIMUM:${pair.role ?? 'unnamed'}`, 'BLOCKING', `${pair.ratio}:1 below ${min}:1`));
  }
  for (const target of declared.touch_targets || []) {
    if (Number(target.min_dp) < 48) findings.push(finding(`TARGET_TOO_SMALL:${target.label ?? 'unlabelled'}`, 'BLOCKING', `${target.min_dp}dp below 48dp`));
  }
  if (declared.focus_order_defined === false) findings.push(finding('FOCUS_ORDER_UNDEFINED', 'BLOCKING', 'no focus order defined'));
  if (declared.state_differentiation === 'COLOR_ONLY') findings.push(finding('STATE_COLOR_ONLY', 'MAJOR', 'state differentiated by colour alone'));
  return report({ critic: 'accessibility', candidateId: candidate?.candidate_id, findings });
}

export function responsiveCritic({ candidate }) {
  const findings = [];
  const declared = candidate?.declared || {};
  const breakpoints = declared.breakpoints || [];
  if (!breakpoints.length) findings.push(finding('NO_RESPONSIVE_EVIDENCE', 'MAJOR', 'candidate declares no breakpoint behaviour'));
  for (const bp of breakpoints) {
    if (bp.overflow === true) findings.push(finding(`OVERFLOW_AT:${bp.name}`, 'BLOCKING', 'content overflows at this breakpoint'));
    if (bp.hierarchy_preserved === false) findings.push(finding(`HIERARCHY_LOST_AT:${bp.name}`, 'MAJOR', 'hierarchy not preserved at this breakpoint'));
  }
  if (declared.sections_count !== undefined && Number(declared.sections_count) <= 1 && Number(declared.estimated_height_ratio || 0) > 3) {
    findings.push(finding('UNSTRUCTURED_LONG_SCROLL', 'MAJOR', 'a single undifferentiated section spans several viewports'));
  }
  return report({ critic: 'responsive', candidateId: candidate?.candidate_id, findings });
}

export function implementationCritic({ candidate, componentRegistryIds = null }) {
  const findings = [];
  const declared = candidate?.declared || {};
  for (const component of declared.components || []) {
    if (componentRegistryIds && !componentRegistryIds.includes(component)) {
      findings.push(finding(`COMPONENT_NOT_AVAILABLE:${component}`, 'MAJOR', 'component is not in the frontend component registry'));
    }
  }
  for (const binding of declared.data_bindings || []) {
    if (binding.bindable === false) findings.push(finding(`UNBINDABLE_DATA:${binding.field}`, 'BLOCKING', 'no real data source can satisfy this binding'));
  }
  const states = new Set(declared.states || []);
  for (const required of ['LOADING', 'EMPTY', 'ERROR']) {
    if (declared.states && !states.has(required)) findings.push(finding(`STATE_INCOMPLETE:${required}`, 'MAJOR', 'implementation state not represented'));
  }
  if (declared.animation_cost === 'HIGH') findings.push(finding('ANIMATION_COST_HIGH', 'MINOR', 'animation may not hold frame budget on target devices'));
  return report({ critic: 'implementation', candidateId: candidate?.candidate_id, findings });
}

export function runCritics({
  candidate,
  productTruth,
  packet,
  repoDir = DEFAULT_REPO,
  donorApplicability = null,
  componentRegistryIds = null,
  externalReports = [],
}) {
  const requested = packet?.critics || CRITICS;
  const runners = {
    product: () => productCritic({ candidate, productTruth }),
    donor: () => donorCritic({ candidate, productTruth, designProvenanceMode: packet?.design_state?.design_provenance_mode, donorApplicability }),
    ux: () => uxCritic({ candidate }),
    visual: () => visualCritic({ candidate, repoDir }),
    accessibility: () => accessibilityCritic({ candidate }),
    responsive: () => responsiveCritic({ candidate }),
    implementation: () => implementationCritic({ candidate, componentRegistryIds }),
  };
  const reports = requested.filter((c) => runners[c]).map((c) => runners[c]());
  return mergeCriticReports({ candidateId: candidate?.candidate_id, reports: [...reports, ...externalReports] });
}

export function mergeCriticReports({ candidateId, reports = [] }) {
  const sorted = [...reports].sort((a, b) => a.critic.localeCompare(b.critic));
  const blocking = sorted.flatMap((r) => r.findings.filter((f) => f.severity === 'BLOCKING').map((f) => ({ critic: r.critic, ...f })));
  const base = {
    schema_version: 1,
    candidate_id: candidateId,
    reports: sorted,
    blocking_findings: blocking,
    // One rule decides acceptance, in one place: any blocking finding rejects.
    verdict: blocking.length ? 'REJECT' : sorted.some((r) => r.verdict === 'REVISE') ? 'REVISE' : 'PASS',
    critic_evidence_hash: hashObject(sorted.map((r) => r.report_hash)),
    authority: 'CRITIC_EVIDENCE_ONLY',
  };
  return { ...base, evidence_hash: hashObject(base) };
}
