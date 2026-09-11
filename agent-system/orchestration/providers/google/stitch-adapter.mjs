import { Stitch, StitchToolClient } from '@google/stitch-sdk';
import {
  buildDesignCandidateManifest,
  quarantineDesignArtifact,
} from '../../design-candidate-admission.mjs';
import {
  now,
  persistCapabilityEvidence,
  safeSecretStatus,
  sha256,
} from './external-capability-core.mjs';

export const STITCH_CAPABILITY_ID = 'DESIGN-STITCH';
export const STITCH_MCP_URL = 'https://stitch.googleapis.com/mcp';
export const STITCH_ALLOWED_TOOLS = Object.freeze([
  'create_project',
  'get_project',
  'list_projects',
  'list_screens',
  'get_screen',
  'generate_screen_from_text',
  'edit_screens',
  'generate_variants',
  'create_design_system',
  'update_design_system',
  'list_design_systems',
  'apply_design_system',
]);

function envBool(name, fallback = false, env = process.env) {
  const value = env[name];
  if (value == null) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}export function stitchCredentialStatus(env = process.env) {
  const apiKey = safeSecretStatus(env.STITCH_API_KEY, 'STITCH_API_KEY');
  const accessToken = safeSecretStatus(env.STITCH_ACCESS_TOKEN, 'STITCH_ACCESS_TOKEN');
  const projectConfigured = Boolean(String(env.GOOGLE_CLOUD_PROJECT || '').trim());
  const configured = apiKey.configured || (accessToken.configured && projectConfigured);
  return {
    configured,
    api_key: apiKey,
    access_token: accessToken,
    google_cloud_project_configured: projectConfigured,
    material_exposed: false,
  };
}

export function stitchEnabled(env = process.env) {
  return envBool('DIAL_STITCH_ENABLED', false, env);
}

export function stitchLiveTestsEnabled(env = process.env) {
  return envBool('DIAL_STITCH_LIVE_TESTS_ENABLED', false, env);
}

export function createStitchClient(env = process.env) {
  const credentials = stitchCredentialStatus(env);
  if (!credentials.configured) throw Object.assign(new Error('STITCH_AUTH_REQUIRED'), { category: 'AUTH_REQUIRED' });
  const client = new StitchToolClient({
    apiKey: env.STITCH_API_KEY || undefined,
    accessToken: env.STITCH_ACCESS_TOKEN || undefined,
    projectId: env.GOOGLE_CLOUD_PROJECT || undefined,
    baseUrl: STITCH_MCP_URL,
    timeout: 300000,
  });
  return { client, sdk: new Stitch(client), credentials };
}function classifyStitchError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  if (code === 'AUTH_FAILED' || /401|auth/i.test(message)) return 'AUTH_REQUIRED';
  if (code === 'PERMISSION_DENIED' || /403|permission/i.test(message)) return 'PERMISSION_DENIED';
  if (code === 'RATE_LIMITED' || /429|rate.?limit|quota/i.test(message)) return 'CAPACITY_LIMITED';
  if (code === 'NETWORK_ERROR' || /network|ECONN|ENOTFOUND/i.test(message)) return 'NETWORK_ERROR';
  return 'PROVIDER_ERROR';
}

export async function stitchHealth({ env = process.env, clientFactory = createStitchClient } = {}) {
  if (!stitchEnabled(env)) return { state: 'DISABLED', authenticated: false, tool_allowlist_ok: false };
  let client;
  try {
    const created = clientFactory(env);
    client = created.client;
    const { tools } = await client.listTools();
    const names = (tools || []).map((tool) => tool.name).sort();
    const unexpected = names.filter((name) => !STITCH_ALLOWED_TOOLS.includes(name));
    const missing = STITCH_ALLOWED_TOOLS.filter((name) => !names.includes(name));
    return {
      state: unexpected.length ? 'QUARANTINED' : 'HEALTHY',
      authenticated: true,
      tool_allowlist_ok: unexpected.length === 0,
      unexpected_tools: unexpected,
      missing_known_tools: missing,
      toolset_hash: sha256(names),
    };
  } catch (error) {
    return { state: 'UNAVAILABLE', authenticated: false, failure_class: classifyStitchError(error) };
  } finally {
    try { await client?.close(); } catch {}
  }
}export async function generateStitchScreen({ title, prompt, deviceType = 'DESKTOP', env = process.env, clientFactory = createStitchClient } = {}) {
  if (!stitchEnabled(env)) throw Object.assign(new Error('STITCH_DISABLED'), { category: 'DISABLED' });
  if (!String(prompt || '').trim()) throw new Error('STITCH_PROMPT_REQUIRED');
  let client;
  try {
    const created = clientFactory(env);
    client = created.client;
    const sdk = created.sdk;
    const project = await sdk.createProject(String(title || `DIAL sandbox ${Date.now()}`));
    const screen = await project.generate(String(prompt), deviceType);
    const html_url = await screen.getHtml();
    const image_url = await screen.getImage();
    return {
      provider: 'google-stitch',
      project_id: project.projectId,
      screen_id: screen.screenId,
      html_url,
      image_url,
      response_hash: sha256({ project_id: project.projectId, screen_id: screen.screenId, html_url, image_url }),
    };
  } catch (error) {
    error.category ||= classifyStitchError(error);
    throw error;
  } finally {
    try { await client?.close(); } catch {}
  }
}

export function validateStitchArtifact({ html, taskId = 'qualification', unitLineageId = 'qualification', unitRevisionHash = 'qualification', designAuthorityProjectionHash = 'qualification' } = {}) {
  const quarantine = quarantineDesignArtifact({ content: html, mimeType: 'text/html' });
  if (!quarantine.ok) return { ok: false, quarantine, manifest: null };
  const manifest = buildDesignCandidateManifest({
    taskId,
    providerId: 'google-stitch',
    unitLineageId,
    unitRevisionHash,
    designAuthorityProjectionHash,
    rawContent: html,
    quarantine,
    screenRefs: [],
  });
  return { ok: true, quarantine, manifest };
}const STITCH_ARTIFACT_HOSTS = [
  'storage.googleapis.com',
  'stitch.googleapis.com',
  'googleusercontent.com',
];

function allowedArtifactHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return STITCH_ARTIFACT_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export async function downloadStitchArtifact(url, { fetchImpl = globalThis.fetch, maxBytes = 5_000_000 } = {}) {
  const parsed = new URL(String(url));
  if (parsed.protocol !== 'https:' || !allowedArtifactHost(parsed.hostname)) throw new Error('STITCH_ARTIFACT_URL_DENIED');
  const response = await fetchImpl(parsed, { redirect: 'error' });
  if (!response.ok) throw new Error(`STITCH_ARTIFACT_FETCH_${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('STITCH_ARTIFACT_TOO_LARGE');
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) throw new Error('STITCH_ARTIFACT_TOO_LARGE');
  return {
    body,
    content_type: response.headers.get('content-type') || null,
    byte_length: body.byteLength,
    sha256: sha256(Buffer.from(body)),
  };
}

function stitchDod({ authenticated, liveScreen, quarantine, manifest, visualAcceptance = false, orchestratedProof = false, outageFallback = false } = {}) {
  const checks = {
    implementation: true,
    authentication: Boolean(authenticated),
    live_project_list: Boolean(authenticated),
    live_sandbox_screen: Boolean(liveScreen),
    artifact_quarantine: Boolean(quarantine),
    design_manifest: Boolean(manifest),
    visual_functional_responsive_acceptance: Boolean(visualAcceptance),
    orchestrated_unit_execution: Boolean(orchestratedProof),
    outage_fallback: Boolean(outageFallback),
  };
  return { passed: Object.values(checks).every(Boolean), checks, missing: Object.entries(checks).filter(([, ok]) => !ok).map(([id]) => id) };
}export async function qualifyStitch({
  root,
  env = process.env,
  clientFactory = createStitchClient,
  fetchImpl = globalThis.fetch,
  visualAcceptance = false,
  orchestratedProof = false,
  outageFallback = false,
} = {}) {
  const observedAt = now();
  const credentials = stitchCredentialStatus(env);
  const health = await stitchHealth({ env, clientFactory });
  let status = 'IMPLEMENTED';
  let liveQualification = { passed: false };
  let quarantineProof = false;
  let manifestProof = false;
  if (!credentials.configured) status = 'AUTH_REQUIRED';
  else if (health.state === 'HEALTHY') status = 'AUTHENTICATED';
  else if (health.failure_class === 'AUTH_REQUIRED') status = 'AUTH_REQUIRED';
  else if (health.state !== 'DISABLED') status = 'DEGRADED';

  if (credentials.configured && health.state === 'HEALTHY' && stitchLiveTestsEnabled(env)) {
    try {
      const generated = await generateStitchScreen({
        title: `DIAL qualification ${new Date().toISOString().slice(0, 10)}`,
        prompt: 'Synthetic non-production DIAL qualification screen: a simple accessible status card with heading, body text, and one disabled button. No logos, customer data, prices, or production claims.',
        deviceType: 'DESKTOP',
        env,
        clientFactory,
      });
      const htmlArtifact = await downloadStitchArtifact(generated.html_url, { fetchImpl, maxBytes: 2_000_000 });
      const imageArtifact = await downloadStitchArtifact(generated.image_url, { fetchImpl, maxBytes: 8_000_000 });
      const html = Buffer.from(htmlArtifact.body).toString('utf8');
      const validation = validateStitchArtifact({ html });
      quarantineProof = validation.ok;
      manifestProof = Boolean(validation.manifest?.candidate_hash);
      liveQualification = {
        passed: validation.ok,
        project_id_hash: sha256(generated.project_id),
        screen_id_hash: sha256(generated.screen_id),
        html_sha256: htmlArtifact.sha256,
        image_sha256: imageArtifact.sha256,
        candidate_hash: validation.manifest?.candidate_hash || null,
      };
      status = validation.ok ? 'LIVE_QUALIFIED' : 'QUARANTINED';
    } catch (error) {
      liveQualification = { passed: false, failure_class: error?.category || classifyStitchError(error) };
      status = liveQualification.failure_class === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'DEGRADED';
    }
  }
  const dod = stitchDod({
    authenticated: health.authenticated,
    liveScreen: liveQualification.passed,
    quarantine: quarantineProof,
    manifest: manifestProof,
    visualAcceptance,
    orchestratedProof,
    outageFallback,
  });
  if (dod.passed) status = 'INTEGRATED';
  return persistCapabilityEvidence(root, STITCH_CAPABILITY_ID, {
    provider: 'google-stitch',
    observed_at: observedAt,
    implementation: {
      sdk_package: '@google/stitch-sdk',
      sdk_version: '0.3.5',
      mcp_url: STITCH_MCP_URL,
      arbitrary_host_override_allowed: false,
      tool_allowlist: STITCH_ALLOWED_TOOLS,
    },
    credentials,
    health,
    authentication: { verified: health.authenticated === true },
    live_qualification: liveQualification,
    orchestrated_use: { passed: Boolean(orchestratedProof) },
    definition_of_done: dod,
    status,
  });
}
