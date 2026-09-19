#!/usr/bin/env node
import readline from 'node:readline';
import { RESEARCH_LOOP_ACTIONS } from '../orchestration/vekl-research-loop.mjs';

const common = {
  request_id: { type: 'string', minLength: 8, maxLength: 160, pattern: '^[A-Za-z0-9_.:-]+$' },
  worker_id: { type: 'string', minLength: 1, maxLength: 160 },
  lease_id: { type: 'string', minLength: 1, maxLength: 160 },
};

const schemas = Object.freeze({
  claim: { properties: { ...common }, required: ['request_id', 'worker_id'] },
  fetch: { properties: { ...common }, required: ['request_id', 'worker_id', 'lease_id'] },
  search: { properties: { ...common, search_query: { type: 'string', minLength: 1, maxLength: 500 }, adapter: { type: 'string', maxLength: 120 } }, required: ['request_id', 'worker_id', 'lease_id', 'search_query'] },
  'fetch-read': { properties: { ...common, url: { type: 'string', format: 'uri' }, content_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['request_id', 'worker_id', 'lease_id', 'url', 'content_hash'] },
  'submit-analysis': { properties: { ...common, claims: { type: 'array', minItems: 1 }, sources: { type: 'array', minItems: 1 } }, required: ['request_id', 'worker_id', 'lease_id', 'claims', 'sources'] },
  'submit-deeper-evidence': { properties: { ...common, claims: { type: 'array', minItems: 1 }, sources: { type: 'array', minItems: 1 } }, required: ['request_id', 'worker_id', 'lease_id', 'claims', 'sources'] },
  complete: { properties: { ...common }, required: ['request_id', 'worker_id', 'lease_id'] },
  retry: { properties: { ...common, reason: { type: 'string', maxLength: 500 } }, required: ['request_id', 'worker_id', 'lease_id'] },
  refuse: { properties: { ...common, reason: { type: 'string', minLength: 1, maxLength: 500 } }, required: ['request_id', 'worker_id', 'lease_id', 'reason'] },
});

export function researchToolDefinitions() {
  return RESEARCH_LOOP_ACTIONS.map((action) => ({
    name: `dial_research_${action.replaceAll('-', '_')}`,
    description: `${action} for exactly one leased immutable Development Unit research packet. No SQL or Project Truth mutation.`,
    inputSchema: { type: 'object', additionalProperties: false, ...schemas[action] },
  }));
}

export function createResearchMcpHandler(loop) {
  return async (message) => {
    if (message.method === 'initialize') return { jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'dial-vekl-research', version: '1.0.0' }, instructions: 'One immutable DU packet per lease. Validated evidence persists to authoritative VEKL PostgreSQL on vekl-worker. Arbitrary SQL and Project Truth mutation are prohibited.' } };
    if (message.method === 'tools/list') return { jsonrpc: '2.0', id: message.id, result: { tools: researchToolDefinitions() } };
    if (message.method === 'tools/call') {
      const prefix = 'dial_research_';
      const name = String(message.params?.name || '');
      if (!name.startsWith(prefix)) return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'TOOL_NOT_FOUND' } };
      try {
        const result = await loop.invoke(name.slice(prefix.length).replaceAll('_', '-'), message.params?.arguments || {});
        return { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
      } catch (error) {
        return { jsonrpc: '2.0', id: message.id, result: { isError: true, content: [{ type: 'text', text: String(error?.message || error) }] } };
      }
    }
    return { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'METHOD_NOT_FOUND' } };
  };
}

export async function serveResearchMcp(loop, { input = process.stdin, output = process.stdout } = {}) {
  const handler = createResearchMcpHandler(loop);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let response;
    try { response = await handler(JSON.parse(line)); }
    catch (error) { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: String(error?.message || error) } }; }
    output.write(`${JSON.stringify(response)}\n`);
  }
}
