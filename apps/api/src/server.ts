import { appendFile, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { ensureDir, readJson, writeJsonAtomic } from '../../../packages/pipeline-core/src/fs.js';
import { getPackRoot, runPipeline } from '../../../packages/pipeline-core/src/index.js';

// ── configuration ──────────────────────────────────────────────────────────
// Every one of these was previously implicit. jobPath was accepted from the
// request and resolved against the process cwd, so an unauthenticated caller
// could name any file on the host and have the pipeline execute against it.
const port = Number(process.env.PORT ?? 4310);
const host = process.env.DVTG_API_HOST ?? '127.0.0.1';
const apiToken = process.env.DVTG_API_TOKEN ?? '';
const jobRoot = resolve(process.env.DVTG_JOB_ROOT ?? 'examples');
const artifactRoot = resolve(process.env.DVTG_ARTIFACT_ROOT ?? 'artifacts');
const allowedOrigin = process.env.DVTG_ALLOWED_ORIGIN ?? '';
const dataRoot = resolve('.dvtg', 'api-jobs');

const MAX_BODY_BYTES = 1_000_000;
const VISUAL_FAMILY_ID = /^VF-[A-Z0-9-]{1,64}$/;
const JOB_ID = /^[0-9a-f-]{36}$/;

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string) {
    super(message ?? code);
  }
}

// ── response helpers ───────────────────────────────────────────────────────
function send(response: ServerResponse, status: number, value: unknown, requestId: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': requestId,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
  // Previously 'access-control-allow-origin: *' on every response, including
  // authenticated ones. Now opt-in and never wildcarded alongside credentials.
  if (allowedOrigin) {
    headers['access-control-allow-origin'] = allowedOrigin;
    headers['vary'] = 'origin';
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(value));
}

// ── authentication ─────────────────────────────────────────────────────────
function authenticate(request: IncomingMessage): string {
  if (!apiToken) {
    // Fail closed. A missing token is a misconfiguration, not permission.
    throw new HttpError(503, 'not_configured', 'DVTG_API_TOKEN is not set');
  }
  const header = request.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(apiToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, 'unauthorized');
  }
  // The principal is derived from the credential, never from the request body.
  return `token:${createHash('sha256').update(apiToken).digest('hex').slice(0, 12)}`;
}

// ── path confinement ───────────────────────────────────────────────────────
function confine(candidate: string, root: string, code: string): string {
  const target = resolve(root, candidate);
  const rel = relative(root, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new HttpError(400, code, 'path escapes the configured root');
  }
  return target;
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    total += (chunk as Buffer).length;
    // Enforced during streaming. The previous check ran after the whole body
    // had already been buffered, so the limit protected nothing.
    if (total > MAX_BODY_BYTES) {
      request.destroy();
      throw new HttpError(413, 'body_too_large');
    }
    chunks.push(Buffer.from(chunk as Buffer));
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// ── job records ────────────────────────────────────────────────────────────
interface JobRecord {
  id: string;
  jobPath: string;
  status: 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL';
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  packRoot?: string;
  failureCode?: string;
  requestId?: string;
}

const recordPath = (id: string) => join(dataRoot, `${id}.json`);

async function loadRecord(id: string): Promise<JobRecord> {
  if (!JOB_ID.test(id)) throw new HttpError(400, 'invalid_job_id');
  try {
    return await readJson<JobRecord>(recordPath(id));
  } catch {
    throw new HttpError(404, 'not_found');
  }
}

// One pipeline run per job at a time. runPipeline writes .dvtg/job-state.json
// without a lock, so two concurrent runs of the same job corrupt its state.
const running = new Set<string>();

// ── approval audit chain ───────────────────────────────────────────────────
// Approval gates are the evidence behind eight human sign-offs. The previous
// implementation appended a caller-supplied 'reviewer' string to a plain file.
// Entries are now bound to the authenticated principal and hash-chained, so a
// removed or edited entry is detectable.
const auditPath = () => join(dataRoot, 'approval-audit.jsonl');

async function lastAuditHash(): Promise<string> {
  try {
    const lines = (await readFile(auditPath(), 'utf8')).trimEnd().split('\n');
    const last = lines.at(-1);
    if (!last) return 'GENESIS';
    return createHash('sha256').update(last).digest('hex');
  } catch {
    return 'GENESIS';
  }
}

// ── routing ────────────────────────────────────────────────────────────────
async function handle(
  request: IncomingMessage,
  url: URL,
  parts: string[],
  requestId: string,
): Promise<{ status: number; body: unknown }> {
  const method = request.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/health') {
    // Unauthenticated: liveness only. Reveals no configuration.
    return { status: 200, body: { ok: true, service: 'dvtg-api' } };
  }

  const principal = authenticate(request);

  if (parts[0] === 'visual-jobs') {
    if (method === 'POST' && parts.length === 1) {
      const input = await readBody(request);
      if (typeof input.jobPath !== 'string' || !input.jobPath) {
        throw new HttpError(400, 'job_path_required');
      }
      // Confined to DVTG_JOB_ROOT. Absolute paths and ../ traversal are refused.
      const jobPath = confine(input.jobPath, jobRoot, 'job_path_outside_root');
      const record: JobRecord = {
        id: randomUUID(),
        jobPath,
        status: 'PENDING',
        createdBy: principal,
        createdAt: new Date().toISOString(),
        requestId,
      };
      await ensureDir(dataRoot);
      await writeJsonAtomic(recordPath(record.id), record);
      return { status: 201, body: record };
    }

    if (parts[1]) {
      const record = await loadRecord(parts[1]);

      if (method === 'GET' && parts.length === 2) {
        return { status: 200, body: record };
      }

      if (method === 'POST' && (parts[2] === 'run' || parts[2] === 'retry')) {
        if (running.has(record.id)) throw new HttpError(409, 'already_running');
        running.add(record.id);
        try {
          const started: JobRecord = {
            ...record,
            status: 'RUNNING',
            updatedAt: new Date().toISOString(),
          };
          await writeJsonAtomic(recordPath(record.id), started);
          try {
            const result = await runPipeline(record.jobPath, { force: parts[2] === 'retry' });
            const done: JobRecord = {
              ...started,
              status: 'PASS',
              packRoot: result.packRoot,
              updatedAt: new Date().toISOString(),
            };
            await writeJsonAtomic(recordPath(record.id), done);
            return { status: 200, body: done };
          } catch (error) {
            // The failure reason is recorded server-side for the operator and
            // reduced to a code for the client. Pipeline errors carry absolute
            // paths and provider details.
            console.error(`[${requestId}] pipeline failed for ${record.id}:`, error);
            const failed: JobRecord = {
              ...started,
              status: 'FAIL',
              failureCode: 'pipeline_failed',
              updatedAt: new Date().toISOString(),
            };
            await writeJsonAtomic(recordPath(record.id), failed);
            return { status: 422, body: failed };
          }
        } finally {
          running.delete(record.id);
        }
      }

      if (method === 'POST' && (parts[2] === 'approve' || parts[2] === 'reject')) {
        const input = await readBody(request);
        if (typeof input.gate !== 'string' || !input.gate) {
          throw new HttpError(400, 'gate_required');
        }
        const previousHash = await lastAuditHash();
        const entry = {
          jobId: record.id,
          gate: input.gate,
          // Bound to the authenticated principal. A caller-supplied reviewer
          // name is recorded as an unverified attribution, never as identity.
          principal,
          attributedTo: typeof input.reviewer === 'string' ? input.reviewer : null,
          decision: parts[2] === 'approve' ? 'APPROVED' : 'REJECTED',
          notes: typeof input.notes === 'string' ? input.notes.slice(0, 4096) : '',
          timestamp: new Date().toISOString(),
          requestId,
          previousHash,
        };
        await ensureDir(dataRoot);
        await appendFile(auditPath(), `${JSON.stringify(entry)}\n`, 'utf8');
        return { status: 200, body: entry };
      }

      throw new HttpError(405, 'method_not_allowed');
    }
  }

  if (method === 'GET' && parts[0] === 'visual-families' && parts[1]) {
    // Previously interpolated straight into a path. A segment such as
    // ..%2f..%2fetc escaped the artifacts directory.
    if (!VISUAL_FAMILY_ID.test(parts[1])) throw new HttpError(400, 'invalid_visual_family_id');
    const file = parts[2] === 'manifest' ? 'asset-manifest.json' : 'meta.json';
    if (parts[2] && parts[2] !== 'manifest' && parts[2] !== 'meta') {
      throw new HttpError(404, 'not_found');
    }
    const target = confine(join(parts[1], 'v1', file), artifactRoot, 'not_found');
    try {
      return { status: 200, body: JSON.parse(await readFile(target, 'utf8')) };
    } catch {
      throw new HttpError(404, 'not_found');
    }
  }

  throw new HttpError(404, 'not_found');
}

export const server = createServer((request, response) => {
  const requestId = randomUUID();
  void (async () => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      const parts = url.pathname.split('/').filter(Boolean);

      if (request.method === 'OPTIONS') {
        return send(response, allowedOrigin ? 204 : 405, null, requestId);
      }

      const { status, body } = await handle(request, url, parts, requestId);
      return send(response, status, body, requestId);
    } catch (error) {
      if (error instanceof HttpError) {
        return send(response, error.status, { error: error.code, requestId }, requestId);
      }
      // Never return an internal message. It leaks paths, provider names and
      // stack context to an unauthenticated caller on some routes.
      console.error(`[${requestId}] unhandled:`, error);
      return send(response, 500, { error: 'internal_error', requestId }, requestId);
    }
  })();
});

if (process.env.NODE_ENV !== 'test') {
  if (!apiToken) {
    console.error(
      'DVTG API refusing to start: DVTG_API_TOKEN is not set.\n' +
        'This service executes the generation pipeline against job files and records\n' +
        'human approval gates. It has no anonymous mode.',
    );
    process.exitCode = 1;
  } else {
    server.listen(port, host, () => {
      console.log(`DVTG API listening on http://${host}:${port}`);
      console.log(`  job root      ${jobRoot}`);
      console.log(`  artifact root ${artifactRoot}`);
      console.log(`  CORS origin   ${allowedOrigin || '(none)'}`);
    });
  }
}
