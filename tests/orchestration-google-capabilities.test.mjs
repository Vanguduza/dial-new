import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANTIGRAVITY_PINNED_VERSION,
  antigravityBinaryStatus,
  antigravityRuntimeEnv,
  antigravityRuntimeHome,
  qualifyAntigravity,
  recordAntigravityDispatchOutcome,
  resolveAntigravityBinary,
} from '../agent-system/orchestration/providers/google/antigravity-adapter.mjs';
import {
  STITCH_ALLOWED_TOOLS,
  STITCH_MCP_URL,
  downloadStitchArtifact,
  qualifyStitch,
  stitchCredentialStatus,
  stitchHealth,
  stitchQualificationProofStatus,
  validateStitchArtifact,
} from '../agent-system/orchestration/providers/google/stitch-adapter.mjs';
import {
  POMELLI_GMPC_FEATURES,
  buildSanitizedBusinessDna,
  qualifyPomelliWorkstation,
} from '../agent-system/orchestration/providers/google/pomelli-workstation.mjs';
import {
  integrationClaimAllowed,
  loadExternalCapabilityRegistry,
} from '../agent-system/orchestration/providers/google/external-capability-core.mjs';
import {
  executeSelectedHcxWorker,
} from '../agent-system/orchestration/hcx-worker-executor.mjs';
import { readJson, writeJsonAtomic } from '../agent-system/orchestration/state-store.mjs';
import { executeAdaptiveSoloWithReroute } from '../agent-system/orchestration/adaptive-execution-runner.mjs';
import {
  admitStitchDesignStage,
  buildStitchDesignPrompt,
  executeStitchDesignStage,
  proveStitchOutageFallback,
  recordStitchScreenAcceptance,
  recordStitchUnitConsumption,
  resolveStitchFeatureContractProjection,
  resolveStitchVisualAuthorityProjection,
} from '../agent-system/orchestration/stitch-design-orchestration.mjs';
import { selectDesignStrategy } from '../agent-system/orchestration/design-provider-router.mjs';
import { quarantineDesignArtifact, sanitizeDesignArtifactForEvidence } from '../agent-system/orchestration/design-candidate-admission.mjs';

const repoDir = process.cwd();
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dial-google-cap-')); }

describe('Google external capability boundaries', () => {
  it('classifies Pomelli as GMPC-owned production creative capability', () => {
    const registry = loadExternalCapabilityRegistry(repoDir);
    const pomelli = registry.capabilities.find((row) => row.capability_id === 'CREATIVE-POMELLI');
    expect(pomelli.functional_owner).toBe('GMPC');
    expect(pomelli.provider_admission_only).toBe(true);
    expect(pomelli.role).toBe('GMPC_EXTERNAL_CREATIVE_PROVIDER');
    expect(POMELLI_GMPC_FEATURES).toContain('GMPC-F050');
    expect(POMELLI_GMPC_FEATURES).toContain('GMPC-F209');
  });

  it('never treats lower maturity evidence as integrated', () => {
    expect(integrationClaimAllowed({ status: 'LIVE_QUALIFIED', definition_of_done: { passed: true }, live_qualification: { passed: true }, orchestrated_use: { passed: false } })).toBe(false);
    expect(integrationClaimAllowed({ status: 'INTEGRATED', definition_of_done: { passed: true }, live_qualification: { passed: true }, orchestrated_use: { passed: true } })).toBe(true);
  });

  it('keeps Pomelli browser sessions outside DIAL custody', () => {
    const root = tempRoot();
    const prior = process.env.DIAL_POMELLI_INGEST_ENABLED;
    process.env.DIAL_POMELLI_INGEST_ENABLED = 'true';
    try {
      const status = qualifyPomelliWorkstation({ root });
      expect(status.functional_owner).toBe('GMPC');
      expect(status.authentication.session_material_stored).toBe(false);
      expect(status.status).toBe('AUTH_REQUIRED');
    } finally {
      if (prior === undefined) delete process.env.DIAL_POMELLI_INGEST_ENABLED;
      else process.env.DIAL_POMELLI_INGEST_ENABLED = prior;
    }
  });
  it('rejects private/customer data from Pomelli Business DNA', () => {
    const bad = buildSanitizedBusinessDna({ brand_name: 'DIAL', customer_email: 'x@example.com' });
    expect(bad.ok).toBe(false);
    expect(bad.findings.join(' ')).toMatch(/FORBIDDEN/);
  });

  it('uses a fixed Stitch MCP boundary and explicit credential state', () => {
    expect(STITCH_MCP_URL).toBe('https://stitch.googleapis.com/mcp');
    expect(stitchCredentialStatus({}).configured).toBe(false);
    expect(stitchCredentialStatus({ STITCH_API_KEY: 'x'.repeat(20) }).configured).toBe(true);
  });

  it('admits the live Stitch HTML export host exactly without widening to lookalike hosts', async () => {
    const fetchImpl = async () => new Response('<main>DIAL</main>', { status: 200, headers: { 'content-type': 'text/html' } });
    const artifact = await downloadStitchArtifact('https://contribution.usercontent.google.com/stitch/export', { fetchImpl, maxBytes: 1024 });
    expect(artifact.content_type).toBe('text/html');
    expect(artifact.byte_length).toBeGreaterThan(0);
    await expect(downloadStitchArtifact('https://contribution.usercontent.google.com.evil.example/stitch/export', { fetchImpl, maxBytes: 1024 })).rejects.toThrow('STITCH_ARTIFACT_URL_DENIED');
  });

  it('resolves canonical visual authority and forbids fabricated domain facts in the Stitch provider prompt', () => {
    const fdep = {
      task_id: 'prompt-test', unit_lineage_id: 'DU-LIN-test', unit_revision_hash: 'rev-test',
      product_design_profile: { profile: { profile_id: 'dial.spare' } },
      surface_manifest: { feature_ids: ['SPARE-F001'], surfaces: [{ surface_id: 'DIAL_WEB' }, { surface_id: 'DIAL_CONSUMER' }, { surface_id: 'WHATSAPP' }] },
      surface_state_matrix: { surfaces: [] },
      visual_reference_spec: { references: [{ reference_id: 'PREMIUM_SOLUTIONS_ENVIRONMENT', authority_level: 'CANONICAL_REFERENCE', required_fidelity: 'AUTHORITY_DEFINED' }] },
      presentation_decision: { execution_mode: 'ASSIMILATE' }, change_budget: {}, authority_constraints: { visual_authority_superior: true },
    };
    const resolved = resolveStitchVisualAuthorityProjection({ repoDir, fdep });
    expect(resolved.references[0]).toMatchObject({ reference_id: 'PREMIUM_SOLUTIONS_ENVIRONMENT', status: 'RESOLVED_CANONICAL_PROJECTION' });
    expect(resolved.references[0].projection_text).toContain('clean modern composition');
    expect(resolved.references[0].projection_text).toContain('fake dashboard metrics');
    const contract = resolveStitchFeatureContractProjection({ repoDir, fdep });
    expect(contract.features[0]).toMatchObject({ feature_id: 'SPARE-F001', outcome: 'Vehicle selection & garage', aggregate: 'VehicleProfile' });
    const prompt = buildStitchDesignPrompt({ repoDir, fdep, brief: { content_hash: 'b'.repeat(64) }, surfaceId: 'DIAL_WEB' });
    expect(prompt).toContain('ZERO FABRICATION');
    expect(prompt).toContain('literal VINs');
    expect(prompt).toContain('WCAG compliance');
    expect(prompt).toContain('Generate exactly one composition for this surface only');
    expect(prompt).toContain('Vehicle selection & garage');
    expect(prompt).toContain('not a governance dashboard');
    expect(prompt).toContain('PREMIUM_SOLUTIONS_ENVIRONMENT');
  });

  it('generates one governed Stitch composition per declared surface and binds them into one candidate', async () => {
    const root = tempRoot();
    const taskId = 'stitch-multi-surface-task';
    const envelopeHash = 'e'.repeat(64);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { task_id: taskId, envelope_hash: envelopeHash, state: 'READY' }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, {
      applicable: true, task_id: taskId, unit_lineage_id: 'unit-stitch-multi', unit_revision_hash: 'revision-stitch-multi', content_hash: 'f'.repeat(64),
      provenance: { frontend_projection_hash: 'p'.repeat(64) }, product_design_profile: { content_hash: '1'.repeat(64) },
      surface_manifest: { content_hash: '2'.repeat(64), feature_ids: ['SPARE-F001'], surfaces: [{ surface_id: 'DIAL_WEB' }, { surface_id: 'DIAL_CONSUMER' }, { surface_id: 'WHATSAPP' }] },
      surface_state_matrix: { content_hash: '3'.repeat(64), surfaces: ['DIAL_WEB','DIAL_CONSUMER','WHATSAPP'].map((surface_id) => ({ surface_id, states: [{ state_id: 'READY', requirement: 'REQUIRED' }, { state_id: 'ERROR', requirement: 'REQUIRED' }] })) },
      visual_reference_spec: { content_hash: '4'.repeat(64), references: [{ reference_id: 'PREMIUM_SOLUTIONS_ENVIRONMENT', authority_level: 'CANONICAL_REFERENCE', required_fidelity: 'AUTHORITY_DEFINED' }] },
      presentation_decision: { content_hash: '5'.repeat(64), execution_mode: 'SYNTHESIZE' }, visual_render_determinism_envelope: { content_hash: '6'.repeat(64) },
      change_budget: { content_hash: '7'.repeat(64), allowed_structural_delta: 'MINIMUM_NECESSARY', new_token_ids: [], new_component_ids: [], new_pattern_ids: [] }, authority_constraints: { project_truth_superior: true, provider_output_authoritative: false },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/design-brief-bundle.json`, { task_id: taskId, content_hash: 'b'.repeat(64), provenance: { projection_hash: 'p'.repeat(64) } }, root);
    const calls = [];
    const adapter = { health: async () => ({ state: 'HEALTHY', authenticated: true }), generate: async (input) => { calls.push(input); const id = `screen-${calls.length}`; return { screen_id: id, html_url: `https://storage.googleapis.com/dial/${id}.html`, image_url: `https://storage.googleapis.com/dial/${id}.png`, response_hash: id }; } };
    const artifactDownloader = async (url) => url.endsWith('.html') ? { body: Buffer.from('<main><h1>DIAL</h1><div>READY</div><div>ERROR</div></main>'), content_type: 'text/html' } : { body: Buffer.from([1,2,3,4]), content_type: 'image/png' };
    const stage = await executeStitchDesignStage({ repoDir, root, taskId, adapter, artifactDownloader, envelopeGuard: () => ({ ok: true, reasons: [] }), fdepGuard: () => ({ ok: true, reasons: [] }) });
    expect(calls).toHaveLength(3);
    expect(calls.map((call) => call.device_type)).toEqual(['DESKTOP','MOBILE','MOBILE']);
    expect(calls[0].prompt).toContain('TARGET_SURFACE=DIAL_WEB');
    expect(calls[1].prompt).toContain('TARGET_SURFACE=DIAL_CONSUMER');
    expect(calls[2].prompt).toContain('TARGET_SURFACE=WHATSAPP');
    expect(stage.surface_count).toBe(3);
    expect(stage.candidate.screen_refs).toHaveLength(3);
    expect(Object.keys(stage.artifacts.surfaces).sort()).toEqual(['DIAL_CONSUMER','DIAL_WEB','WHATSAPP']);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('converts active Stitch prototype scaffolding into inert evidence without weakening raw quarantine', () => {
    const raw = '<main onload="boot()"><img src="https://lh3.googleusercontent.com/example"><a href="https://example.com">View</a><script src="https://cdn.example.com/app.js">boot()</script><section style="background-image:url(https://example.com/bg.png)">DIAL</section></main>';
    const before = quarantineDesignArtifact({ content: raw });
    expect(before.ok).toBe(false);
    expect(before.violations).toEqual(expect.arrayContaining(['SCRIPT','EVENT_HANDLER','REMOTE_URL']));
    const inert = sanitizeDesignArtifactForEvidence({ content: raw });
    expect(inert.transformed).toBe(true);
    expect(inert.raw_quarantine.ok).toBe(false);
    expect(inert.ok).toBe(true);
    expect(inert.sanitized_quarantine.violations).toEqual([]);
    expect(inert.content).not.toMatch(/<script\b|\son[a-z]+\s*=|https?:\/\//i);
  });

  it('selects Stitch only when explicitly preferred and preserves direct fallback when unavailable', () => {
    const ordinary = selectDesignStrategy({ designMode: 'NEW_DIAL_DESIGN', stitchEnabled: true, stitchEligible: true, directWorkerEligible: true, providerHealth: 'HEALTHY' });
    expect(ordinary.selected).toBe('DIRECT_DIAL_IMPLEMENTATION');
    const specialist = selectDesignStrategy({ designMode: 'NEW_DIAL_DESIGN', stitchEnabled: true, stitchEligible: true, directWorkerEligible: true, providerHealth: 'HEALTHY', preference: 'STITCH' });
    expect(specialist.selected).toBe('STITCH_NEW_DESIGN_THEN_BUILD');
    const outage = selectDesignStrategy({ designMode: 'NEW_DIAL_DESIGN', stitchEnabled: true, stitchEligible: true, directWorkerEligible: true, providerHealth: 'UNAVAILABLE', preference: 'STITCH' });
    expect(outage.selected).toBe('DIRECT_DIAL_IMPLEMENTATION');
  });

  it('binds Stitch stage, admission, AEF consumption, real-screen certification and qualification proofs to one repository SHA', async () => {
    const root = tempRoot();
    const taskId = 'stitch-proof-task';
    const envelopeHash = 'e'.repeat(64);
    const fdepHash = 'f'.repeat(64);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { task_id: taskId, envelope_hash: envelopeHash, state: 'READY' }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/frontend-design-execution-packet.json`, {
      applicable: true,
      task_id: taskId,
      unit_lineage_id: 'unit-stitch-proof',
      unit_revision_hash: 'revision-stitch-proof',
      content_hash: fdepHash,
      provenance: { frontend_projection_hash: 'p'.repeat(64) },
      product_design_profile: { content_hash: '1'.repeat(64) },
      surface_manifest: { content_hash: '2'.repeat(64), surfaces: [{ surface_id: 'screen-main' }] },
      surface_state_matrix: { content_hash: '3'.repeat(64), surfaces: [{ surface_id: 'screen-main', states: [{ state_id: 'READY', requirement: 'REQUIRED' }] }] },
      visual_reference_spec: { content_hash: '4'.repeat(64), references: [] },
      presentation_decision: { content_hash: '5'.repeat(64), execution_mode: 'SYNTHESIZE' },
      visual_render_determinism_envelope: { content_hash: '6'.repeat(64) },
      change_budget: { content_hash: '7'.repeat(64), allowed_structural_delta: 'NONE', new_token_ids: [], new_component_ids: [], new_pattern_ids: [] },
      authority_constraints: { project_truth_superior: true, provider_output_authoritative: false },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/design-brief-bundle.json`, { task_id: taskId, content_hash: 'b'.repeat(64), provenance: { projection_hash: 'p'.repeat(64) } }, root);

    const adapter = {
      health: async () => ({ state: 'HEALTHY', authenticated: true }),
      generate: async () => ({ screen_id: 'screen-1', html_url: 'https://storage.googleapis.com/dial/stitch.html', image_url: 'https://storage.googleapis.com/dial/stitch.png', response_hash: 'r'.repeat(64) }),
    };
    const artifactDownloader = async (url) => url.endsWith('.html')
      ? { body: Buffer.from('<main><h1>DIAL</h1><button disabled>Ready</button></main>'), content_type: 'text/html' }
      : { body: Buffer.from([1, 2, 3, 4]), content_type: 'image/png' };
    const stage = await executeStitchDesignStage({ repoDir, root, taskId, adapter, artifactDownloader, envelopeGuard: () => ({ ok: true, reasons: [] }), fdepGuard: () => ({ ok: true, reasons: [] }) });
    expect(stage.route.selected).toBe('STITCH_NEW_DESIGN_THEN_BUILD');
    expect(stage.repository_sha).toMatch(/^[0-9a-f]{40}$/);
    const accepted = admitStitchDesignStage({
  repoDir,
  root,
  taskId,
  evidence: { authority_conforms: true, required_states_present: true, change_budget_satisfied: true, donor_semantics_preserved: true, design_candidate_facts: {} },
  envelopeGuard: () => ({ ok: true, reasons: [] }),
  fdepGuard: () => ({ ok: true, reasons: [] }),
});
    const consumed = recordStitchUnitConsumption({ repoDir, root, taskId, workerArtifactId: 'artifact-worker-1', envelopeHash });
    const visualGates = ['V1_STRUCTURAL','V2_GEOMETRY','V3_TYPOGRAPHY','V4_ASSETS','V5_PERCEPTUAL','V6_DELTA_PROVENANCE','V7_RESPONSIVE_IDENTITY','V8_AUTHORITY_SIGNOFF'].map((gate_id) => ({ gate_id, state: 'PASSED' }));
    const certified = recordStitchScreenAcceptance({ repoDir, root, taskId, certification: { ok: true, status: 'PASSED', task_id: taskId, fdep_hash: fdepHash, content_hash: 'c'.repeat(64), accessibility: true, security: true, state_matrix_coverage: true, vrde_comparable: true, visual_gates: visualGates } });
    const fallback = proveStitchOutageFallback({ repoDir, root });
    expect(accepted.repository_sha).toBe(stage.repository_sha);
    expect(consumed.repository_sha).toBe(stage.repository_sha);
    expect(certified.repository_sha).toBe(stage.repository_sha);
    expect(fallback.repository_sha).toBe(stage.repository_sha);
    let proofs = stitchQualificationProofStatus(root, repoDir);
    expect(proofs.visual_acceptance.passed).toBe(true);
    expect(proofs.orchestrated_use.passed).toBe(true);
    expect(proofs.outage_fallback.passed).toBe(true);

    const clientFactory = () => ({
      client: { listTools: async () => ({ tools: STITCH_ALLOWED_TOOLS.map((name) => ({ name })) }), close: async () => {} },
      sdk: { createProject: async () => ({ projectId: 'project-q', generate: async () => ({ screenId: 'screen-q', getHtml: async () => 'https://storage.googleapis.com/dial/q.html', getImage: async () => 'https://storage.googleapis.com/dial/q.png' }) }) },
      credentials: { configured: true },
    });
    const fetchImpl = async (url) => new Response(String(url).endsWith('.html') ? '<main onload="boot()"><h1>Qualification</h1><img src="https://lh3.googleusercontent.com/q"><script>boot()</script><button disabled>Ready</button></main>' : Buffer.from([9, 8, 7]), { status: 200, headers: { 'content-type': String(url).endsWith('.html') ? 'text/html' : 'image/png' } });
    const qualified = await qualifyStitch({ root, repoDir, env: { DIAL_STITCH_ENABLED: 'true', DIAL_STITCH_LIVE_TESTS_ENABLED: 'true', STITCH_API_KEY: 'x'.repeat(20) }, clientFactory, fetchImpl });
    expect(qualified.status).toBe('INTEGRATED');
    expect(qualified.definition_of_done.passed).toBe(true);
    expect(qualified.orchestrated_use.passed).toBe(true);
    expect(qualified.live_qualification.inert_evidence_transformed).toBe(true);
    expect(qualified.live_qualification.raw_quarantine_violations).toEqual(expect.arrayContaining(['SCRIPT','EVENT_HANDLER','REMOTE_URL']));

    const stale = { ...proofs.visual_acceptance.evidence, repository_sha: '0'.repeat(40) };
    writeJsonAtomic('operations/external-capabilities/design-stitch/proofs/real-screen-acceptance.json', stale, root);
    proofs = stitchQualificationProofStatus(root, repoDir);
    expect(proofs.visual_acceptance.passed).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('projects DEC-033 Stitch readiness as required, not setup-optional', () => {
    const policy = JSON.parse(fs.readFileSync(path.join(repoDir, 'agent-system/registries/DESIGN_PROVIDER_POLICY.json'), 'utf8'));
    expect(policy.readiness_ref).toBe('DEC-033');
    expect(policy.readiness_required).toBe(true);
    expect(policy.stitch_optional).toBe(false);
    expect(policy.providers['google-stitch'].optional).toBe(false);
  });

  it('quarantines an unexpected live Stitch tool instead of expanding authority', async () => {
    const clientFactory = () => ({
      client: {
        listTools: async () => ({ tools: [...STITCH_ALLOWED_TOOLS.map((name) => ({ name })), { name: 'surprise_admin_tool' }] }),
        close: async () => {},
      },
      sdk: {},
      credentials: { configured: true },
    });
    const health = await stitchHealth({ env: { DIAL_STITCH_ENABLED: 'true', STITCH_API_KEY: 'x'.repeat(20) }, clientFactory });
    expect(health.state).toBe('QUARANTINED');
    expect(health.unexpected_tools).toEqual(['surprise_admin_tool']);
  });
  it('isolates Antigravity from the owner Google credential plane', () => {
    const env = {
      DIAL_CONTROL_HOME: '/tmp/dial-control',
      GOOGLE_API_KEY: 'forbidden',
      GEMINI_API_KEY: 'forbidden',
      GOOGLE_APPLICATION_CREDENTIALS: '/tmp/forbidden.json',
      CLOUDSDK_CONFIG: '/tmp/forbidden-cloudsdk',
      GOOGLE_CLOUD_PROJECT: 'forbidden-project',
      GOOGLE_CLOUD_PROJECT_ID: 'forbidden-project-id',
      PATH: process.env.PATH,
    };
    expect(antigravityRuntimeHome(env)).toBe('/tmp/dial-control/identities/antigravity-worker');
    const isolated = antigravityRuntimeEnv(env);
    expect(isolated.HOME).toBe('/tmp/dial-control/identities/antigravity-worker');
    expect(isolated.XDG_CONFIG_HOME).toBe('/tmp/dial-control/identities/antigravity-worker/.config');
    expect(isolated.AGY_CLI_DISABLE_AUTO_UPDATE).toBe('true');
    for (const key of ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_CONFIG', 'GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT_ID']) expect(isolated[key]).toBeUndefined();
  });

  it('classifies Antigravity binary state without claiming authentication', async () => {
    const runner = async (_command, args) => args.includes('--version')
      ? { ok: true, stdout: `agy ${ANTIGRAVITY_PINNED_VERSION}\n`, stderr: '', error: null }
      : { ok: false, stdout: '', stderr: 'Authentication required. Please login.', error: null };
    const binary = await antigravityBinaryStatus({ runner });
    expect(binary.installed).toBe(true);
    expect(binary.version).toBe(ANTIGRAVITY_PINNED_VERSION);
    expect(binary.exact_pinned_version).toBe(true);
    const root = tempRoot();
    const prior = process.env.DIAL_ANTIGRAVITY_ENABLED;
    process.env.DIAL_ANTIGRAVITY_ENABLED = 'true';
    try {
      const qualified = await qualifyAntigravity({ repoDir, root, runner });
      expect(qualified.status).toBe('AUTH_REQUIRED');
      expect(qualified.authentication.verified).toBe(false);
      expect(qualified.definition_of_done.passed).toBe(false);
    } finally {
      if (prior === undefined) delete process.env.DIAL_ANTIGRAVITY_ENABLED;
      else process.env.DIAL_ANTIGRAVITY_ENABLED = prior;
    }
  });


  it('qualifies every live-discovered Antigravity pairing and preserves per-model capacity state', async () => {
    const root = tempRoot();
    const seen = [];
    const runner = async (_command, args) => {
      if (args.includes('--version')) return { ok: true, stdout: `agy ${ANTIGRAVITY_PINNED_VERSION}\n`, stderr: '', error: null };
      if (args[0] === 'models') return { ok: true, stdout: 'gemini-3.8-flash-low Gemini 3.8 Flash (Low)\nclaude-sonnet-4-6 Claude Sonnet 4.6 (Thinking)\n', stderr: '', error: null };
      const model = args[args.indexOf('--model') + 1];
      seen.push(model);
      if (model === 'gemini-3.8-flash-low') return { ok: true, stdout: JSON.stringify({ status: 'SUCCESS', response: 'DIAL_ANTIGRAVITY_CANARY_OK' }), stderr: '', error: null };
      return { ok: false, stdout: '', stderr: 'RESOURCE_EXHAUSTED individual quota exhausted', error: null };
    };
    const qualified = await qualifyAntigravity({ repoDir, root, runner, env: { ...process.env, DIAL_ANTIGRAVITY_ENABLED: 'true' }, probeAllModels: true, pairingTimeoutMs: 1000 });
    expect(seen.sort()).toEqual(['claude-sonnet-4-6', 'gemini-3.8-flash-low']);
    expect(qualified.status).toBe('LIVE_QUALIFIED');
    expect(qualified.pairing_qualification.checked_all).toBe(true);
    expect(qualified.pairing_qualification.counts).toEqual({ total: 2, healthy: 1, degraded: 1 });
    const availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-low'].health_state).toBe('HEALTHY');
    expect(availability.models['claude-sonnet-4-6'].quota_state).toBe('EXHAUSTED');
    expect(availability.harnesses.antigravity.health_state).toBe('HEALTHY');
    expect(availability.harnesses.antigravity.healthy_model_count).toBe(1);
  });

  it('keeps capacity-limited Antigravity models out of healthy routing state', async () => {
    const root = tempRoot();
    const runner = async (_command, args) => {
      if (args.includes('--version')) return { ok: true, stdout: `agy ${ANTIGRAVITY_PINNED_VERSION}\n`, stderr: '', error: null };
      if (args[0] === 'models') return { ok: true, stdout: 'gemini-3.8-flash-low Gemini 3.8 Flash (Low)\ngemini-3.7-flash-low Gemini 3.7 Flash (Low)\n', stderr: '', error: null };
      return { ok: false, stdout: '', stderr: 'RESOURCE_EXHAUSTED individual quota exhausted', error: null };
    };
    const qualified = await qualifyAntigravity({ repoDir, root, runner, env: { ...process.env, DIAL_ANTIGRAVITY_ENABLED: 'true' } });
    expect(qualified.status).toBe('DEGRADED');
    expect(qualified.authentication.verified).toBe(true);
    expect(qualified.live_qualification.failure_class).toBe('CAPACITY_LIMITED');
    const availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-low'].health_state).toBe('DEGRADED');
    expect(availability.models['gemini-3.8-flash-low'].quota_state).toBe('EXHAUSTED');
    expect(availability.models['gemini-3.7-flash-low'].health_state).toBe('UNKNOWN');
    expect(availability.harnesses.antigravity.health_state).toBe('DEGRADED');
    expect(availability.harnesses.antigravity.healthy_model_count).toBe(0);
  });

  it('reroutes a retryable worker failure through a fresh task and replacement envelope', async () => {
    const root = tempRoot();
    let planned = 0;
    let executed = 0;
    const planner = () => {
      planned += 1;
      const taskId = `task-reroute-${planned}`;
      const modelId = planned === 1 ? 'model-a' : 'model-b';
      const plan = {
        task_id: taskId, topology: 'SOLO', packet_id: 'packet-reroute',
        compute: { reservation: { reservation_id: `cmp-${planned}` } },
        routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: `antigravity-worker-current:${modelId}`, model: { model_id: modelId } }] },
      };
      writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, plan, root);
      writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { task_id: taskId, packet_id: 'packet-reroute', envelope_hash: `env-${planned}`, allowed_paths: ['packages/example/**'], denied_paths: [], state: 'READY' }, root);
      return plan;
    };
    const result = await executeAdaptiveSoloWithReroute({
      repoDir, root, packetId: 'packet-reroute', instruction: 'test reroute', allowedPaths: ['packages/example/**'], worktreePath: repoDir, maxAttempts: 2, planner,
      leaseIssuer: ({ taskId, workerId }) => ({ ok: true, lease: { lease_id: `lease-${taskId}`, task_id: taskId, worker_id: workerId, worktree_path: repoDir, write_paths: ['packages/example/**'], denied_paths: [], fencing_token: planned, state: 'ACTIVE' } }),
      executor: async ({ taskId }) => {
        executed += 1;
        if (executed === 1) { const error = new Error('capacity'); error.category = 'CAPACITY_LIMITED'; throw error; }
        return { ok: true, task_id: taskId, state: 'VERIFYING' };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.fallback_used).toBe(true);
    expect(result.attempts.map((row) => row.model_id)).toEqual(['model-a', 'model-b']);
    expect(readJson('execution/tasks/task-reroute-2/envelope.json', null, root)).toMatchObject({ replacement_for_task_id: 'task-reroute-1', reroute_attempt: 2 });
  });

  it('records live Antigravity dispatch capacity state per discovered model', () => {
    const root = tempRoot();
    writeJsonAtomic('state/model-availability.json', {
      models: {
        'gemini-3.8-flash-high': { model_id: 'gemini-3.8-flash-high', harness_id: 'antigravity', subscription_present: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' },
        'claude-sonnet-4-6': { model_id: 'claude-sonnet-4-6', harness_id: 'antigravity', subscription_present: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' },
      },
      harnesses: { antigravity: { authenticated: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' } },
    }, root);
    recordAntigravityDispatchOutcome({ root, modelId: 'gemini-3.8-flash-high', failureClass: 'CAPACITY_LIMITED', observedAt: '2026-09-15T16:00:00.000Z' });
    let availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-high'].health_state).toBe('DEGRADED');
    expect(availability.models['gemini-3.8-flash-high'].quota_state).toBe('EXHAUSTED');
    expect(availability.harnesses.antigravity.health_state).toBe('HEALTHY');
    expect(availability.harnesses.antigravity.healthy_model_count).toBe(1);
    recordAntigravityDispatchOutcome({ root, modelId: 'gemini-3.8-flash-high', passed: true, observedAt: '2026-09-15T16:01:00.000Z' });
    availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['gemini-3.8-flash-high'].health_state).toBe('HEALTHY');
    expect(availability.models['gemini-3.8-flash-high'].quota_state).toBe('AVAILABLE');
  });

  it('executes Antigravity only through a selected AEF worker with current envelope and lease bindings', async () => {
    const root = tempRoot();
    const taskId = 'task-antigravity-selected';
    const packetId = 'packet-antigravity-selected';
    const worktreePath = repoDir;
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: 'antigravity-worker-current' }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
      task_id: taskId,
      packet_id: packetId,
      envelope_hash: 'env-hash',
      allowed_paths: ['packages/example/**'],
      denied_paths: ['agent-system/canon/**'],
      state: 'READY',
    }, root);
    let seenEnv = null;
    const result = await executeSelectedHcxWorker({
      repoDir,
      root,
      taskId,
      harnessId: 'antigravity-worker',
      instruction: 'Make the bounded test change.',
      worktreePath,
      leaseId: 'lease-1',
      fencingToken: 9,
      admissionGuard: () => ({ ok: true }),
      envelopeChecker: ({ envelope }) => envelope.state === 'SUPERSEDED'
        ? { ok: false, reasons: ['ENVELOPE_SUPERSEDED'] }
        : { ok: true, reasons: [] },
      leaseGuard: () => ({
        lease_id: 'lease-1', task_id: taskId, worker_id: 'antigravity-worker-current',
        worktree_path: worktreePath, write_paths: ['packages/example/**'],
        denied_paths: ['agent-system/canon/**'], fencing_token: 9,
      }),
      activationLoader: () => ({ activation_id: 'act-1' }),
      deliveryBuilder: () => ({ text: 'bounded VEKL worker delivery' }),
      antigravityRunner: async ({ env }) => {
        seenEnv = env;
        return { provider: 'google-antigravity', result_hash: 'result-hash', response: 'done', usage: null, conversation_id: 'c1' };
      },
      artifactPersister: () => ({ artifact_id: 'ART-1', artifact_hash: 'artifact-hash' }),
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('VERIFYING');
    expect(seenEnv.DIAL_TASK_ID).toBe(taskId);
    expect(seenEnv.DIAL_EXECUTION_ENVELOPE_HASH).toBe('env-hash');
    expect(seenEnv.DIAL_WORKTREE_LEASE_ID).toBe('lease-1');
    expect(seenEnv.DIAL_FENCING_TOKEN).toBe('9');
    expect(readJson(`execution/tasks/${taskId}/envelope.json`, null, root).state).toBe('VERIFYING');
  });

  it('executes the secondary Claude Pro pool with its isolated profile and no manager authority', async () => {
    const root = tempRoot();
    const taskId = 'task-claude-secondary-selected';
    const packetId = 'packet-claude-secondary-selected';
    const worktreePath = repoDir;
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{
        harness_id: 'claude-sonnet-worker-secondary',
        worker_identity_hash: 'claude-sonnet-worker-secondary-pro-current',
        model: { model_id: 'claude-sonnet-5' },
        runtime_profile: {
          profile_id: 'secondary', health_slot: 'claude_code_secondary',
          config_dir_ref: 'DIAL_CLAUDE_SECONDARY_CONFIG_DIR',
          default_config_dir: '/var/lib/dial-control/secrets/claude-worker-secondary',
        },
      }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
      task_id: taskId, packet_id: packetId, envelope_hash: 'env-secondary',
      allowed_paths: ['packages/example/**'], denied_paths: ['agent-system/canon/**'], state: 'READY',
    }, root);
    let dispatch = null;
    const result = await executeSelectedHcxWorker({
      repoDir, root, taskId, harnessId: 'claude-sonnet-worker-secondary', instruction: 'Make the bounded test change.',
      worktreePath, leaseId: 'lease-secondary', fencingToken: 12,
      env: { ...process.env, DIAL_CLAUDE_SECONDARY_CONFIG_DIR: '/tmp/isolated-secondary-claude' },
      admissionGuard: () => ({ ok: true }), envelopeChecker: () => ({ ok: true, reasons: [] }), modelAvailabilityGuard: () => ({ ok: true }),
      leaseGuard: () => ({ lease_id: 'lease-secondary', task_id: taskId, worker_id: 'claude-sonnet-worker-secondary-pro-current', worktree_path: worktreePath, write_paths: ['packages/example/**'], denied_paths: ['agent-system/canon/**'], fencing_token: 12 }),
      activationLoader: () => ({ activation_id: 'act-secondary' }), deliveryBuilder: () => ({ text: 'bounded VEKL worker delivery' }),
      claudeRunner: async (args) => { dispatch = args; return { provider: 'anthropic-claude-code', result_hash: 'secondary-result', response: 'done', usage: null }; },
      artifactPersister: () => ({ artifact_id: 'ART-SECONDARY', artifact_hash: 'artifact-secondary' }),
    });
    expect(result.ok).toBe(true);
    expect(dispatch.profileId).toBe('secondary');
    expect(dispatch.runtimeId).toBe('claude_code_secondary');
    expect(dispatch.configDir).toBe('/tmp/isolated-secondary-claude');
    expect(dispatch.prompt).toContain('DIAL HCX CLAUDE WORKER');
    expect(dispatch.prompt).not.toContain('HERMES FALLBACK RUNTIME');
  });

  it('feeds Antigravity provider failure into model health and revokes the failed lease', async () => {
    const root = tempRoot();
    const taskId = 'task-antigravity-capacity';
    const packetId = 'packet-antigravity-capacity';
    const worktreePath = repoDir;
    writeJsonAtomic('state/model-availability.json', {
      models: { 'claude-opus-4-6-thinking': { model_id: 'claude-opus-4-6-thinking', harness_id: 'antigravity', subscription_present: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' } },
      harnesses: { antigravity: { authenticated: true, health_state: 'HEALTHY', quota_state: 'AVAILABLE' } },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: 'antigravity-worker-current:claude-opus-4-6-thinking', model: { model_id: 'claude-opus-4-6-thinking' } }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, { task_id: taskId, packet_id: packetId, envelope_hash: 'env-capacity', allowed_paths: ['packages/example/**'], denied_paths: [], state: 'READY' }, root);
    const closed = [];
    await expect(executeSelectedHcxWorker({
      repoDir, root, taskId, harnessId: 'antigravity-worker', instruction: 'test', worktreePath, leaseId: 'lease-capacity', fencingToken: 11,
      admissionGuard: () => ({ ok: true }), envelopeChecker: () => ({ ok: true, reasons: [] }), modelAvailabilityGuard: () => ({ ok: true }),
      leaseGuard: () => ({ lease_id: 'lease-capacity', task_id: taskId, worker_id: 'antigravity-worker-current:claude-opus-4-6-thinking', worktree_path: worktreePath, write_paths: ['packages/example/**'], denied_paths: [], fencing_token: 11 }),
      leaseCloser: (args) => { closed.push(args); return { state: args.state }; }, activationLoader: () => ({ activation_id: 'act-capacity' }), deliveryBuilder: () => ({ text: 'delivery' }),
      antigravityRunner: async () => { const error = new Error('ANTIGRAVITY_CAPACITY_LIMITED'); error.category = 'CAPACITY_LIMITED'; throw error; },
    })).rejects.toThrow(/ANTIGRAVITY_CAPACITY_LIMITED/);
    const availability = readJson('state/model-availability.json', {}, root);
    expect(availability.models['claude-opus-4-6-thinking'].quota_state).toBe('EXHAUSTED');
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ leaseId: 'lease-capacity', state: 'REVOKED' });
    const envelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
    expect(envelope).toMatchObject({ state: 'SUPERSEDED', superseded_reason: 'WORKER_FAILURE:CAPACITY_LIMITED', worker_failure_class: 'CAPACITY_LIMITED', worker_model_id: 'claude-opus-4-6-thinking' });
  });

  it('rejects a late Antigravity result after owner supersession without overwriting SUPERSEDED', async () => {
    const root = tempRoot();
    const taskId = 'task-antigravity-superseded';
    const packetId = 'packet-antigravity-superseded';
    const worktreePath = repoDir;
    writeJsonAtomic(`execution/tasks/${taskId}/plan.json`, {
      routing: { selected_workers: [{ harness_id: 'antigravity-worker', worker_identity_hash: 'antigravity-worker-current' }] },
    }, root);
    writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
      task_id: taskId,
      packet_id: packetId,
      envelope_hash: 'env-hash-2',
      allowed_paths: ['packages/example/**'], denied_paths: [], state: 'READY',
    }, root);
    await expect(executeSelectedHcxWorker({
      repoDir,
      root,
      taskId,
      harnessId: 'antigravity-worker',
      instruction: 'test',
      worktreePath,
      leaseId: 'lease-2',
      fencingToken: 10,
      admissionGuard: () => ({ ok: true }),
      envelopeChecker: ({ envelope }) => envelope.state === 'SUPERSEDED'
        ? { ok: false, reasons: ['ENVELOPE_SUPERSEDED'] }
        : { ok: true, reasons: [] },
      leaseGuard: () => ({
        lease_id: 'lease-2', task_id: taskId, worker_id: 'antigravity-worker-current',
        worktree_path: worktreePath, write_paths: ['packages/example/**'], denied_paths: [], fencing_token: 10,
      }),
      activationLoader: () => ({ activation_id: 'act-2' }),
      deliveryBuilder: () => ({ text: 'delivery' }),
      antigravityRunner: async () => {
        const current = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
        writeJsonAtomic(`execution/tasks/${taskId}/envelope.json`, {
          ...current, state: 'SUPERSEDED', superseded_reason: 'OWNER_STEER:test',
        }, root);
        return { provider: 'google-antigravity', result_hash: 'late-result', response: 'late', usage: null };
      },
      artifactPersister: () => { throw new Error('late result must never be admitted'); },
    })).rejects.toThrow(/HCX_RESULT_ENVELOPE_STALE/);
    const finalEnvelope = readJson(`execution/tasks/${taskId}/envelope.json`, null, root);
    expect(finalEnvelope.state).toBe('SUPERSEDED');
    expect(finalEnvelope.superseded_reason).toBe('OWNER_STEER:test');
  });

  it('quarantines unsafe Stitch HTML before it can become design evidence', () => {
    const result = validateStitchArtifact({ html: '<html><script src="https://evil.example/x.js"></script></html>' });
    expect(result.ok).toBe(false);
    expect(result.manifest).toBe(null);
  });
});
