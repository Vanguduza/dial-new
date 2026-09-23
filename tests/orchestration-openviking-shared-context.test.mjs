import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  admitMemoryCandidate,
  searchSharedMemory,
  writeMemoryCandidate,
} from '../agent-system/orchestration/shared-project-memory.mjs';
import {
  openVikingProjectionStatus,
  projectAdmittedMemoryToOpenViking,
  searchOpenVikingProjectContext,
} from '../agent-system/orchestration/openviking-shared-context.mjs';

const roots=[];
const servers=[];
const oldEnv={
  endpoint:process.env.DIAL_OPENVIKING_ENDPOINT,
  user:process.env.DIAL_OPENVIKING_USER,
  key:process.env.DIAL_OPENVIKING_API_KEY,
  authMode:process.env.DIAL_OPENVIKING_AUTH_MODE,
};

afterEach(async()=>{
  for(const server of servers.splice(0)) await new Promise(resolve=>server.close(resolve));
  for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});
  if(oldEnv.endpoint===undefined) delete process.env.DIAL_OPENVIKING_ENDPOINT; else process.env.DIAL_OPENVIKING_ENDPOINT=oldEnv.endpoint;
  if(oldEnv.user===undefined) delete process.env.DIAL_OPENVIKING_USER; else process.env.DIAL_OPENVIKING_USER=oldEnv.user;
  if(oldEnv.key===undefined) delete process.env.DIAL_OPENVIKING_API_KEY; else process.env.DIAL_OPENVIKING_API_KEY=oldEnv.key;
  if(oldEnv.authMode===undefined) delete process.env.DIAL_OPENVIKING_AUTH_MODE; else process.env.DIAL_OPENVIKING_AUTH_MODE=oldEnv.authMode;
});

function tmp(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ov-spmrf-')); roots.push(root); return root;}
async function mockServer(){
  const seen=[];
  const server=http.createServer(async(req,res)=>{
    let body='';
    for await(const chunk of req) body+=chunk;
    let json=null;
    try{json=body?JSON.parse(body):null;}catch{}
    seen.push({method:req.method,url:req.url,body:json,headers:req.headers});
    res.setHeader('content-type','application/json');
    if(req.url==='/health') return res.end(JSON.stringify({status:'ok'}));
    if(req.url==='/api/v1/fs/mkdir') return res.end(JSON.stringify({result:{ok:true}}));
    if(req.url==='/api/v1/content/write') return res.end(JSON.stringify({result:{uri:json?.uri,status:'accepted'}}));
    if(req.url==='/api/v1/search/search') return res.end(JSON.stringify({result:{context:'semantic continuity from OpenViking'}}));
    res.statusCode=404; res.end(JSON.stringify({error:'not found'}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  servers.push(server);
  const address=server.address();
  process.env.DIAL_OPENVIKING_ENDPOINT=`http://127.0.0.1:${address.port}`;
  process.env.DIAL_OPENVIKING_USER='test-user';
  process.env.DIAL_OPENVIKING_API_KEY='test-key-for-isolated-unit-test-123456';
  process.env.DIAL_OPENVIKING_AUTH_MODE='api_key';
  return {server,seen};
}

describe('OpenViking governed SPMRF projection',()=>{
  it('projects only admitted memory and searches inside the project subtree',async()=>{
    const root=tmp();
    const {seen}=await mockServer();
    const candidate=writeMemoryCandidate({
      project:'van',
      text:'VAN overlay recovery test is now part of the mobile verification plan.',
      sourceHarness:'chatgpt-hermes',
      repositorySha:'a'.repeat(40),
    },root);
    expect(searchSharedMemory({project:'van',query:'overlay recovery'},root).results).toHaveLength(0);
    const admitted=admitMemoryCandidate({
      project:'van',
      candidateRel:candidate.object_rel,
      admissionAuthority:'HERMES_RECONCILED',
      evidenceRefs:['git:'+ 'a'.repeat(40)],
      reconciliation:'Verified against repository evidence.',
    },root);
    expect(admitted.admission_state).toBe('ADMITTED');

    const projected=await projectAdmittedMemoryToOpenViking({project:'van',root});
    expect(projected.ok).toBe(true);
    expect(projected.projected).toBe(1);
    expect(openVikingProjectionStatus('van',root).last_projected_sequence).toBeGreaterThan(0);

    const writes=seen.filter(x=>x.url==='/api/v1/content/write');
    expect(writes).toHaveLength(1);
    expect(writes[0].body.uri).toContain('viking://user/test-user/memories/dial-projects/van/');
    expect(writes[0].body.content).toContain('project_authority: NON_AUTHORITATIVE_CONTEXT');
    expect(writes[0].headers['x-api-key']).toBe('test-key-for-isolated-unit-test-123456');
    expect(writes[0].headers['x-openviking-account']).toBeUndefined();
    expect(writes[0].headers['x-openviking-user']).toBeUndefined();

    const semantic=await searchOpenVikingProjectContext({project:'van',query:'overlay recovery',root});
    expect(semantic.available).toBe(true);
    expect(semantic.context).toContain('semantic continuity');
    const searches=seen.filter(x=>x.url==='/api/v1/search/search');
    expect(searches.at(-1).body.target_uri).toBe('viking://user/test-user/memories/dial-projects/van');
  });

  it('degrades semantic recall without corrupting local admitted SPMRF',async()=>{
    const root=tmp();
    process.env.DIAL_OPENVIKING_ENDPOINT='http://127.0.0.1:1';
    const candidate=writeMemoryCandidate({
      project:'dial',
      text:'Local continuity remains authoritative for memory admission.',
      sourceHarness:'claude-hermes',
    },root);
    admitMemoryCandidate({
      project:'dial',
      candidateRel:candidate.object_rel,
      admissionAuthority:'VERIFIED_SYSTEM',
      evidenceRefs:['test:local'],
    },root);
    const semantic=await searchOpenVikingProjectContext({project:'dial',query:'continuity',root});
    expect(semantic.available).toBe(false);
    const local=searchSharedMemory({project:'dial',query:'continuity'},root);
    expect(local.results).toHaveLength(1);
    expect(local.authority).toBe('NON_AUTHORITATIVE_CONTEXT');
  });
});
