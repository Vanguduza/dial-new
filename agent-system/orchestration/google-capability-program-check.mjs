import fs from 'node:fs';
import path from 'node:path';
import {
  integrationClaimAllowed,
  loadExternalCapabilityRegistry,
  readCapabilityEvidence,
} from './providers/google/external-capability-core.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || path.join(repoDir, '.dial-control-test');
const liveRequired = process.argv.includes('--require-live');

function exists(rel) { return fs.existsSync(path.join(repoDir, rel)); }
function text(rel) { return fs.readFileSync(path.join(repoDir, rel), 'utf8'); }
function json(rel) { return JSON.parse(text(rel)); }

const gates = [];
function gate(id, ok, detail) { gates.push({ id, ok: Boolean(ok), detail }); }

const registry = loadExternalCapabilityRegistry(repoDir);
const byId = Object.fromEntries(registry.capabilities.map((row) => [row.capability_id, row]));
const requiredIds = ['DEV-ANTIGRAVITY', 'DESIGN-STITCH', 'CREATIVE-POMELLI'];
gate('G01', requiredIds.every((id) => byId[id]), 'three explicit external capabilities registered');
gate('G02', byId['CREATIVE-POMELLI']?.functional_owner === 'GMPC', 'Pomelli functional owner is GMPC');
gate('G03', byId['CREATIVE-POMELLI']?.provider_admission_only === true, 'shared registry stores Pomelli admission state only');
const gmpcPolicy = json('agent-system/registries/GMPC_EXTERNAL_CREATIVE_PROVIDER_POLICY.json');
const boundFeatures = new Set(Object.values(gmpcPolicy.feature_bindings).flat());
gate('G04', ['GMPC-F050','GMPC-F051','GMPC-F052','GMPC-F053','GMPC-F060','GMPC-F061','GMPC-F062','GMPC-F140','GMPC-F170','GMPC-F180','GMPC-F181','GMPC-F202','GMPC-F209'].every((id) => boundFeatures.has(id)), 'Pomelli maps into existing GMPC feature authorities');
gate('G05', gmpcPolicy.browser_cookie_automation === 'FORBIDDEN' && gmpcPolicy.ui_scraping_as_api === 'FORBIDDEN', 'Pomelli browser/session automation forbidden');
gate('G06', exists('.agents/plugins/dial-governed/plugin.json') && exists('.agents/plugins/dial-governed/hooks.json'), 'Antigravity workspace plugin and hooks present');
gate('G07', exists('agent-system/orchestration/providers/google/antigravity-adapter.mjs') && exists('agent-system/orchestration/providers/google/antigravity-hook.mjs'), 'Antigravity governed adapter present');
gate('G16', exists('deploy/oracle/hermes-codex/install-google-antigravity.sh') && text('deploy/oracle/hermes-codex/install-google-antigravity.sh').includes('VERSION=\"1.2.0\"') && text('deploy/oracle/hermes-codex/install-google-antigravity.sh').includes('sha256sum -c'), 'Antigravity Oracle install is exact-version and digest pinned');
gate('G17', exists('agent-system/orchestration/hcx-worker-executor.mjs') && text('agent-system/orchestration/hcx-worker-executor.mjs').includes('HCX_RESULT_ENVELOPE_STALE') && text('agent-system/orchestration/hcx-worker-executor.mjs').includes('DIAL_FENCING_TOKEN'), 'selected Antigravity worker has a current-envelope, fenced HCX execution path');
gate('G08', text('agent-system/orchestration/providers/google/stitch-adapter.mjs').includes("https://stitch.googleapis.com/mcp"), 'Stitch uses fixed official MCP host');
gate('G09', json('package.json').dependencies?.['@google/stitch-sdk'] === '0.3.5', 'Stitch SDK is exact pinned');
gate('G10', exists('packages/gmpc-creative-providers/src/pomelli.ts'), 'GMPC-owned Pomelli production governance package present');
gate('G11', text('packages/gmpc-creative-providers/src/pomelli.ts').includes('COMMERCIAL_CLAIM_WITHOUT_CANONICAL_SNAPSHOT'), 'commercial creative requires canonical GMPC binding');
gate('G12', text('packages/gmpc-creative-providers/src/pomelli.ts').includes("next.state = 'REVOKED'"), 'GMPC revocation overrides publishability');
const canonicalDoc = 'docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_GOOGLE_EXTERNAL_CAPABILITIES_REV3_CANONICAL.md';
gate('G13', exists(canonicalDoc), 'consolidated canonical document present');
const projectTruth = text('agent-system/canon/PROJECT_TRUTH.md');
gate('G14', projectTruth.includes('DEC-031') && projectTruth.includes('Antigravity') && projectTruth.includes('Pomelli') && projectTruth.includes('Stitch'), 'Project Truth contains Google capability lock');
const decisions = json('agent-system/registries/DECISION_LOG.json');
gate('G15', decisions.some((row) => row.decision_id === 'DEC-031' && row.status === 'LOCKED'), 'DEC-031 locked');

const evidence = Object.fromEntries(requiredIds.map((id) => [id, readCapabilityEvidence(root, id)]));
for (const [id, artifact] of Object.entries(evidence)) {
  if (artifact?.status === 'INTEGRATED') {
    gate(`CLAIM-${id}`, integrationClaimAllowed(artifact), `${id} INTEGRATED claim has full evidence`);
  }
}

if (liveRequired) {
  for (const id of requiredIds) {
    gate(`LIVE-${id}`, integrationClaimAllowed(evidence[id]), `${id} has provider-specific Definition-of-Done, live qualification and orchestrated-use evidence`);
  }
}

const failed = gates.filter((row) => !row.ok);
console.log(JSON.stringify({
  status: failed.length ? 'BLOCKED' : (liveRequired ? 'PRODUCTION_GREEN' : 'ARCHITECTURE_GREEN'),
  live_required: liveRequired,
  gates,
  provider_evidence: Object.fromEntries(requiredIds.map((id) => [id, evidence[id]?.status || 'NO_EVIDENCE'])),
}, null, 2));
process.exit(failed.length ? 1 : 0);
