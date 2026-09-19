import { describe, expect, it } from 'vitest';
import { inferResearchContexts } from '../agent-system/orchestration/vekl-research-seed.mjs';
import { COVERAGE_STATUSES } from '../agent-system/orchestration/vekl-research-contracts.mjs';
import fs from 'node:fs';

describe('VEKL research infrastructure hardening', () => {
  it('infers automation applicability from capabilities rather than literal n8n tags', () => {
    const ctx = inferResearchContexts(
      { technology_tags: ['PostgreSQL'], module_class: 'BACKEND_DOMAIN_SERVICE', engineering_questions: ['How should webhook retries and reconciliation be orchestrated?'] },
      { objective: 'Handle provider callbacks and retry failed reconciliation jobs', task_classes: ['INTEGRATION'], contracts_consumed: [], contracts_produced: [] },
      { feature_ids: ['PAY-F001'] },
    );
    expect(ctx.n8n_architecture_context.applicable).toBe(true);
    expect(ctx.n8n_architecture_context.applicability_reasons).toEqual(expect.arrayContaining(['RETRY_OR_IDEMPOTENCY','CALLBACK_OR_WEBHOOK','RECONCILIATION']));
    expect(ctx.n8n_architecture_context.classifier).toBe('SEMANTIC_CAPABILITY_INFERENCE_V2');
  });

  it('does not force automation context onto a pure deterministic calculation unit', () => {
    const ctx = inferResearchContexts(
      { technology_tags: ['TypeScript'], module_class: 'BACKEND_DOMAIN_SERVICE', engineering_questions: ['How should decimal arithmetic be validated?'] },
      { objective: 'Calculate a pure deterministic price from supplied inputs', task_classes: ['VALIDATION'], contracts_consumed: [], contracts_produced: [] },
      {},
    );
    expect(ctx.n8n_architecture_context.applicable).toBe(false);
    expect(ctx.n8n_architecture_context.applicability_reasons).toEqual([]);
  });

  it('carries the deep guided-frontend research contract', () => {
    const ctx = inferResearchContexts({ technology_tags: ['React'], module_class: 'WEB_CLIENT_SERVICE' }, {}, {});
    expect(ctx.guided_frontend_context.applicable).toBe(true);
    expect(ctx.guided_frontend_context.design_iteration_phase).toEqual(['EXPLORE','CONVERGE','RECONSTRUCT']);
    expect(ctx.guided_frontend_context.critic_taxonomy).toContain('IMPLEMENTATION_PARITY');
    expect(ctx.guided_frontend_context.freedom_budget_dimensions.length).toBeGreaterThan(3);
    expect(ctx.guided_frontend_context.reconstruction_requirements).toContain('NO_DEAD_CONTROLS');
    expect(ctx.guided_frontend_context.stitch_provider_evidence).toContain('ORCHESTRATED_EXECUTION');
  });

  it('supports explicit research maturity states', () => {
    expect(COVERAGE_STATUSES).toEqual(expect.arrayContaining([
      'FIRST_PASS_RESEARCHED','ANALYZED','DEEP_EVIDENCE_COMPLETE','QUALIFIED','ADMITTED',
    ]));
  });

  it('ships bounded deep-dispatch and reference-promotion services', () => {
    const deep = fs.readFileSync('deploy/oracle/vekl-worker/vekl-chatgpt-deep-dispatcher.mjs','utf8');
    const ref = fs.readFileSync('deploy/oracle/vekl-worker/vekl-reference-promoter.mjs','utf8');
    expect(deep).toContain("e.evidence_kind='GROQ_RESEARCH'");
    expect(deep).toContain("e.evidence_kind='DEEPER_EVIDENCE'");
    expect(ref).toContain('REFERENCE_LIGHTWEIGHT_V1');
    expect(ref).toContain("trust_tier='T1_OFFICIAL'");
  });
});
