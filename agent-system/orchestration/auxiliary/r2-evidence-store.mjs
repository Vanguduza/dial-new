import crypto from 'node:crypto';

const SERVICE = 's3';
const REGION = 'auto';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function hmac(key, value, encoding = undefined) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}
function enc(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function canonicalPath(key) {
  return `/${String(key).split('/').map(enc).join('/')}`;
}

export function r2ConfigFromEnv(env = process.env) {
  const accountId = env.HAIF_R2_ACCOUNT_ID?.trim() || null;
  const bucket = env.HAIF_R2_BUCKET?.trim() || null;
  const accessKeyId = env.HAIF_R2_ACCESS_KEY_ID?.trim() || null;
  const secretAccessKey = env.HAIF_R2_SECRET_ACCESS_KEY?.trim() || null;
  const endpoint = env.HAIF_R2_ENDPOINT?.trim()
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  return { accountId, bucket, accessKeyId, secretAccessKey, endpoint };
}
export function r2ConfigStatus(config = r2ConfigFromEnv()) {
  const configured = Boolean(
    config.accountId && config.bucket && config.accessKeyId
    && config.secretAccessKey && config.endpoint,
  );
  return {
    configured,
    account_id_present: Boolean(config.accountId),
    bucket: config.bucket,
    access_key_present: Boolean(config.accessKeyId),
    secret_key_present: Boolean(config.secretAccessKey),
    endpoint_present: Boolean(config.endpoint),
    material_exposed: false,
  };
}

function awsTimestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}
function signingKey(secret, dateStamp) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

export function r2ObjectKey({ project, taskId, contentHash }) {
  if (!['dial', 'dde'].includes(project)) throw new Error('HAIF R2 project must be dial or dde');
  if (!taskId || !contentHash) throw new Error('HAIF R2 object identity is incomplete');
  return `haif/${project}/evidence/${String(taskId)}/${String(contentHash)}.json`;
}
function signedHeaders({ method, config, objectKey, payload, date = new Date() }) {
  const status = r2ConfigStatus(config);
  if (!status.configured) throw new Error('HAIF R2 credentials are not fully configured');
  const host = new URL(config.endpoint).host;
  const amzDate = awsTimestamp(date);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(payload);
  const uri = `/${enc(config.bucket)}${canonicalPath(objectKey)}`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaderNames = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, uri, '', canonicalHeaders, signedHeaderNames, payloadHash].join('\n');
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(config.secretAccessKey, dateStamp), stringToSign, 'hex');
  return {
    uri,
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
  };
}

export async function putR2Evidence({ config = r2ConfigFromEnv(), project, taskId, evidence, fetchImpl = globalThis.fetch } = {}) {
  const payload = `${JSON.stringify(evidence, null, 2)}\n`;
  const contentHash = sha256(payload);
  const objectKey = r2ObjectKey({ project, taskId, contentHash });
  const signed = signedHeaders({ method: 'PUT', config, objectKey, payload });
  const response = await fetchImpl(`${config.endpoint}${signed.uri}`, {
    method: 'PUT',
    headers: { ...signed.headers, 'content-type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const error = new Error(`HAIF R2 evidence upload failed: HTTP ${response.status}`);
    error.category = 'R2_ARCHIVE_FAILED';
    error.status = response.status;
    throw error;
  }
  return {
    state: 'MIRRORED',
    provider: 'cloudflare-r2',
    bucket: config.bucket,
    object_key: objectKey,
    content_sha256: contentHash,
    etag: response.headers?.get?.('etag') ?? null,
    mirrored_at: new Date().toISOString(),
  };
}

export async function archiveEvidenceIfConfigured(options = {}) {
  const config = options.config ?? r2ConfigFromEnv(options.env);
  if (!r2ConfigStatus(config).configured) {
    return { state: 'NOT_CONFIGURED', provider: 'cloudflare-r2' };
  }
  return putR2Evidence({ ...options, config });
}
