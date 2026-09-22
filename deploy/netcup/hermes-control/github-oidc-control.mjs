#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PORT = Number(process.env.DIAL_GITHUB_OIDC_PORT || 9134);
const REPO = process.env.DIAL_REPO_DIR || '/home/ubuntu/dial-new';
const CONTROL = process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const OWNER = 'Vanguduza';
const REPOSITORY = 'Vanguduza/dial-new';
const ALLOWED_REFS = new Set([
  'refs/heads/master',
  'refs/heads/gpt/netcup-hermes-control-integrated-20260921',
]);
const ALLOWED_WORKFLOWS = [
  '/.github/workflows/netcup-zero-touch-converge.yml@',
];
const ROOT = path.join(CONTROL, 'github-oidc');
const USED = path.join(ROOT, 'used-tokens');
const AUDIT = path.join(ROOT, 'audit.jsonl');
fs.mkdirSync(USED, { recursive: true, mode: 0o700 });

function b64url(value) {
  return Buffer.from(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='), 'base64');
}
function jsonPart(value) { return JSON.parse(b64url(value).toString('utf8')); }
function now() { return new Date().toISOString(); }
function audit(record) {
  fs.appendFileSync(AUDIT, JSON.stringify({ at: now(), ...record })+'\n', { mode:0o600 });
}
function command(cmd, { env={}, timeout=15*60*1000 }={}) {
  const r=spawnSync('/bin/bash',['-lc',cmd],{
    encoding:'utf8',
    timeout,
    env:{...process.env,...env},
    maxBuffer: 4*1024*1024,
  });
  return {
    ok:r.status===0,
    status:r.status,
    stdout:String(r.stdout||'').slice(-20000),
    stderr:String(r.stderr||'').slice(-20000),
    signal:r.signal||null,
    error:r.error?.message||null,
  };
}
let jwksCache={at:0,keys:[]};
async function jwks() {
  if (Date.now()-jwksCache.at < 10*60*1000 && jwksCache.keys.length) return jwksCache.keys;
  const r=await fetch('https://token.actions.githubusercontent.com/.well-known/jwks');
  if(!r.ok) throw new Error('github oidc jwks fetch failed '+r.status);
  const j=await r.json();
  jwksCache={at:Date.now(),keys:j.keys||[]};
  return jwksCache.keys;
}
async function verifyToken(token, expectedAudience) {
  const parts=String(token||'').split('.');
  if(parts.length!==3) throw new Error('malformed oidc token');
  const header=jsonPart(parts[0]);
  const payload=jsonPart(parts[1]);
  if(header.alg!=='RS256' || !header.kid) throw new Error('unexpected oidc alg/kid');
  const key=(await jwks()).find((x)=>x.kid===header.kid);
  if(!key) throw new Error('oidc signing key not found');
  const publicKey=crypto.createPublicKey({key,format:'jwk'});
  const signed=Buffer.from(parts[0]+'.'+parts[1]);
  const sig=b64url(parts[2]);
  if(!crypto.verify('RSA-SHA256',signed,publicKey,sig)) throw new Error('oidc signature invalid');
  const t=Math.floor(Date.now()/1000);
  if(payload.iss!=='https://token.actions.githubusercontent.com') throw new Error('oidc issuer invalid');
  if(Number(payload.exp||0) < t-5) throw new Error('oidc expired');
  if(Number(payload.nbf||0) > t+30) throw new Error('oidc not yet valid');
  const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(!aud.includes(expectedAudience)) throw new Error('oidc audience mismatch');
  if(payload.repository!==REPOSITORY) throw new Error('repository claim mismatch');
  if(payload.actor!==OWNER) throw new Error('actor claim mismatch');
  if(!ALLOWED_REFS.has(payload.ref)) throw new Error('ref claim refused');
  if(!ALLOWED_WORKFLOWS.some((x)=>String(payload.workflow_ref||'').includes(x))) throw new Error('workflow_ref refused');
  const tokenId=String(payload.jti||crypto.createHash('sha256').update(token).digest('hex'));
  const marker=path.join(USED,crypto.createHash('sha256').update(tokenId).digest('hex'));
  if(fs.existsSync(marker)) throw new Error('oidc token replay refused');
  fs.writeFileSync(marker,now()+'\n',{mode:0o600,flag:'wx'});
  return payload;
}
function validWgKey(v){ return /^[A-Za-z0-9+/]{43}=$/.test(String(v||'')); }
function ubuntu(cmd, timeout=20*60*1000) {
  const uid=command('id -u ubuntu').stdout.trim();
  return command(
    'runuser -u ubuntu -- env HOME=/home/ubuntu XDG_RUNTIME_DIR=/run/user/'+uid+
    ' DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/'+uid+'/bus '+cmd,
    {timeout}
  );
}
function requireOk(result, label) {
  if(!result.ok) {
    const e=new Error(label+' failed');
    e.result=result;
    throw e;
  }
  return result;
}
function peerCheck() {
  const key=fs.existsSync('/home/ubuntu/.ssh/dial-oracle-admin')
    ? '/home/ubuntu/.ssh/dial-oracle-admin'
    : '/home/ubuntu/.ssh/dial-bootstrap-oracle';
  const peers=['10.77.0.2','10.77.0.3','10.77.0.4','10.77.0.5'];
  const out=[];
  for(const ip of peers){
    const p=command('ping -c 1 -W 2 '+ip);
    const s=command("runuser -u ubuntu -- ssh -i "+key+" -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new ubuntu@"+ip+" 'hostname'");
    out.push({ip,ping:p.ok,ssh:s.ok,hostname:s.stdout.trim(),ssh_error:s.stderr.trim()});
  }
  return out;
}
async function dispatch(body, claims) {
  const action=String(body.action||'');
  switch(action){
    case 'status': {
      return {
        host:command('hostname').stdout.trim(),
        bootstrap_receipt:fs.existsSync(path.join(CONTROL,'bootstrap/image-bootstrap.receipt')),
        oidc_ready:true,
        recovery_ready:fs.existsSync(path.join(ROOT,'github-oci-ready')),
        rotated:fs.existsSync(path.join(ROOT,'identities-rotated')),
        migration_prepare:fs.existsSync(path.join(CONTROL,'state/migration-prepare-complete')),
        migration_cutover:fs.existsSync(path.join(CONTROL,'state/migration-cutover-complete')),
        control_active:fs.existsSync(path.join(CONTROL,'state/netcup-control-active')),
        certified:fs.existsSync(path.join(CONTROL,'state/zero-touch-certified')),
        bootstrap_ssh_public_key:fs.existsSync('/home/ubuntu/.ssh/dial-bootstrap-oracle.pub')
          ? fs.readFileSync('/home/ubuntu/.ssh/dial-bootstrap-oracle.pub','utf8').trim()
          : null,
        wireguard_public_key:fs.existsSync('/etc/wireguard/dial-netcup.pub')
          ? fs.readFileSync('/etc/wireguard/dial-netcup.pub','utf8').trim()
          : null,
      };
    }
    case 'mark-recovery-ready': {
      fs.writeFileSync(path.join(ROOT,'github-oci-ready'),now()+'\n',{mode:0o600});
      return {ready:true};
    }
    case 'configure-overlay': {
      for(const k of ['oracle_admin','vekl_worker','van_trading_core','old_control']){
        if(!validWgKey(body?.peers?.[k])) throw new Error('invalid WireGuard public key for '+k);
      }
      const r=command(
        "bash '"+REPO+"/deploy/netcup/hermes-control/configure-wireguard-fabric.sh'",
        {env:{
          ORACLE_ADMIN_WG_PUBLIC_KEY:body.peers.oracle_admin,
          VEKL_WORKER_WG_PUBLIC_KEY:body.peers.vekl_worker,
          VAN_TRADING_CORE_WG_PUBLIC_KEY:body.peers.van_trading_core,
          OLD_CONTROL_WG_PUBLIC_KEY:body.peers.old_control,
        }}
      );
      requireOk(r,'configure-overlay');
      return r;
    }
    case 'verify-overlay': {
      const peers=peerCheck();
      if(!peers.every((x)=>x.ping&&x.ssh)) throw Object.assign(new Error('overlay verification failed'),{result:{peers}});
      return {peers};
    }
    case 'rotate-identities': {
      const r=command("bash '"+REPO+"/deploy/netcup/hermes-control/rotate-bootstrap-identities.sh'",{timeout:20*60*1000});
      requireOk(r,'rotate-identities');
      fs.writeFileSync(path.join(ROOT,'identities-rotated'),now()+'\n',{mode:0o600});
      return r;
    }
    case 'migrate-prepare': {
      const r=ubuntu("OLD_DIAL_CONTROL_HOST=old-dial-hermes-control DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/netcup/hermes-control/migrate-from-oracle-control.sh --prepare");
      requireOk(r,'migrate-prepare');
      fs.mkdirSync(path.join(CONTROL,'state'),{recursive:true});
      fs.writeFileSync(path.join(CONTROL,'state/migration-prepare-complete'),now()+'\n',{mode:0o600});
      return r;
    }
    case 'migrate-cutover': {
      const r=ubuntu("OLD_DIAL_CONTROL_HOST=old-dial-hermes-control DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/netcup/hermes-control/migrate-from-oracle-control.sh --cutover",30*60*1000);
      requireOk(r,'migrate-cutover');
      fs.mkdirSync(path.join(CONTROL,'state'),{recursive:true});
      fs.writeFileSync(path.join(CONTROL,'state/migration-cutover-complete'),now()+'\n',{mode:0o600});
      return r;
    }
    case 'activate': {
      const r=ubuntu("DIAL_CONTROL_OVERLAY_IP=10.77.0.1 DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/netcup/hermes-control/postboot-converge.sh --activate",30*60*1000);
      requireOk(r,'activate');
      fs.mkdirSync(path.join(CONTROL,'state'),{recursive:true});
      fs.writeFileSync(path.join(CONTROL,'state/netcup-control-active'),now()+'\n',{mode:0o600});
      return r;
    }
    case 'ensure-github-admin-runner': {
      const auth=ubuntu("gh auth status",2*60*1000);
      requireOk(auth,'github-auth');
      const r=ubuntu("DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/netcup/hermes-control/install-github-admin-runner.sh",20*60*1000);
      requireOk(r,'ensure-github-admin-runner');
      return r;
    }
    case 'certify': {
      const verify=ubuntu("DIAL_CONTROL_OVERLAY_IP=10.77.0.1 DIAL_REPO_DIR=/home/ubuntu/dial-new /home/ubuntu/dial-new/ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control --profile CORE_DEVELOPMENT --json",30*60*1000);
      requireOk(verify,'certify-core');
      const peers=peerCheck().filter((x)=>x.ip!=='10.77.0.5');
      if(!peers.every((x)=>x.ping&&x.ssh)) throw Object.assign(new Error('final peer certification failed'),{result:{peers}});
      fs.writeFileSync(path.join(CONTROL,'state/zero-touch-certified'),now()+'\n',{mode:0o600});
      // The public bootstrap ingress is temporary. Once certification is sealed,
      // retire it asynchronously after this response has been returned.
      const runner=command("systemctl list-units --type=service --state=running --no-legend | grep -q 'actions.runner.*dial-control-admin'");
      if(!runner.ok) throw new Error('GitHub admin runner must be active before retiring bootstrap OIDC ingress');
      command("systemd-run --unit=dial-retire-github-oidc --on-active=15s /bin/bash -lc 'ufw delete allow 9134/tcp >/dev/null 2>&1 || true; systemctl disable --now dial-github-oidc-control.service'",{timeout:10000});
      return {verify:verify.stdout,peers,github_admin_runner:true,oidc_retirement_scheduled:true};
    }
    default:
      throw new Error('unsupported action');
  }
}

const server=http.createServer(async (req,res)=>{
  try{
    if(req.method!=='POST'||req.url!=='/v1/action'){res.writeHead(404);res.end('not found');return;}
    const chunks=[]; let size=0;
    for await(const c of req){size+=c.length;if(size>128*1024) throw new Error('request too large');chunks.push(c);}
    const raw=Buffer.concat(chunks);
    const hash=crypto.createHash('sha256').update(raw).digest('hex');
    const expectedAudience='dial-control:'+hash;
    const auth=String(req.headers.authorization||'');
    if(!auth.startsWith('Bearer ')) throw new Error('missing bearer');
    const claims=await verifyToken(auth.slice(7),expectedAudience);
    const body=JSON.parse(raw.toString('utf8'));
    audit({event:'ACTION_START',action:body.action,actor:claims.actor,ref:claims.ref,workflow_ref:claims.workflow_ref,run_id:claims.run_id||null});
    const result=await dispatch(body,claims);
    audit({event:'ACTION_PASS',action:body.action,actor:claims.actor,ref:claims.ref});
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({ok:true,action:body.action,result}));
  }catch(e){
    audit({event:'ACTION_FAIL',error:String(e?.message||e),result:e?.result||null});
    res.writeHead(403,{'content-type':'application/json'});
    res.end(JSON.stringify({ok:false,error:String(e?.message||e),result:e?.result||null}));
  }
});
server.listen(PORT,'0.0.0.0',()=>{
  audit({event:'SERVER_READY',port:PORT});
});
