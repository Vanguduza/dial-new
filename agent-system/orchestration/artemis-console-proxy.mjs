#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import {
  isHermesOwnedAndroidTrace,
  registerOwnerConsoleTask,
  requireAdmittedAndroidAvd,
  resolveAdmittedAndroidSerial,
} from './android-testing-plane.mjs';

const bindHost = process.env.DIAL_ARTEMIS_CONSOLE_BIND || '127.0.0.1';
const bindPort = Number(process.env.DIAL_ARTEMIS_CONSOLE_PORT || 9135);
const upstream = new URL(process.env.DIAL_ARTEMIS_UI_UPSTREAM || 'http://127.0.0.1:9146');
const tokenFile = process.env.DIAL_ARTEMIS_CONSOLE_TOKEN_FILE || '/var/lib/dial-control/secrets/artemis-console.token';
const controlHome = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const consoleRepo = path.resolve(process.env.DIAL_ARTEMIS_CONSOLE_REPO || process.env.DIAL_REPO_DIR || process.cwd());
const consoleProject = String(process.env.DIAL_ARTEMIS_CONSOLE_PROJECT || 'dial').trim() || 'dial';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SAFE_GLOBAL_MUTATIONS = new Set([
  '/api/system/adb/restart',
  '/api/system/adb/heal-keys',
  '/api/system/emulator/stop',
  '/api/system/emulator/dismiss',
]);
const BLOCKED_ADMIN_PREFIXES = [
  '/api/system/credentials',
  '/api/system/adb/server',
  '/api/cleanup',
];
const MAX_BODY = 1024 * 1024;
const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}
function bearer(req) {
  const raw = String(req.headers.authorization || '');
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}
function expectedToken() {
  return fs.readFileSync(tokenFile, 'utf8').trim();
}
function safeEqual(a,b) {
  const aa=Buffer.from(String(a||'')); const bb=Buffer.from(String(b||''));
  return aa.length===bb.length && aa.length>0 && crypto.timingSafeEqual(aa,bb);
}
function requestPath(rawUrl) {
  return new URL(rawUrl || '/', 'http://dial-artemis.local').pathname;
}
function upstreamHeaders(req,{jsonBody=false}={}) {
  const headers = { ...req.headers };
  for (const key of [
    'authorization','origin','host','connection','proxy-connection','keep-alive',
    'transfer-encoding','te','trailer','upgrade','proxy-authorization',
    'x-forwarded-for','x-forwarded-host','x-forwarded-proto','cookie','content-length'
  ]) delete headers[key];
  headers.host = upstream.host;
  headers['x-dial-artemis-console-mode'] = 'hermes-governed-owner-control';
  if(jsonBody){
    headers['content-type']='application/json';
    headers['accept-encoding']='identity';
  }
  return headers;
}
function responseHeaders(headers={}) {
  const out={};
  for(const [key,value] of Object.entries(headers)){
    const lower=key.toLowerCase();
    if(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','set-cookie'].includes(lower)) continue;
    if(value!==undefined) out[key]=value;
  }
  out['cache-control']=out['cache-control'] || 'no-store';
  out['x-dial-artemis-authority']='HERMES_SUBORDINATE';
  out['x-dial-artemis-console-mode']='HERMES_GOVERNED_CONTROL';
  return out;
}
function auditMutation(event) {
  try {
    const dir=path.join(controlHome,'events');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    fs.appendFileSync(path.join(dir,'artemis-console.jsonl'),JSON.stringify({
      schema_version:1,
      authority:'OWNER_VIA_HERMES_GOVERNED_ARTEMIS_SURFACE',
      at:new Date().toISOString(),
      ...event,
    })+'\n',{encoding:'utf8',mode:0o600});
  } catch {}
}
function within(base,target) {
  const b=path.resolve(base), t=path.resolve(target);
  return t===b || t.startsWith(`${b}${path.sep}`);
}
function parseJsonBuffer(buffer) {
  try { return JSON.parse(buffer.toString('utf8') || '{}'); }
  catch { throw new Error('request body must be valid JSON'); }
}
async function readBody(req,max=MAX_BODY) {
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>max) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export function classifyConsoleMutation(pathname) {
  if(pathname==='/api/run') return 'RUN_TASK';
  if(pathname==='/api/stop') return 'STOP_TASK';
  if(pathname==='/api/system/devices/select') return 'SELECT_DEVICE';
  if(pathname==='/api/system/emulator/launch') return 'LAUNCH_AVD';
  if(SAFE_GLOBAL_MUTATIONS.has(pathname)) return 'SAFE_GLOBAL_DIAGNOSTIC';
  if(BLOCKED_ADMIN_PREFIXES.some(prefix=>pathname===prefix || pathname.startsWith(prefix+'/'))) return 'BLOCKED_ADMIN';
  if(pathname==='/api/system/restart' || pathname==='/api/system/shutdown') return 'BLOCKED_LIFECYCLE';
  if(/^\/api\/sessions\/[^/]+\/delete$/.test(pathname)) return 'BLOCKED_DELETE';
  if(/^\/api\/sessions\/[^/]+\/steps\/\d+\/replay$/.test(pathname)) return 'BLOCKED_REPLAY';
  return 'UNSUPPORTED';
}
export function prepareOwnerRunRequest(payload,{root=controlHome,repoDir=consoleRepo}={}) {
  const body={...(payload||{})};
  const goals=Array.isArray(body.goals) ? body.goals.filter(x=>String(x||'').trim()) : [];
  const goal=String(body.goal || goals[0] || '').trim();
  if(!goal) throw new Error('ARTEMIS owner console requires one task goal');
  if(goals.length>1) throw new Error('ARTEMIS owner console accepts one governed task per submission');
  const serial=resolveAdmittedAndroidSerial(body.device_serial||null,{root});
  const profile=String(body.profile||'flash').toLowerCase();
  if(!['flash','pro'].includes(profile)) throw new Error('unsupported ARTEMIS profile');
  if(body.locked_app_package && !PACKAGE_RE.test(String(body.locked_app_package))) throw new Error('invalid Android package name');
  if(body.app_path){
    const absolute=path.resolve(repoDir,String(body.app_path));
    if(!within(repoDir,absolute) || !absolute.endsWith('.apk') || !fs.existsSync(absolute)) throw new Error('APK path is not an admitted repository APK');
    body.app_path=absolute;
  }
  body.goal=goal;
  delete body.goals;
  body.profile=profile;
  body.device_serial=serial;
  body.session_id=crypto.randomUUID();
  body.ingress='dial-hermes-van-owner-ui';
  return body;
}
function requestUpstreamBuffered(req,bodyBuffer) {
  return new Promise((resolve,reject)=>{
    const target=new URL(req.url || '/',upstream);
    const headers=upstreamHeaders(req,{jsonBody:true});
    headers['content-length']=String(bodyBuffer.length);
    const u=http.request({
      protocol:upstream.protocol,hostname:upstream.hostname,port:upstream.port||80,
      method:req.method,path:target.pathname+target.search,headers,
    },r=>{
      const chunks=[]; let size=0;
      r.on('data',chunk=>{size+=chunk.length; if(size<=4*MAX_BODY) chunks.push(chunk);});
      r.on('end',()=>{
        if(size>4*MAX_BODY) return reject(new Error('upstream response too large'));
        resolve({statusCode:r.statusCode||502,headers:r.headers,body:Buffer.concat(chunks)});
      });
    });
    u.setTimeout(120000,()=>u.destroy(new Error('ARTEMIS mutation timed out')));
    u.on('error',reject);
    u.end(bodyBuffer);
  });
}
function sendBuffered(res,result) {
  const headers=responseHeaders(result.headers);
  headers['content-length']=String(result.body.length);
  res.writeHead(result.statusCode,headers);
  res.end(result.body);
}
async function handleMutation(req,res) {
  const pathname=requestPath(req.url);
  const kind=classifyConsoleMutation(pathname);
  if(kind.startsWith('BLOCKED_') || kind==='UNSUPPORTED'){
    return sendJson(res,405,{
      error:'hermes_governed_control_required',
      mutation:kind,
      detail:'This upstream ARTEMIS admin mutation is not admitted to the VAN owner surface. Use Hermes/DIAL operator controls for privileged configuration, destructive history operations, replay, or server lifecycle.',
    });
  }
  let raw;
  try { raw=await readBody(req); }
  catch(error){ return sendJson(res,413,{error:String(error?.message||error)}); }
  let body={};
  if(raw.length){
    try { body=parseJsonBuffer(raw); }
    catch(error){ return sendJson(res,400,{error:String(error?.message||error)}); }
  }
  try {
    if(kind==='RUN_TASK'){
      const prepared=prepareOwnerRunRequest(body);
      raw=Buffer.from(JSON.stringify(prepared));
      const result=await requestUpstreamBuffered(req,raw);
      if(result.statusCode>=200 && result.statusCode<300){
        let upstreamBody={};
        try { upstreamBody=parseJsonBuffer(result.body); } catch {}
        const upstreamTask=Array.isArray(upstreamBody.tasks) ? upstreamBody.tasks[0] : null;
        const traceId=String(upstreamTask?.session_id || prepared.session_id);
        registerOwnerConsoleTask({
          traceId,
          project:consoleProject,
          repoDir:consoleRepo,
          deviceSerial:prepared.device_serial,
          objective:prepared.goal,
          profile:prepared.profile,
          apkPath:prepared.app_path||null,
          packageName:prepared.locked_app_package||null,
          expectedOutput:prepared.expected_output||null,
          verificationLevel:prepared.verification_level||'strict',
          explorerMode:prepared.explorer_mode||'flash',
          upstreamStatus:upstreamTask?.status || upstreamBody.status || 'running',
          root:controlHome,
          sourceHarness:'van-owner-web',
        });
        auditMutation({event:'ARTEMIS_OWNER_WEB_TASK_STARTED',path:pathname,trace_id:traceId,device_serial:prepared.device_serial,project:consoleProject});
      }
      return sendBuffered(res,result);
    }
    if(kind==='STOP_TASK'){
      const target=new URL(req.url || '/', 'http://dial-artemis.local');
      const traceId=String(body.session_id || target.searchParams.get('session_id') || '').trim();
      if(body.all===true || !traceId) return sendJson(res,400,{error:'owned session_id required; global stop is not admitted'});
      if(!isHermesOwnedAndroidTrace(traceId,{root:controlHome})) return sendJson(res,403,{error:'trace is not owned by the Hermes Android plane'});
      const result=await requestUpstreamBuffered(req,raw.length?raw:Buffer.from(JSON.stringify({session_id:traceId})));
      auditMutation({event:'ARTEMIS_OWNER_WEB_TASK_STOP',path:pathname,trace_id:traceId,status_code:result.statusCode});
      return sendBuffered(res,result);
    }
    if(kind==='SELECT_DEVICE'){
      const serial=resolveAdmittedAndroidSerial(body.serial||null,{root:controlHome});
      raw=Buffer.from(JSON.stringify({...body,serial}));
      const result=await requestUpstreamBuffered(req,raw);
      auditMutation({event:'ARTEMIS_OWNER_WEB_DEVICE_SELECTED',path:pathname,device_serial:serial,status_code:result.statusCode});
      return sendBuffered(res,result);
    }
    if(kind==='LAUNCH_AVD'){
      const avd=requireAdmittedAndroidAvd(body.avd_name,{root:controlHome});
      raw=Buffer.from(JSON.stringify({...body,avd_name:avd}));
      const result=await requestUpstreamBuffered(req,raw);
      auditMutation({event:'ARTEMIS_OWNER_WEB_AVD_LAUNCH',path:pathname,avd_name:avd,status_code:result.statusCode});
      return sendBuffered(res,result);
    }
    const result=await requestUpstreamBuffered(req,raw.length?raw:Buffer.from('{}'));
    auditMutation({event:'ARTEMIS_OWNER_WEB_SAFE_DIAGNOSTIC',path:pathname,status_code:result.statusCode});
    return sendBuffered(res,result);
  } catch(error){
    auditMutation({event:'ARTEMIS_OWNER_WEB_MUTATION_REFUSED',path:pathname,error:String(error?.message||error).slice(0,500)});
    return sendJson(res,403,{error:'hermes_governed_control_refused',detail:String(error?.message||error)});
  }
}

export function createArtemisConsoleProxyServer(){
  return http.createServer(async (req,res)=>{
    if(req.method==='GET' && req.url==='/health'){
      return sendJson(res,200,{
        service:'dial-artemis-console-proxy',
        state:'UP',
        authority:'HERMES_CONTROL_AUTHORITY',
        subordinate:'ARTEMIS',
        mode:'HERMES_GOVERNED_CONTROL',
        upstream:upstream.origin,
        project:consoleProject,
      });
    }
    let token='';
    try { token=expectedToken(); } catch { return sendJson(res,503,{error:'artemis_console_token_unavailable'}); }
    if(!safeEqual(bearer(req),token)) return sendJson(res,401,{error:'unauthorized'});
    const method=String(req.method||'GET').toUpperCase();
    if(!READ_METHODS.has(method)){
      if(method!=='POST') return sendJson(res,405,{error:'unsupported_method'});
      return handleMutation(req,res);
    }
    const target=new URL(req.url || '/',upstream);
    const upstreamReq=http.request({
      protocol:upstream.protocol,
      hostname:upstream.hostname,
      port:upstream.port || 80,
      method:req.method,
      path:target.pathname+target.search,
      headers:upstreamHeaders(req),
    },upstreamRes=>{
      res.writeHead(upstreamRes.statusCode||502,responseHeaders(upstreamRes.headers));
      upstreamRes.pipe(res);
    });
    upstreamReq.setTimeout(0);
    upstreamReq.on('error',err=>{
      if(!res.headersSent) sendJson(res,502,{error:'artemis_ui_unavailable',detail:String(err.message||err)});
      else res.destroy(err);
    });
    req.pipe(upstreamReq);
  });
}

if(import.meta.url===`file://${process.argv[1]}`){
  const server=createArtemisConsoleProxyServer();
  server.requestTimeout=0;
  server.headersTimeout=30000;
  server.listen(bindPort,bindHost,()=>{
    process.stdout.write(JSON.stringify({
      service:'dial-artemis-console-proxy',bind:bindHost,port:bindPort,upstream:upstream.origin,
      authority:'HERMES_CONTROL_AUTHORITY',subordinate:'ARTEMIS',mode:'HERMES_GOVERNED_CONTROL',project:consoleProject
    })+'\n');
  });
}
