import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, readJson, writeJsonAtomic } from '../../../packages/pipeline-core/src/fs.js';
import { getPackRoot, runPipeline } from '../../../packages/pipeline-core/src/index.js';

const dataRoot = resolve('.dvtg', 'api-jobs');
const port = Number(process.env.PORT ?? 4310);
const json = (response: ServerResponse, status: number, value: unknown) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }); response.end(JSON.stringify(value)); };
async function body(request: IncomingMessage) { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); if (chunks.reduce((n,c) => n+c.length,0) > 1_000_000) throw new Error('Request body exceeds 1 MB'); return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>; }
async function loadRecord(id: string) { return readJson<{id:string;jobPath:string;status:string}>(join(dataRoot, `${id}.json`)); }

export const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`); const parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, service: 'dvtg-api' });
    if (request.method === 'POST' && url.pathname === '/visual-jobs') {
      const input = await body(request); if (typeof input.jobPath !== 'string') return json(response, 400, { error: 'jobPath is required' });
      const id = randomUUID(); const record = { id, jobPath: resolve(input.jobPath), status: 'PENDING', createdAt: new Date().toISOString() }; await ensureDir(dataRoot); await writeJsonAtomic(join(dataRoot, `${id}.json`), record); return json(response, 201, record);
    }
    if (parts[0] === 'visual-jobs' && parts[1]) {
      const record = await loadRecord(parts[1]);
      if (request.method === 'GET' && parts.length === 2) return json(response, 200, record);
      if (request.method === 'POST' && (parts[2] === 'run' || parts[2] === 'retry')) {
        const updated = { ...record, status: 'RUNNING', updatedAt: new Date().toISOString() }; await writeJsonAtomic(join(dataRoot, `${record.id}.json`), updated);
        try { const result = await runPipeline(record.jobPath, { force: parts[2] === 'retry' }); const done = { ...updated, status: 'PASS', packRoot: result.packRoot, updatedAt: new Date().toISOString() }; await writeJsonAtomic(join(dataRoot, `${record.id}.json`), done); return json(response, 200, done); }
        catch (error) { const failed = { ...updated, status: 'FAIL', failureReason: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() }; await writeJsonAtomic(join(dataRoot, `${record.id}.json`), failed); return json(response, 422, failed); }
      }
      if (request.method === 'POST' && (parts[2] === 'approve' || parts[2] === 'reject')) {
        const input = await body(request); if (typeof input.reviewer !== 'string' || typeof input.gate !== 'string') return json(response, 400, { error: 'reviewer and gate are required' });
        const audit = { jobId: record.id, gate: input.gate, reviewer: input.reviewer, status: parts[2] === 'approve' ? 'APPROVED' : 'REJECTED', notes: input.notes ?? '', timestamp: new Date().toISOString() };
        await ensureDir(dataRoot); await appendFile(join(dataRoot, 'approval-audit.jsonl'), `${JSON.stringify(audit)}\n`, 'utf8'); return json(response, 200, audit);
      }
    }
    if (request.method === 'GET' && parts[0] === 'visual-families' && parts[1]) {
      const root = resolve('artifacts', parts[1], 'v1'); const file = parts[2] === 'manifest' ? 'asset-manifest.json' : 'meta.json'; return json(response, 200, JSON.parse(await readFile(join(root, file), 'utf8')));
    }
    return json(response, 404, { error: 'Not found' });
  } catch (error) { return json(response, 500, { error: error instanceof Error ? error.message : String(error) }); }
});

if (process.env.NODE_ENV !== 'test') server.listen(port, '127.0.0.1', () => console.log(`DVTG API listening on http://127.0.0.1:${port}`));
