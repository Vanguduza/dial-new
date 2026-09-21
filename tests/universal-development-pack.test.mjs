import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ensureProjectRegistry,
  registerProject,
} from '../agent-system/orchestration/project-registry.mjs';
import {
  seedDevelopmentPack,
  recordDevelopmentPackArtifact,
  developmentPackStatus,
  rebaselineDevelopmentPack,
} from '../agent-system/orchestration/development-pack-compiler.mjs';
import { evaluateDevelopmentPackGates } from '../agent-system/orchestration/development-pack-gates.mjs';

function temp(name) { return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)); }
function makeRepo(name) {
  const repo = temp(name);
  fs.writeFileSync(path.join(repo, 'README.md'), '# project\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: repo });
  return repo;
}
function evidence(id) { return { evidence_refs: [`test:${id}`] }; }

function completeArtifacts() {
  return {
    product_truth: {
      revision: 'PT-1',
      requirements_total: 4,
      requirements_mapped: 4,
      ambiguities_open: 0,
      non_goals_defined: true,
      ...evidence('truth'),
    },
    development_units: {
      total: 3,
      stable_ids: true,
      dependencies_resolved: true,
      ...evidence('units'),
    },
    feature_graph: {
      features_total: 5,
      actions_mapped: true,
      workflows_mapped: true,
      data_mapped: true,
      authority_mapped: true,
      orphan_required_features: 0,
      ...evidence('features'),
    },
    screen_registry: {
      applicable: true,
      screens_total: 3,
      required_states_mapped: true,
      navigation_mapped: true,
      platform_behavior_mapped: true,
      unreachable_required_screens: 0,
      ...evidence('screens'),
    },
    screen_feature_proof: {
      applicable: true,
      orphan_required_features: 0,
      orphan_screens: 0,
      orphan_actions: 0,
      controls_without_action: 0,
      actions_without_runtime_consumer: 0,
      ...evidence('screen-feature'),
    },
    research: {
      denominator: 12,
      required_cells: 10,
      qualified_cells: 10,
      critical_conflicts_open: 0,
      coverage_defined: true,
      ...evidence('research'),
    },
    architecture: {
      components_defined: true,
      runtime_topology_defined: true,
      data_contracts_defined: true,
      api_contracts_defined: true,
      authority_defined: true,
      ...evidence('architecture'),
    },
    failure_recovery: {
      failure_modes_defined: true,
      degraded_states_defined: true,
      reconciliation_defined: true,
      recovery_paths_defined: true,
      ...evidence('failure'),
    },
    implementation: {
      dependency_dag_valid: true,
      atomic_packets_ready: true,
      environment_certified: true,
      ...evidence('implementation'),
    },
    verification: {
      test_strategy_defined: true,
      evidence_plan_defined: true,
      independent_verification_defined: true,
      mutation_plan_defined: true,
      ...evidence('verification'),
    },
    closure: {
      component_ledger_seeded: true,
      producer_consumer_caller_complete: true,
      counterexamples_defined: true,
      falsified_by_defined: true,
      ...evidence('closure'),
    },
    operations: {
      deployment_defined: true,
      observability_defined: true,
      rollback_defined: true,
      runbooks_defined: true,
      ...evidence('operations'),
    },
  };
}

describe('universal deterministic Development Pack compiler', () => {
  it('seeds any registered project fail-closed rather than self-declaring BUILD_READY', () => {
    const root = temp('pack-root');
    const dialRepo = makeRepo('pack-dial');
    const appRepo = makeRepo('pack-app');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    registerProject({
      slug: 'field-inspection',
      name: 'Field Inspection',
      repoDir: appRepo,
      classification: 'APPLICATION_PROJECT',
      uiBearing: true,
    }, root);
    const seeded = seedDevelopmentPack({ projectSlug: 'field-inspection', root });
    expect(seeded.created).toBe(true);
    expect(seeded.pack.project.project_id).toBe('field-inspection');
    expect(seeded.pack.project.ui_bearing).toBe(true);
    expect(seeded.evaluation.build_ready).toBe(false);
    expect(seeded.evaluation.maturity_state).toBe('DRAFT');
    expect(seeded.evaluation.blockers.length).toBeGreaterThan(5);
  });

  it('earns BUILD_READY only after every applicable gate is evidenced', () => {
    const root = temp('pack-complete-root');
    const dialRepo = makeRepo('pack-dial');
    const appRepo = makeRepo('pack-complete-app');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    registerProject({
      slug: 'customer-app',
      name: 'Customer App',
      repoDir: appRepo,
      classification: 'APPLICATION_PROJECT',
      uiBearing: true,
    }, root);
    seedDevelopmentPack({ projectSlug: 'customer-app', root });
    for (const [artifactType, artifact] of Object.entries(completeArtifacts())) {
      recordDevelopmentPackArtifact({ projectSlug: 'customer-app', artifactType, artifact, root });
    }
    const status = developmentPackStatus('customer-app', root);
    expect(status.build_ready).toBe(true);
    expect(status.maturity_state).toBe('BUILD_READY');
    expect(status.blockers).toEqual([]);
    expect(status.gates.find((g) => g.gate_id === 'GATE-13').state).toBe('NOT_APPLICABLE');
  });

  it('requires explicit UI applicability instead of silently exempting screen gates', () => {
    const pack = {
      project: { project_id: 'unknown-ui', classification: 'APPLICATION_PROJECT', ui_bearing: null },
      artifacts: {},
    };
    const evaluation = evaluateDevelopmentPackGates(pack);
    expect(evaluation.gates.find((g) => g.gate_id === 'GATE-04')).toMatchObject({
      state: 'FAIL',
      reasons: ['UI_APPLICABILITY_UNDECLARED'],
    });
    expect(evaluation.gates.find((g) => g.gate_id === 'GATE-05')).toMatchObject({
      state: 'FAIL',
      reasons: ['UI_APPLICABILITY_UNDECLARED'],
    });
  });

  it('refuses evidence-free artifact claims', () => {
    const root = temp('pack-evidence-root');
    const dialRepo = makeRepo('pack-dial');
    const appRepo = makeRepo('pack-evidence-app');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    registerProject({ slug: 'api-only', repoDir: appRepo, uiBearing: false }, root);
    seedDevelopmentPack({ projectSlug: 'api-only', root });
    expect(() => recordDevelopmentPackArtifact({
      projectSlug: 'api-only',
      artifactType: 'product_truth',
      artifact: {
        revision: 'PT-1',
        requirements_total: 1,
        requirements_mapped: 1,
        ambiguities_open: 0,
        non_goals_defined: true,
      },
      root,
    })).toThrow(/EVIDENCE_REQUIRED/);
  });

  it('invalidates effective readiness on repository drift and requires an explicit rebaseline', () => {
    const root = temp('pack-drift-root');
    const dialRepo = makeRepo('pack-dial');
    const appRepo = makeRepo('pack-drift-app');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    registerProject({ slug: 'drift-app', repoDir: appRepo, uiBearing: false }, root);
    seedDevelopmentPack({ projectSlug: 'drift-app', root });

    fs.appendFileSync(path.join(appRepo, 'README.md'), 'change\n');
    execFileSync('git', ['add', '.'], { cwd: appRepo });
    execFileSync('git', ['commit', '-qm', 'drift'], { cwd: appRepo });

    const stale = developmentPackStatus('drift-app', root);
    expect(stale.baseline_state).toBe('STALE');
    expect(stale.build_ready).toBe(false);
    expect(stale.maturity_state).toBe('INVALIDATED');
    expect(() => recordDevelopmentPackArtifact({
      projectSlug: 'drift-app',
      artifactType: 'product_truth',
      artifact: { revision: 'PT-2', requirements_total: 1, requirements_mapped: 1, ambiguities_open: 0, non_goals_defined: true, ...evidence('truth') },
      root,
    })).toThrow(/BASELINE_STALE/);

    const rebased = rebaselineDevelopmentPack({ projectSlug: 'drift-app', root });
    expect(rebased.pack.artifacts.baseline.repository_sha).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRepo, encoding: 'utf8' }).trim());
    expect(rebased.pack.artifacts.product_truth).toBeNull();
    expect(developmentPackStatus('drift-app', root).baseline_state).toBe('CURRENT');
  });

  it('makes the development-system independence gate mandatory for DIAL itself', () => {
    const pack = {
      project: { project_id: 'dial-development-system', classification: 'DEVELOPMENT_SYSTEM', ui_bearing: false },
      artifacts: {
        system_independence: {
          applicable: true,
          owns_complete_e2e_pipeline: true,
          dde_runtime_dependency: false,
          dde_authority_dependency: false,
          arbitrary_project_conformance: false,
          ...evidence('independence'),
        },
      },
    };
    const blocked = evaluateDevelopmentPackGates(pack);
    expect(blocked.gates.find((g) => g.gate_id === 'GATE-13').state).toBe('FAIL');
    pack.artifacts.system_independence.arbitrary_project_conformance = true;
    const gate = evaluateDevelopmentPackGates(pack).gates.find((g) => g.gate_id === 'GATE-13');
    expect(gate.state).toBe('PASS');
  });

  it('does not permit a failing screen-feature mutation to hide behind other green artifacts', () => {
    const pack = {
      project: { project_id: 'ui-project', classification: 'APPLICATION_PROJECT', ui_bearing: true },
      artifacts: {
        ...completeArtifacts(),
        baseline: { repository_sha: 'a'.repeat(40), branch: 'main', origin_url: 'https://example.invalid/repo.git', captured_at: new Date().toISOString(), ...evidence('baseline') },
      },
    };
    expect(evaluateDevelopmentPackGates(pack).build_ready).toBe(true);
    pack.artifacts.screen_feature_proof.actions_without_runtime_consumer = 1;
    const mutated = evaluateDevelopmentPackGates(pack);
    expect(mutated.build_ready).toBe(false);
    expect(mutated.gates.find((g) => g.gate_id === 'GATE-05').state).toBe('FAIL');
  });
});
