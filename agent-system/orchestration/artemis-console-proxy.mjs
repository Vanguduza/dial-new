#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';

const bindHost = process.env.DIAL_ARTEMIS_CONSOLE_BIND || '127.0.0.1';
const bindPort = Number(process.env.DIAL_ARTEMIS_CONSOLE_PORT || 9135);
const upstream = new URL(process.env.DIAL_ARTEMIS_UI_UPSTREAM || 'http://127.0.0.1:9146');
const tokenFile = process.env.DIAL_ARTEMIS_CONSOLE_TOKEN_FILE || '/var/lib/dial-control/secrets/artemis-console.token';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
  return aa.length===bb.length && aa.length>0 && cryptoSafe(aa,bb);
}
function cryptoSafe(a,b) {
  let out=0;
  for(let i=0;i<a.length;i++) out |= a[i]^b[i];
  return out===0;
}
function upstreamHeaders(req) {
  const headers = { ...req.headers };
  for (const key of [
    'authorization','origin','host','connection','proxy-connection','keep-alive',
    'transfer-encoding','te','trailer','upgrade','proxy-authorization',
    'x-forwarded-for','x-forwarded-host','x-forwarded-proto'
  ]) delete headers[key];
  headers.host = upstream.host;
  headers['x-dial-artemis-console-mode'] = 'hermes-governed-observation';
  return headers;
}
function responseHeaders(headers={}) {
  const out={};
  for(const [key,value] of Object.entries(headers)){
    const lower=key.toLowerCase();
    if(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'].includes(lower)) continue;
    if(value!==undefined) out[key]=value;
  }
  out['cache-control']=out['cache-control'] || 'no-store';
  out['x-dial-artemis-authority']='HERMES_SUBORDINATE';
  out['x-dial-artemis-console-mode']='OBSERVE_ONLY';
  return out;
}

const server=http.createServer((req,res)=>{
  if(req.method==='GET' && req.url==='/health'){
    return sendJson(res,200,{
      service:'dial-artemis-console-proxy',
      state:'UP',
      authority:'HERMES_CONTROL_AUTHORITY',
      subordinate:'ARTEMIS',
      mode:'OBSERVE_ONLY',
      upstream:upstream.origin,
    });
  }
  let token='';
  try { token=expectedToken(); } catch { return sendJson(res,503,{error:'artemis_console_token_unavailable'}); }
  if(!safeEqual(bearer(req),token)) return sendJson(res,401,{error:'unauthorized'});
  if(!READ_METHODS.has(String(req.method||'GET').toUpperCase())){
    return sendJson(res,405,{
      error:'hermes_governed_control_required',
      detail:'ARTEMIS execution remains behind the Hermes Android testing broker. Use VAN/Hermes controls for task start, stop, instruction injection and diagnosis.',
    });
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

server.requestTimeout=0;
server.headersTimeout=30000;
server.listen(bindPort,bindHost,()=>{
  process.stdout.write(JSON.stringify({
    service:'dial-artemis-console-proxy',bind:bindHost,port:bindPort,upstream:upstream.origin,
    authority:'HERMES_CONTROL_AUTHORITY',subordinate:'ARTEMIS',mode:'OBSERVE_ONLY'
  })+'\n');
});
