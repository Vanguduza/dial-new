const bool = (value) => value === true;
const zero = (value) => Number(value || 0) === 0;
const positive = (value) => Number(value || 0) > 0;

function result(gate_id, name, applicable, passed, reasons = [], evidence_refs = []) {
  return {
    gate_id,
    name,
    applicable,
    state: !applicable ? 'NOT_APPLICABLE' : passed ? 'PASS' : 'FAIL',
    reasons,
    evidence_refs: Array.isArray(evidence_refs) ? evidence_refs.filter(Boolean) : [],
  };
}

function artifact(pack, key) {
  return pack?.artifacts?.[key] ?? null;
}
function refs(row) {
  return Array.isArray(row?.evidence_refs) ? row.evidence_refs : [];
}

export function evaluateDevelopmentPackGates(pack = {}) {
  const uiBearing = pack.project?.ui_bearing === true;
  const uiApplicabilityKnown = typeof pack.project?.ui_bearing === 'boolean';
  const developmentSystem = pack.project?.classification === 'DEVELOPMENT_SYSTEM';
  const gates = [];

  const baseline = artifact(pack, 'baseline');
  gates.push(result('GATE-00', 'Baseline known', true,
    Boolean(baseline?.repository_sha && baseline?.branch && baseline?.origin_url && baseline?.captured_at),
    baseline ? [] : ['BASELINE_ARTIFACT_MISSING'], refs(baseline)));

  const truth = artifact(pack, 'product_truth');
  const truthPass = Boolean(
    truth?.revision
    && positive(truth?.requirements_total)
    && Number(truth?.requirements_mapped) === Number(truth?.requirements_total)
    && zero(truth?.ambiguities_open)
    && bool(truth?.non_goals_defined),
  );
  gates.push(result('GATE-01', 'Product Truth complete', true, truthPass,
    truthPass ? [] : ['PRODUCT_TRUTH_INCOMPLETE'], refs(truth)));

  const units = artifact(pack, 'development_units');
  const unitPass = positive(units?.total) && bool(units?.stable_ids) && bool(units?.dependencies_resolved);
  gates.push(result('GATE-02', 'Development Unit graph complete', true, unitPass,
    unitPass ? [] : ['DEVELOPMENT_UNIT_GRAPH_INCOMPLETE'], refs(units)));

  const features = artifact(pack, 'feature_graph');
  const featurePass = positive(features?.features_total)
    && bool(features?.actions_mapped)
    && bool(features?.workflows_mapped)
    && bool(features?.data_mapped)
    && bool(features?.authority_mapped)
    && zero(features?.orphan_required_features);
  gates.push(result('GATE-03', 'Feature graph complete', true, featurePass,
    featurePass ? [] : ['FEATURE_GRAPH_INCOMPLETE'], refs(features)));

  const screens = artifact(pack, 'screen_registry');
  const screenApplicable = uiBearing || !uiApplicabilityKnown;
  const screenPass = uiApplicabilityKnown && (!uiBearing || (
    screens?.applicable === true
    && positive(screens?.screens_total)
    && bool(screens?.required_states_mapped)
    && bool(screens?.navigation_mapped)
    && bool(screens?.platform_behavior_mapped)
    && zero(screens?.unreachable_required_screens)
  ));
  gates.push(result('GATE-04', 'Screen Registry complete', screenApplicable, screenPass,
    screenPass ? [] : [!uiApplicabilityKnown ? 'UI_APPLICABILITY_UNDECLARED' : 'SCREEN_REGISTRY_INCOMPLETE'], refs(screens)));

  const realization = artifact(pack, 'screen_feature_proof');
  const realizationPass = uiApplicabilityKnown && (!uiBearing || (
    realization?.applicable === true
    && zero(realization?.orphan_required_features)
    && zero(realization?.orphan_screens)
    && zero(realization?.orphan_actions)
    && zero(realization?.controls_without_action)
    && zero(realization?.actions_without_runtime_consumer)
  ));
  gates.push(result('GATE-05', 'Bidirectional Screen x Feature proof', screenApplicable, realizationPass,
    realizationPass ? [] : [!uiApplicabilityKnown ? 'UI_APPLICABILITY_UNDECLARED' : 'SCREEN_FEATURE_PROOF_INCOMPLETE'], refs(realization)));

  const research = artifact(pack, 'research');
  const denominator = Number(research?.denominator || 0);
  const requiredCells = Number(research?.required_cells || 0);
  const qualifiedCells = Number(research?.qualified_cells || 0);
  const researchPass = denominator >= 0
    && requiredCells >= 0
    && qualifiedCells >= requiredCells
    && zero(research?.critical_conflicts_open)
    && Boolean(research?.coverage_defined);
  gates.push(result('GATE-06', 'Research ready', true, researchPass,
    researchPass ? [] : ['RESEARCH_COVERAGE_INCOMPLETE'], refs(research)));

  const architecture = artifact(pack, 'architecture');
  const architecturePass = bool(architecture?.components_defined)
    && bool(architecture?.runtime_topology_defined)
    && bool(architecture?.data_contracts_defined)
    && bool(architecture?.api_contracts_defined)
    && bool(architecture?.authority_defined);
  gates.push(result('GATE-07', 'Architecture ready', true, architecturePass,
    architecturePass ? [] : ['ARCHITECTURE_INCOMPLETE'], refs(architecture)));

  const failure = artifact(pack, 'failure_recovery');
  const failurePass = bool(failure?.failure_modes_defined)
    && bool(failure?.degraded_states_defined)
    && bool(failure?.reconciliation_defined)
    && bool(failure?.recovery_paths_defined);
  gates.push(result('GATE-08', 'Failure/recovery ready', true, failurePass,
    failurePass ? [] : ['FAILURE_RECOVERY_INCOMPLETE'], refs(failure)));

  const implementation = artifact(pack, 'implementation');
  const implementationPass = bool(implementation?.dependency_dag_valid)
    && bool(implementation?.atomic_packets_ready)
    && bool(implementation?.environment_certified);
  gates.push(result('GATE-09', 'Implementation ready', true, implementationPass,
    implementationPass ? [] : ['IMPLEMENTATION_READINESS_INCOMPLETE'], refs(implementation)));

  const verification = artifact(pack, 'verification');
  const verificationPass = bool(verification?.test_strategy_defined)
    && bool(verification?.evidence_plan_defined)
    && bool(verification?.independent_verification_defined)
    && bool(verification?.mutation_plan_defined);
  gates.push(result('GATE-10', 'Verification ready', true, verificationPass,
    verificationPass ? [] : ['VERIFICATION_PLAN_INCOMPLETE'], refs(verification)));

  const closure = artifact(pack, 'closure');
  const closurePass = bool(closure?.component_ledger_seeded)
    && bool(closure?.producer_consumer_caller_complete)
    && bool(closure?.counterexamples_defined)
    && bool(closure?.falsified_by_defined);
  gates.push(result('GATE-11', 'Closure ready', true, closurePass,
    closurePass ? [] : ['ANTI_GAP_CLOSURE_INCOMPLETE'], refs(closure)));

  const operations = artifact(pack, 'operations');
  const operationsPass = bool(operations?.deployment_defined)
    && bool(operations?.observability_defined)
    && bool(operations?.rollback_defined)
    && bool(operations?.runbooks_defined);
  gates.push(result('GATE-12', 'Operations ready', true, operationsPass,
    operationsPass ? [] : ['OPERATIONS_INCOMPLETE'], refs(operations)));

  const independence = artifact(pack, 'system_independence');
  const independencePass = !developmentSystem || (
    independence?.applicable === true
    && bool(independence?.owns_complete_e2e_pipeline)
    && independence?.dde_runtime_dependency === false
    && independence?.dde_authority_dependency === false
    && bool(independence?.arbitrary_project_conformance)
  );
  gates.push(result('GATE-13', 'Development-system independence ready', developmentSystem, independencePass,
    independencePass ? [] : ['DEVELOPMENT_SYSTEM_INDEPENDENCE_INCOMPLETE'], refs(independence)));

  // FFDRM/PRD-DDP Rev 2 forensic gates. These deliberately overlap some legacy
  // Development Pack gates: the legacy gates prove preparation breadth while FFDRM
  // proves causal/authority/reachability depth. Both must pass.
  const forensic = artifact(pack, 'forensic_predevelopment') || {};
  const forensicRefs = refs(forensic);
  const ff = (id, name, applicable, passed, reasons = [], evidence = forensicRefs) =>
    result(id, name, applicable, passed, reasons, evidence);

  gates.push(ff('F0_OWNER_INTENT_PRODUCT_TRUTH', 'FFDRM F0 owner intent and Product Truth', true,
    truthPass && bool(forensic.owner_intent_falsifiable) && bool(forensic.scope_exclusions_explicit),
    ['OWNER_INTENT_OR_PRODUCT_TRUTH_INCOMPLETE'], [...new Set([...refs(truth), ...forensicRefs])]));

  gates.push(ff('F1_DEVELOPMENT_UNIT_DECOMPOSITION', 'FFDRM F1 Development Unit decomposition', true,
    unitPass && bool(forensic.shared_authorities_mapped) && bool(forensic.verification_obligations_mapped),
    ['DEVELOPMENT_UNIT_FORENSIC_DECOMPOSITION_INCOMPLETE'], [...new Set([...refs(units), ...forensicRefs])]));

  const surfaceCoveragePass = featurePass && (!screenApplicable || (screenPass && realizationPass));
  gates.push(ff('F2_FEATURE_SURFACE_COVERAGE', 'FFDRM F2 feature and surface coverage', true,
    surfaceCoveragePass && bool(forensic.requirement_to_unit_traceability_complete),
    ['FEATURE_SURFACE_TRACEABILITY_INCOMPLETE'],
    [...new Set([...refs(features), ...refs(screens), ...refs(realization), ...forensicRefs])]));

  gates.push(ff('F3_AUTHORITY_MODEL', 'FFDRM F3 deterministic authority model', true,
    bool(features?.authority_mapped) && bool(architecture?.authority_defined)
      && bool(forensic.authority?.requester_mapped)
      && bool(forensic.authority?.policy_owner_mapped)
      && bool(forensic.authority?.execution_authority_mapped)
      && bool(forensic.authority?.credential_boundaries_mapped)
      && bool(forensic.authority?.audit_events_mapped),
    ['AUTHORITY_MODEL_INCOMPLETE'], [...new Set([...refs(features), ...refs(architecture), ...forensicRefs])]));

  const sp = forensic.state_persistence || {};
  gates.push(ff('F4_STATE_PERSISTENCE_MODEL', 'FFDRM F4 state and persistence model', true,
    bool(sp.canonical_state_owners_defined)
      && bool(sp.persistence_mechanisms_defined)
      && bool(sp.restart_process_death_defined)
      && bool(sp.idempotency_defined)
      && bool(sp.conflict_strategy_defined)
      && bool(sp.retention_deletion_revocation_defined),
    ['STATE_PERSISTENCE_MODEL_INCOMPLETE']));

  const cp = forensic.causal_paths || {};
  gates.push(ff('F5_CAUSAL_PATH_PROOF', 'FFDRM F5 causal path proof', true,
    positive(cp.material_behaviors_total)
      && Number(cp.paths_proven || 0) === Number(cp.material_behaviors_total || 0)
      && zero(cp.unreachable_required_behaviors)
      && bool(cp.production_callers_proven)
      && bool(cp.authority_checks_proven)
      && bool(cp.result_reconciliation_proven)
      && bool(cp.observable_postconditions_proven),
    ['CAUSAL_PATH_PROOF_INCOMPLETE']));

  gates.push(ff('F6_RESEARCH_TOOLING_ADEQUACY', 'FFDRM F6 research and tooling adequacy', true,
    researchPass && bool(forensic.research?.build_vs_adopt_recorded)
      && bool(forensic.research?.license_security_reviewed)
      && bool(forensic.research?.unsupported_assumptions_recorded),
    ['RESEARCH_TOOLING_ADEQUACY_INCOMPLETE'], [...new Set([...refs(research), ...forensicRefs])]));

  gates.push(ff('F7_ARCHITECTURAL_COHERENCE', 'FFDRM F7 architectural coherence', true,
    architecturePass
      && bool(forensic.architecture?.no_duplicate_authority)
      && bool(forensic.architecture?.no_parallel_canonical_state)
      && bool(forensic.architecture?.identity_error_event_models_coherent)
      && bool(forensic.architecture?.lifecycle_dataflow_coherent),
    ['ARCHITECTURAL_COHERENCE_INCOMPLETE'], [...new Set([...refs(architecture), ...forensicRefs])]));

  gates.push(ff('F8_FAILURE_DEGRADATION_RECOVERY', 'FFDRM F8 failure, degradation and recovery', true,
    failurePass
      && bool(forensic.failure?.timeouts_defined)
      && bool(forensic.failure?.retry_limits_defined)
      && bool(forensic.failure?.idempotency_verified)
      && bool(forensic.failure?.restart_recovery_defined)
      && bool(forensic.failure?.stale_state_handling_defined)
      && bool(forensic.failure?.escalation_defined),
    ['FAILURE_DEGRADATION_RECOVERY_INCOMPLETE'], [...new Set([...refs(failure), ...forensicRefs])]));

  const sec = forensic.security || {};
  gates.push(ff('F9_SECURITY_PRIVACY_SECRET_BOUNDARY', 'FFDRM F9 security, privacy and secret boundary', true,
    bool(sec.credential_ownership_defined)
      && bool(sec.secret_storage_defined)
      && bool(sec.trust_boundaries_defined)
      && bool(sec.input_validation_injection_defense_defined)
      && bool(sec.least_privilege_defined)
      && bool(sec.egress_boundaries_defined)
      && bool(sec.revocation_path_defined)
      && bool(sec.audit_path_defined)
      && bool(sec.replay_defense_addressed),
    ['SECURITY_PRIVACY_SECRET_BOUNDARY_INCOMPLETE']));

  gates.push(ff('F10_VERIFICATION_EVIDENCE_CONTRACT', 'FFDRM F10 verification and evidence contract', true,
    verificationPass
      && bool(forensic.verification?.reachability_evidence_defined)
      && bool(forensic.verification?.failure_injection_defined)
      && bool(forensic.verification?.runtime_gates_separated)
      && bool(forensic.verification?.owner_acceptance_separated),
    ['VERIFICATION_EVIDENCE_CONTRACT_INCOMPLETE'], [...new Set([...refs(verification), ...forensicRefs])]));

  const adv = forensic.adversarial || {};
  gates.push(ff('F11_ADVERSARIAL_FORENSICS', 'FFDRM F11 adversarial forensics', true,
    bool(adv.review_complete)
      && bool(adv.mock_only_checked)
      && bool(adv.unreachable_checked)
      && bool(adv.presentational_only_checked)
      && bool(adv.false_success_checked)
      && bool(adv.dead_or_orphaned_checked)
      && bool(adv.restart_stale_state_checked),
    ['ADVERSARIAL_FORENSICS_INCOMPLETE']));

  const kind = `${pack.project?.classification || ''} ${pack.project?.project_kind || ''}`.toUpperCase();
  const agentic = forensic.agentic === true || developmentSystem || /(AGENTIC|ADAPTIVE|AUTONOMOUS|ASSISTANT|TRADING)/.test(kind);
  const sym = forensic.symbiotic_loop || {};
  const symbioticPass = !agentic || (
    bool(sym.observe_defined) && bool(sym.contextualize_defined) && bool(sym.reason_defined)
    && bool(sym.deterministic_authority_boundary_defined) && bool(sym.execute_or_delegate_defined)
    && bool(sym.outcome_observation_defined) && bool(sym.reconcile_defined)
    && bool(sym.learn_defined) && bool(sym.improve_defined) && bool(sym.learning_cannot_expand_privilege)
  );
  gates.push(ff('F12_SYMBIOTIC_LOOP_PROOF', 'FFDRM F12 symbiotic loop proof', agentic,
    symbioticPass, symbioticPass ? [] : ['SYMBIOTIC_LOOP_INCOMPLETE']));

  const reach = forensic.reachability || {};
  gates.push(ff('F13_PRODUCTION_REACHABILITY', 'FFDRM F13 production reachability', true,
    bool(reach.production_registration_proven)
      && bool(reach.production_callers_proven)
      && bool(reach.real_state_binding_proven)
      && bool(reach.lifecycle_startup_proven_or_na)
      && bool(reach.observable_postconditions_proven),
    ['PRODUCTION_REACHABILITY_INCOMPLETE']));

  const anti = forensic.anti_gap || {};
  gates.push(ff('F14_ANTI_GAP_MUTATION_PROOF', 'FFDRM F14 anti-gap and mutation proof', true,
    bool(anti.mutation_executed)
      && bool(anti.critical_breakage_detected)
      && bool(anti.canonical_tree_guard)
      && bool(anti.authority_bypass_guard)
      && bool(anti.caller_disconnect_guard)
      && bool(anti.live_binding_guard_or_na),
    ['ANTI_GAP_MUTATION_PROOF_INCOMPLETE']));

  const ffPrereqs = gates.filter((gate) => gate.gate_id.startsWith('F') && gate.gate_id !== 'F15_FORENSIC_BUILD_READY_CERTIFICATION');
  const ffBlocked = ffPrereqs.some((gate) => gate.applicable && gate.state !== 'PASS');
  const explicitForensicBlockers = Array.isArray(forensic.preparation_blockers) ? forensic.preparation_blockers.filter(Boolean) : [];
  const f15Pass = !ffBlocked && explicitForensicBlockers.length === 0
    && forensic.runtime_qualification_separated === true
    && forensic.certificate_binding_defined === true;
  gates.push(ff('F15_FORENSIC_BUILD_READY_CERTIFICATION', 'FFDRM F15 FORENSIC_BUILD_READY certification', true,
    f15Pass, f15Pass ? [] : [
      ...(ffBlocked ? ['PRIOR_FFDRM_GATE_BLOCKED'] : []),
      ...(explicitForensicBlockers.length ? ['PREPARATION_BLOCKERS_OPEN'] : []),
      ...(forensic.runtime_qualification_separated === true ? [] : ['RUNTIME_QUALIFICATION_NOT_SEPARATE']),
      ...(forensic.certificate_binding_defined === true ? [] : ['CERTIFICATE_BINDING_UNDEFINED']),
    ]));

  const applicable = gates.filter((gate) => gate.applicable);
  const failures = applicable.filter((gate) => gate.state !== 'PASS');
  const failed = new Set(failures.map((gate) => gate.gate_id));
  let maturity = 'BUILD_READY';
  if (failed.has('GATE-00') || failed.has('GATE-01')) maturity = 'DRAFT';
  else if (['GATE-02','GATE-03','GATE-04','GATE-05'].some((id) => failed.has(id))) maturity = 'MAPPED';
  else if (failed.has('GATE-06')) maturity = 'RESEARCH_READY';
  else if (failed.has('GATE-07')) maturity = 'RESEARCH_COMPLETE';
  else if (failed.has('GATE-08')) maturity = 'DESIGN_READY';
  else if (failed.has('GATE-09')) maturity = 'ARCHITECTURE_READY';
  else if (['GATE-10','GATE-11','GATE-12','GATE-13'].some((id) => failed.has(id))) maturity = 'IMPLEMENTATION_READY';
  const forensicFailures = failures.filter((gate) => gate.gate_id.startsWith('F'));
  if (forensicFailures.length && maturity === 'BUILD_READY') maturity = 'FORENSIC_BUILD_BLOCKED';
  if (pack.maturity_state === 'INVALIDATED' || pack.invalidation) maturity = 'INVALIDATED';
  const invalidated = maturity === 'INVALIDATED';
  const blockers = failures.map((gate) => ({ gate_id: gate.gate_id, reasons: gate.reasons }));
  if (invalidated) blockers.unshift({ gate_id: 'PACK', reasons: ['PACK_INVALIDATED'] });
  return {
    schema_version: 1,
    project_id: pack.project?.project_id ?? null,
    evaluated_at: new Date().toISOString(),
    gates,
    forensic_gates: gates.filter((gate) => gate.gate_id.startsWith('F')),
    forensic_ready: gates.find((gate) => gate.gate_id === 'F15_FORENSIC_BUILD_READY_CERTIFICATION')?.state === 'PASS',
    forensic_state: gates.find((gate) => gate.gate_id === 'F15_FORENSIC_BUILD_READY_CERTIFICATION')?.state === 'PASS' ? 'FORENSIC_BUILD_READY' : 'FORENSIC_BUILD_BLOCKED',
    applicable_gate_count: applicable.length,
    passed_gate_count: applicable.length - failures.length,
    failed_gate_count: failures.length + (invalidated ? 1 : 0),
    build_ready: failures.length === 0 && !invalidated,
    maturity_state: maturity,
    blockers,
  };
}

export function assertBuildReady(pack) {
  const evaluated = evaluateDevelopmentPackGates(pack);
  if (!evaluated.build_ready) {
    const error = new Error(`BUILD_READY_REFUSED:${evaluated.blockers.map((x) => x.gate_id).join(',')}`);
    error.evaluation = evaluated;
    throw error;
  }
  return evaluated;
}
