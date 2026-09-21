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
  const screenApplicable = uiBearing;
  const screenPass = !screenApplicable || (
    screens?.applicable === true
    && positive(screens?.screens_total)
    && bool(screens?.required_states_mapped)
    && bool(screens?.navigation_mapped)
    && bool(screens?.platform_behavior_mapped)
    && zero(screens?.unreachable_required_screens)
  );
  gates.push(result('GATE-04', 'Screen Registry complete', screenApplicable, screenPass,
    screenPass ? [] : ['SCREEN_REGISTRY_INCOMPLETE'], refs(screens)));

  const realization = artifact(pack, 'screen_feature_proof');
  const realizationPass = !screenApplicable || (
    realization?.applicable === true
    && zero(realization?.orphan_required_features)
    && zero(realization?.orphan_screens)
    && zero(realization?.orphan_actions)
    && zero(realization?.controls_without_action)
    && zero(realization?.actions_without_runtime_consumer)
  );
  gates.push(result('GATE-05', 'Bidirectional Screen x Feature proof', screenApplicable, realizationPass,
    realizationPass ? [] : ['SCREEN_FEATURE_PROOF_INCOMPLETE'], refs(realization)));

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

  const applicable = gates.filter((gate) => gate.applicable);
  const failures = applicable.filter((gate) => gate.state !== 'PASS');
  return {
    schema_version: 1,
    project_id: pack.project?.project_id ?? null,
    evaluated_at: new Date().toISOString(),
    gates,
    applicable_gate_count: applicable.length,
    passed_gate_count: applicable.length - failures.length,
    failed_gate_count: failures.length,
    build_ready: failures.length === 0,
    maturity_state: failures.length === 0 ? 'BUILD_READY' : 'IMPLEMENTATION_READY',
    blockers: failures.map((gate) => ({ gate_id: gate.gate_id, reasons: gate.reasons })),
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
