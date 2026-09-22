import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureProjectRegistry,
  getProject,
  registerProject,
} from '../agent-system/orchestration/project-registry.mjs';
import {
  archetypesFor,
  assertAuxiliaryAuthority,
  HAIF_AUTHORITY,
  HAIF_BUDGET_POLICY,
} from '../agent-system/orchestration/auxiliary/authority-gate.mjs';
import { r2ObjectKey } from '../agent-system/orchestration/auxiliary/r2-evidence-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function temp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}
function makeRepo(name) {
  const repo = temp(name);
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'CI'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  return repo;
}

describe('universal DIAL development-system independence', () => {
  it('classifies DDE as an independent project, never as a DIAL subsystem', () => {
    const registry = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'agent-system/registries/UNIVERSAL_PROJECT_REGISTRY.json'),
      'utf8',
    ));
    expect(registry.development_system).toMatchObject({
      project_id: 'dial-development-system',
      classification: 'DEVELOPMENT_SYSTEM',
      owns_complete_e2e_pipeline: true,
      normal_authority_plane: 'HERMES',
    });
    expect(registry.seed_projects.dde).toMatchObject({
      project_id: 'dde',
      classification: 'INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT',
      independence: {
        runtime_dependency_of_dial_development_system: false,
        authority_dependency_of_dial_development_system: false,
        shared_product_truth: false,
        shared_mutable_memory: false,
        shared_deployment_lifecycle: false,
      },
    });
    for (const id of ['dial-groceries', 'dial-logistics', 'dial-care', 'dial-a-spare', 'dial-a-tech', 'dial-laundry']) {
      expect(registry.seed_projects[id].classification).toBe('PRODUCT_PROJECT');
      expect(registry.seed_projects[id].repository.mode).toBe('SHARED_MONOREPO');
    }
  });

  it('marks the DIAL runtime registry as a complete development system with no DDE dependency', () => {
    const root = temp('universal-project-root');
    const dialRepo = makeRepo('universal-dial-repo');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    const dial = getProject('dial', root);
    expect(dial).toMatchObject({
      project_id: 'dial-development-system',
      classification: 'DEVELOPMENT_SYSTEM',
      owns_complete_e2e_pipeline: true,
      runtime_dependency_on_dde: false,
      authority_dependency_on_dde: false,
    });
  });

  it('admits an arbitrary non-DIAL application without changing reusable code', () => {
    const root = temp('universal-customer-root');
    const dialRepo = makeRepo('universal-dial-repo');
    const customerRepo = makeRepo('customer-field-app');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    const project = registerProject({
      slug: 'customer-field-app',
      name: 'Customer Field Inspection',
      repoDir: customerRepo,
      classification: 'APPLICATION_PROJECT',
    }, root);
    expect(project).toMatchObject({
      project_id: 'customer-field-app',
      classification: 'APPLICATION_PROJECT',
      repository_mode: 'DEDICATED_REPOSITORY',
    });
    expect(getProject('customer-field-app', root).repo_dir).toBe(fs.realpathSync(customerRepo));
  });

  it('supports multiple logical product projects in a shared monorepo only with distinct scopes', () => {
    const root = temp('universal-monorepo-root');
    const dialRepo = makeRepo('universal-dial-repo');
    const productRepo = makeRepo('universal-product-monorepo');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    registerProject({
      slug: 'product-alpha',
      repoDir: productRepo,
      repositoryMode: 'SHARED_MONOREPO',
      scopeSelector: { module: 'ALPHA' },
      classification: 'PRODUCT_PROJECT',
    }, root);
    const beta = registerProject({
      slug: 'product-beta',
      repoDir: productRepo,
      repositoryMode: 'SHARED_MONOREPO',
      scopeSelector: { module: 'BETA' },
      classification: 'PRODUCT_PROJECT',
    }, root);
    expect(beta.scope_selector).toEqual({ module: 'BETA' });
    expect(() => registerProject({
      slug: 'product-alpha-copy',
      repoDir: productRepo,
      repositoryMode: 'SHARED_MONOREPO',
      scopeSelector: { module: 'ALPHA' },
      classification: 'PRODUCT_PROJECT',
    }, root)).toThrow(/already registered/);
  });

  it('enforces zero implicit coupling for an independent development-system project', () => {
    const root = temp('universal-independent-root');
    const dialRepo = makeRepo('universal-dial-repo');
    const ddeRepo = makeRepo('universal-dde-repo');
    ensureProjectRegistry(root, { dialRepoDir: dialRepo });
    const independence = {
      runtime_dependency_of_dial_development_system: false,
      authority_dependency_of_dial_development_system: false,
      shared_product_truth: false,
      shared_mutable_memory: false,
      shared_deployment_lifecycle: false,
    };
    const dde = registerProject({
      slug: 'dde',
      name: 'DDE',
      repoDir: ddeRepo,
      classification: 'INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT',
      independence,
    }, root);
    expect(dde.classification).toBe('INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT');
    expect(dde.independence).toEqual(independence);

    expect(() => registerProject({
      slug: 'coupled-dev-system',
      repoDir: makeRepo('coupled-system'),
      classification: 'INDEPENDENT_DEVELOPMENT_SYSTEM_PROJECT',
      independence: { ...independence, shared_mutable_memory: true },
    }, root)).toThrow(/cannot share DIAL runtime, authority, truth, mutable memory or deployment lifecycle/);
  });

  it('makes reusable auxiliary intelligence project-generic while retaining DIAL-only local archetypes', () => {
    const shared = archetypesFor('customer-field-app');
    expect(shared.has('SOURCE_INTELLIGENCE')).toBe(true);
    expect(shared.has('VEKL_SYNTHESIS')).toBe(true);
    expect(shared.has('SUPPLIER_RESEARCH')).toBe(false);

    const task = {
      project: 'customer-field-app',
      authority: HAIF_AUTHORITY,
      budget_policy: HAIF_BUDGET_POLICY,
      task_archetype: 'SOURCE_INTELLIGENCE',
      required_capabilities: { tools: false },
      allow_repository_writes: false,
      purpose: 'Compare admitted public engineering sources.',
    };
    expect(assertAuxiliaryAuthority(task, { expectedProject: 'customer-field-app' })).toBe(task);
    expect(r2ObjectKey({
      project: 'customer-field-app',
      taskId: 'task-1',
      contentHash: 'a'.repeat(64),
    })).toMatch(/^haif\/customer-field-app\/evidence\//);
  });

  it('does not install, control or use DDE as the DIAL frontend/HAIF runtime', () => {
    const installer = fs.readFileSync(path.join(repoRoot, 'deploy/oracle/hermes-codex/install-haif.sh'), 'utf8');
    expect(installer).not.toContain('dde-hermes-haif.service');
    expect(installer).not.toContain('HAIF_PROJECT=dde');
    expect(installer).not.toContain('.dde-control');

    const frontend = fs.readFileSync(
      path.join(repoRoot, 'docs/dial/architecture/CANONICAL_FRONTEND_GENERATION_ARCHITECTURE.md'),
      'utf8',
    );
    expect(frontend).toContain('DIAL-NATIVE PRODUCTION BINDING');
    expect(frontend).toContain('## Independence from DDE');
    expect(frontend).not.toContain('DDE PRODUCTION BINDING');
    expect(frontend).not.toContain('## DDE productionization');
  });

  it('locks the separation in Project Truth and the Decision Log', () => {
    const truth = fs.readFileSync(path.join(repoRoot, 'agent-system/canon/PROJECT_TRUTH.md'), 'utf8');
    expect(truth).toContain('### Universal DIAL Development System and DDE independence lock');
    expect(truth).toContain('DDE is a separate independent development system');

    const decisions = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'agent-system/registries/DECISION_LOG.json'),
      'utf8',
    ));
    const decision = decisions.find((row) => row.decision_id === 'DEC-043');
    expect(decision?.status).toBe('LOCKED');
    expect(decision?.decision).toContain('two independent development systems');
  });
});
