import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  callBrowserFabric,
  browserFabricCredentialStatus,
} from '../agent-system/orchestration/browser-acquisition-client.mjs';
import {
  searchPublicWithBrowserFallback,
  fetchPublicWithBrowserFallback,
} from '../agent-system/orchestration/providers/openrouter/union-alpha-research-adapter.mjs';
import { researchToolDefinitions } from '../agent-system/mcp/dial-research-server.mjs';

const normalized=(method='BROWSER_SEARCH')=>({
  schema_version:1,
  authority:'NON_AUTHORITATIVE_RESEARCH',
  acquisition_method:method,
  source_url:'https://www.bing.com/search?q=test',
  final_url:'https://www.postgresql.org/docs/current/',
  content_hash:'a'.repeat(64),
  page_snapshot_hash:'b'.repeat(64),
  interaction_trace_hash:'c'.repeat(64),
  observed_at:'2026-09-19T12:00:00.000Z',
  source_kind:'PUBLIC_WEB',
  trust_suggestion:'T4_COMMUNITY_SIGNAL',
  candidate_id:'DISC-'+'d'.repeat(24),
  excerpt:'bounded evidence',
  links:[{title:'PostgreSQL',url:'https://www.postgresql.org/docs/current/',snippet:'official docs'}],
});

test('browser fabric client accepts normalized evidence and exposes no token material', async()=>{
  const fake=async()=>new Response(JSON.stringify({ok:true,result:normalized()}),{status:200,headers:{'content-type':'application/json'}});
  const result=await callBrowserFabric('browser_search',{query:'postgresql'},fake);
  assert.equal(result.acquisition_method,'BROWSER_SEARCH');
  assert.match(result.content_hash,/^[a-f0-9]{64}$/);
  const status=browserFabricCredentialStatus();
  assert.equal(status.material_exposed,false);
});

test('Exa 429 degrades to Browser Harness rather than failing research', async()=>{
  const fake=async(url)=>{
    if(String(url).includes('mcp.exa.ai')) return new Response('rate limited',{status:429});
    if(String(url).includes('/v1/acquire')) return new Response(JSON.stringify({ok:true,result:normalized('BROWSER_SEARCH')}),{status:200});
    throw new Error('unexpected route '+url);
  };
  const result=await searchPublicWithBrowserFallback('postgresql mvcc',fake);
  assert.equal(result.state,'DEGRADED_ROUTE_USED');
  assert.equal(result.acquisition_method,'BROWSER_SEARCH');
  assert.equal(result.fallback_cause,'EXA_HTTP_429');
  assert.equal(result.candidate_id,'DISC-'+'d'.repeat(24));
});

test('failed direct fetch escalates to rendered browser evidence', async()=>{
  const fake=async(url)=>{
    if(String(url)==='https://example.com/docs') return new Response('upstream unavailable',{status:503});
    if(String(url).includes('/v1/acquire')) return new Response(JSON.stringify({ok:true,result:normalized('BROWSER_RENDERED')}),{status:200});
    throw new Error('unexpected route '+url);
  };
  const result=await fetchPublicWithBrowserFallback('https://example.com/docs',fake);
  assert.equal(result.state,'DEGRADED_ROUTE_USED');
  assert.equal(result.acquisition_method,'BROWSER_RENDERED');
  assert.equal(result.content_hash,'a'.repeat(64));
});

test('MCP fetch-read exposes only bounded acquisition routes',()=>{
  const tool=researchToolDefinitions().find(x=>x.name==='dial_research_fetch_read');
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.properties.acquisition_method.enum,['DIRECT_FETCH','BROWSER_RENDERED','STAGEHAND_NAVIGATION']);
  assert.equal(tool.inputSchema.properties.instruction.maxLength,1600);
  assert.equal(tool.inputSchema.additionalProperties,false);
});

test('browser server contains required isolation and SSRF controls',()=>{
  const root=path.resolve(import.meta.dirname,'..');
  const server=fs.readFileSync(path.join(root,'deploy/oracle/trading-core/dial-browser/server.mjs'),'utf8');
  for(const marker of [
    'PUBLIC_HTTPS_REQUIRED',
    'PRIVATE_DNS_TARGET_REJECTED',
    'acceptDownloads:false',
    'NON_AUTHORITATIVE_RESEARCH',
    'STAGEHAND_NAVIGATION',
    'BROWSER_SEARCH',
    'BROWSER_RENDERED',
    '127.0.0.1',
  ]) assert.ok(server.includes(marker),marker);
  assert.ok(!server.includes('docker.sock'));
});
