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
  '/.github/workflows/netcup-admin-oidc.yml@',
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
    env:{...process.env,PATH:(process.env.PATH||'/usr/local/bin:/usr/bin:/bin')+':/usr/local/sbin:/usr/sbin:/sbin',...env},
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
    '/usr/sbin/runuser -u ubuntu -- env HOME=/home/ubuntu XDG_RUNTIME_DIR=/run/user/'+uid+
    ' DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/'+uid+'/bus '+
    ' PATH=/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin '+cmd,
    {timeout}
  );
}
function repoHead() {
  const gitDir='/home/ubuntu/dial-new/.git';
  try {
    const head=fs.readFileSync(path.join(gitDir,'HEAD'),'utf8').trim();
    if(/^[0-9a-f]{40}$/.test(head)) return head;
    const match=head.match(/^ref:\s+(.+)$/);
    if(match) {
      const refName=match[1];
      const loose=path.join(gitDir,refName);
      if(fs.existsSync(loose)) {
        const value=fs.readFileSync(loose,'utf8').trim();
        if(/^[0-9a-f]{40}$/.test(value)) return value;
      }
      const packed=path.join(gitDir,'packed-refs');
      if(fs.existsSync(packed)) {
        for(const line of fs.readFileSync(packed,'utf8').split('\n')) {
          const parts=line.trim().split(/\s+/);
          if(parts.length===2 && parts[1]===refName && /^[0-9a-f]{40}$/.test(parts[0])) return parts[0];
        }
      }
    }
  } catch {}
  const result=ubuntu('git -c safe.directory=/home/ubuntu/dial-new -C /home/ubuntu/dial-new rev-parse HEAD 2>/dev/null');
  const value=result.stdout.trim();
  return result.ok && /^[0-9a-f]{40}$/.test(value) ? value : null;
}
function requireOk(result, label) {
  if(!result.ok) {
    const e=new Error(label+' failed');
    e.result=result;
    throw e;
  }
  return result;
}
// Retained Oracle peers: oracle-admin .2, vekl-worker .3, van-trading-core .4. The migration
// source (dial-hermes-control, a separate A1) is .5 only while enrolled and not yet retired.
const SOURCE_IP='10.77.0.5';
function sourceActive() {
  if(fs.existsSync(path.join(CONTROL,'state/a1-control-retired'))) return false;
  try {
    const receipt=JSON.parse(fs.readFileSync(path.join(ROOT,'oracle-peer-keys.json'),'utf8'));
    return validWgKey(receipt?.peers?.hermes_source);
  } catch { return false; }
}
function vanPending() { return fs.existsSync(path.join(CONTROL,'state/van-trading-core-pending-rebuild')); }
function estateValue(name) {
  try {
    const m=fs.readFileSync('/etc/dial/oracle-estate.env','utf8').match(new RegExp('^'+name+'=(.*)$','m'));
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
function peerKey() {
  return fs.existsSync('/home/ubuntu/.ssh/dial-oracle-admin')
    ? '/home/ubuntu/.ssh/dial-oracle-admin'
    : '/home/ubuntu/.ssh/dial-bootstrap-oracle';
}
// migrate-from-oracle-control.sh runs plain `ssh`/`rsync -e ssh` with no identity, so it was refused
// by the source (publickey, 2026-09-24). Put a shim first on PATH that adds the estate key.
const MIGRATION_SSH_DIR='/usr/local/lib/dial-control/migration-ssh';
function migrationEnv() {
  fs.mkdirSync(MIGRATION_SSH_DIR,{recursive:true,mode:0o755});
  const shim=path.join(MIGRATION_SSH_DIR,'ssh');
  fs.writeFileSync(shim+'.tmp','#!/bin/sh\nexec /usr/bin/ssh -i '+peerKey()+' -o IdentitiesOnly=yes "$@"\n',{mode:0o755});
  fs.renameSync(shim+'.tmp',shim);
  return 'PATH='+MIGRATION_SSH_DIR+':/home/ubuntu/.local/bin:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin ';
}
function peerCheck() {
  const key=peerKey();
  const peers=['10.77.0.2','10.77.0.3'];
  if(!vanPending()) peers.push('10.77.0.4');
  if(sourceActive()) peers.push(SOURCE_IP);
  const out=[];
  for(const ip of peers){
    const p=command('ping -c 1 -W 2 '+ip);
    const s=command("/usr/sbin/runuser -u ubuntu -- ssh -i "+key+" -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new ubuntu@"+ip+" 'hostname'");
    out.push({ip,ping:p.ok,ssh:s.ok,hostname:s.stdout.trim(),ssh_error:s.stderr.trim()});
  }
  return out;
}
async function dispatch(body, claims) {
  const action=String(body.action||'');
  switch(action){
    case 'status': {
      const receiptPath=path.join(CONTROL,'bootstrap/image-bootstrap.receipt');
      const receiptExists=fs.existsSync(receiptPath);
      const receipt=receiptExists ? fs.readFileSync(receiptPath,'utf8') : '';
      const bootstrapRef=(receipt.match(/^bootstrap_ref=([0-9a-f]{40})$/m)||[])[1]||null;
      const bootstrapPhase=(receipt.match(/^bootstrap_phase=([^\n]+)$/m)||[])[1]||null;
      const currentRepoHead=repoHead();
      return {
        host:command('hostname').stdout.trim(),
        bootstrap_receipt:receiptExists,
        bootstrap_ref:bootstrapRef,
        bootstrap_phase:bootstrapPhase,
        repo_head:currentRepoHead,
        bootstrap_stage:fs.existsSync(path.join(CONTROL,'bootstrap/stage'))
          ? fs.readFileSync(path.join(CONTROL,'bootstrap/stage'),'utf8').trim()
          : null,
        bootstrap_failure:fs.existsSync(path.join(CONTROL,'bootstrap/failure-snapshot.txt'))
          ? fs.readFileSync(path.join(CONTROL,'bootstrap/failure-snapshot.txt'),'utf8').slice(-8000)
          : null,
        ssh_active:command('systemctl is-active ssh.service').ok,
        oidc_unit_active:command('systemctl is-active dial-github-oidc-control.service').ok,
        oidc_ready:true,
        recovery_ready:fs.existsSync(path.join(ROOT,'github-oci-ready')),
        oci_estate_inventory:fs.existsSync('/etc/dial/oracle-estate.env'),
        oci_peers_enrolled:fs.existsSync(path.join(ROOT,'oracle-peer-keys.json')),
        housekeeping_estate:fs.existsSync(path.join(ROOT,'housekeeping-estate-installed')),
        overlay_verified:fs.existsSync(path.join(ROOT,'overlay-verified')),
        rotated:fs.existsSync(path.join(ROOT,'identities-rotated')),
        migration_prepare:fs.existsSync(path.join(CONTROL,'state/migration-prepare-complete')),
        migration_cutover:fs.existsSync(path.join(CONTROL,'state/migration-cutover-complete')),
        control_active:fs.existsSync(path.join(CONTROL,'state/netcup-control-active')),
        source_retirement_preflight:fs.existsSync(path.join(CONTROL,'state/source-retirement-preflight-complete')),
        a1_control_retired:fs.existsSync(path.join(CONTROL,'state/a1-control-retired')),
        github_admin_runner:command("systemctl list-units --type=service --state=running --no-legend | grep -q 'actions.runner.*dial-control-admin'").ok,
        certified:fs.existsSync(path.join(CONTROL,'state/zero-touch-certified')),
        bootstrap_ssh_public_key:fs.existsSync('/home/ubuntu/.ssh/dial-bootstrap-oracle.pub')
          ? fs.readFileSync('/home/ubuntu/.ssh/dial-bootstrap-oracle.pub','utf8').trim()
          : null,
        wireguard_public_key:fs.existsSync('/etc/wireguard/dial-netcup.pub')
          ? fs.readFileSync('/etc/wireguard/dial-netcup.pub','utf8').trim()
          : null,
        github_bootstrap_age_recipient:fs.existsSync('/etc/dial/github-bootstrap-age.pub')
          ? fs.readFileSync('/etc/dial/github-bootstrap-age.pub','utf8').trim()
          : null,
      };
    }
    case 'mark-recovery-ready': {
      fs.writeFileSync(path.join(ROOT,'github-oci-ready'),now()+'\n',{mode:0o600});
      return {ready:true};
    }
    case 'install-oci-recovery-bundle': {
      const ciphertext=String(body.ciphertext_b64||'');
      if(!ciphertext || ciphertext.length > 196608) throw new Error('invalid OCI recovery bundle');
      const key='/etc/dial/github-bootstrap-age.key';
      if(!fs.existsSync(key)) throw new Error('age bootstrap identity missing');
      const encrypted=path.join(ROOT,'oci-bundle.age');
      const clear=path.join(ROOT,'oci-bundle.json');
      fs.writeFileSync(encrypted,Buffer.from(ciphertext,'base64'),{mode:0o600});
      const dec=command("age --decrypt -i "+key+" -o "+clear+" "+encrypted,{timeout:30000});
      requireOk(dec,'decrypt-oci-bundle');
      const bundle=JSON.parse(fs.readFileSync(clear,'utf8'));
      for(const k of ['user','tenancy','fingerprint','region','private_key']){
        if(!String(bundle[k]||'').trim()) throw new Error('OCI bundle missing '+k);
      }
      fs.mkdirSync('/home/ubuntu/.oci',{recursive:true,mode:0o700});
      fs.writeFileSync('/home/ubuntu/.oci/netcup-recovery.pem',String(bundle.private_key).trim()+'\n',{mode:0o600});
      const config=[
        '[DEFAULT]',
        'user='+String(bundle.user).trim(),
        'fingerprint='+String(bundle.fingerprint).trim(),
        'tenancy='+String(bundle.tenancy).trim(),
        'region='+String(bundle.region).trim(),
        'key_file=/home/ubuntu/.oci/netcup-recovery.pem',
        '',
      ].join('\n');
      fs.writeFileSync('/home/ubuntu/.oci/config',config,{mode:0o600});
      command("chown -R ubuntu:ubuntu /home/ubuntu/.oci && chmod 700 /home/ubuntu/.oci && chmod 600 /home/ubuntu/.oci/config /home/ubuntu/.oci/netcup-recovery.pem");
      fs.rmSync(encrypted,{force:true}); fs.rmSync(clear,{force:true});
      const probe=ubuntu("oci iam region list >/dev/null",120000);
      requireOk(probe,'oci-recovery-probe');
      fs.writeFileSync(path.join(ROOT,'github-oci-ready'),now()+'\n',{mode:0o600});
      return {installed:true,probe:'PASS'};
    }
    case 'oci-enroll-estate': {
      if(!fs.existsSync(path.join(ROOT,'github-oci-ready'))) throw new Error('local OCI recovery authority is not ready');
      const helper='/usr/local/lib/dial-control/oci-enroll-oracle-estate.sh';
      if(!fs.existsSync(helper)) throw new Error('OCI estate enrollment helper missing');
      const r=command("bash '"+helper+"'",{timeout:20*60*1000});
      requireOk(r,'oci-enroll-estate');
      const keysPath=path.join(ROOT,'oracle-peer-keys.json');
      if(!fs.existsSync(keysPath)) throw new Error('OCI peer key receipt missing');
      const receipt=JSON.parse(fs.readFileSync(keysPath,'utf8'));
      for(const k of (vanPending() ? ['oracle_admin','vekl_worker'] : ['oracle_admin','vekl_worker','van_trading_core'])){
        if(!validWgKey(receipt?.peers?.[k])) throw new Error('invalid persisted peer key '+k);
      }
      if(receipt.peers.hermes_source!==undefined && !validWgKey(receipt.peers.hermes_source)) throw new Error('invalid persisted peer key hermes_source');
      if(receipt.schema_version!==2 || receipt.retained_oracle_instances!==(vanPending()?2:3)) throw new Error('OCI estate physical identity count invalid');
      return {receipt,stdout:r.stdout};
    }
    case 'configure-overlay': {
      for(const k of (vanPending() ? ['oracle_admin','vekl_worker'] : ['oracle_admin','vekl_worker','van_trading_core'])){
        if(!validWgKey(body?.peers?.[k])) throw new Error('invalid WireGuard public key for '+k);
      }
      const src=body?.peers?.hermes_source||'';
      if(src && !validWgKey(src)) throw new Error('invalid WireGuard public key for hermes_source');
      const hubScript='/usr/local/lib/dial-control/configure-wireguard-fabric.sh';
      if(!fs.existsSync(hubScript)) throw new Error('installed WireGuard hub helper missing');
      const r=command(
        "bash '"+hubScript+"'",
        {env:{
          ORACLE_ADMIN_WG_PUBLIC_KEY:body.peers.oracle_admin,
          VEKL_WORKER_WG_PUBLIC_KEY:body.peers.vekl_worker,
          VAN_TRADING_CORE_WG_PUBLIC_KEY:body.peers.van_trading_core||'',
          HERMES_SOURCE_WG_PUBLIC_KEY:fs.existsSync(path.join(CONTROL,'state/a1-control-retired')) ? '' : src,
        }}
      );
      requireOk(r,'configure-overlay');
      return r;
    }
    case 'verify-overlay': {
      // Peers dial the hub (PersistentKeepalive 25 s); the hub learns a peer's endpoint only from its
      // first handshake after the hub config lists its key. Checking at once reported a freshly
      // enrolled peer as "No route to host" (2026-09-23), so allow ~2 minutes for handshakes.
      let peers=peerCheck();
      for(let i=0;i<8 && !peers.every((x)=>x.ping&&x.ssh);i++){
        await new Promise((r)=>setTimeout(r,15000));
        peers=peerCheck();
      }
      if(!peers.every((x)=>x.ping&&x.ssh)) throw Object.assign(new Error('overlay verification failed'),{result:{peers}});
      fs.writeFileSync(path.join(ROOT,'overlay-verified'),now()+'\n',{mode:0o600});
      return {peers};
    }
    case 'install-housekeeping-estate': {
      if(!fs.existsSync(path.join(ROOT,'overlay-verified'))) throw new Error('housekeeping requires verified overlay');
      const helper='/usr/local/lib/dial-control/install-housekeeping-final-estate.sh';
      if(!fs.existsSync(helper)) throw new Error('housekeeping estate helper missing');
      const r=command("bash '"+helper+"'",{timeout:20*60*1000});
      requireOk(r,'install-housekeeping-estate');
      return r;
    }
    case 'rotate-identities': {
      const rotateScript='/usr/local/lib/dial-control/rotate-bootstrap-identities.sh';
      if(!fs.existsSync(rotateScript)) throw new Error('installed identity rotation helper missing');
      const r=command("bash '"+rotateScript+"'",{timeout:20*60*1000});
      requireOk(r,'rotate-identities');
      fs.writeFileSync(path.join(ROOT,'identities-rotated'),now()+'\n',{mode:0o600});
      return r;
    }
    case 'migrate-prepare': {
      const r=ubuntu(migrationEnv()+"OLD_DIAL_CONTROL_HOST=old-dial-hermes-control DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/netcup/hermes-control/migrate-from-oracle-control.sh --prepare");
      requireOk(r,'migrate-prepare');
      fs.mkdirSync(path.join(CONTROL,'state'),{recursive:true});
      fs.writeFileSync(path.join(CONTROL,'state/migration-prepare-complete'),now()+'\n',{mode:0o600});
      return r;
    }
    case 'activation-preflight': {
      if(!fs.existsSync(path.join(CONTROL,'state/migration-prepare-complete'))) throw new Error('migration prepare has not completed');
      if(!fs.existsSync(path.join(ROOT,'overlay-verified'))) throw new Error('overlay has not been verified');
      if(!fs.existsSync(path.join(ROOT,'github-oci-ready'))) throw new Error('OCI recovery plane not ready');
      const checks={
        codex:ubuntu("codex login status 2>&1 | grep -q 'Logged in using ChatGPT'",120000),
        claude:ubuntu("claude auth status >/dev/null 2>&1",120000),
        antigravity:ubuntu("timeout 30s agy sign-in status >/dev/null 2>&1",60000),
        xkiro:ubuntu("DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/oracle/hermes-codex/install-haif.sh >/dev/null && curl -fsS --max-time 10 http://127.0.0.1:9141/health >/dev/null",120000),
        stitch:ubuntu("timeout 90s DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/oracle/hermes-codex/run-stitch-provider.sh auth-check >/dev/null 2>&1",120000),
      };
      const failed=Object.entries(checks).filter(([,v])=>!v.ok).map(([k])=>k);
      if(failed.length) throw Object.assign(new Error('activation credential preflight failed'),{result:{failed}});
      return {ready:true,checks:Object.fromEntries(Object.entries(checks).map(([k,v])=>[k,v.ok]))};
    }
    case 'migrate-cutover': {
      const r=ubuntu(migrationEnv()+"OLD_DIAL_CONTROL_HOST=old-dial-hermes-control DIAL_REPO_DIR=/home/ubuntu/dial-new bash /home/ubuntu/dial-new/deploy/netcup/hermes-control/migrate-from-oracle-control.sh --cutover",30*60*1000);
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
    case 'source-retirement-preflight': {
      for(const marker of ['migration-cutover-complete','netcup-control-active']){
        if(!fs.existsSync(path.join(CONTROL,'state',marker))) throw new Error('source retirement preflight missing '+marker);
      }
      if(!fs.existsSync(path.join(ROOT,'overlay-verified'))) throw new Error('source retirement preflight requires verified overlay');
      if(!fs.existsSync(path.join(ROOT,'identities-rotated'))) throw new Error('source retirement preflight requires rotated identities');
      const verify=ubuntu("DIAL_CONTROL_OVERLAY_IP=10.77.0.1 DIAL_REPO_DIR=/home/ubuntu/dial-new /home/ubuntu/dial-new/ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control --profile CORE_DEVELOPMENT --json",30*60*1000);
      requireOk(verify,'source-retirement-netcup-core');
      const peers=peerCheck();
      if(!peers.every((x)=>x.ping&&x.ssh)) throw Object.assign(new Error('source retirement preflight peer failure'),{result:{peers}});
      const source=peers.find((x)=>x.ip===SOURCE_IP);
      if(!source || !source.ssh) throw new Error('migration source dial-hermes-control (10.77.0.5) unavailable');
      fs.writeFileSync(path.join(CONTROL,'state/source-retirement-preflight-complete'),now()+'\n',{mode:0o600});
      return {ready:true,verify:verify.stdout,peers};
    }
    case 'retire-a1-control-role': {
      if(!fs.existsSync(path.join(CONTROL,'state/source-retirement-preflight-complete'))) throw new Error('source retirement preflight has not completed');
      const r=command("bash /usr/local/lib/dial-control/retire-oracle-a1-control-role.sh",{timeout:20*60*1000});
      requireOk(r,'retire-a1-control-role');
      if(!fs.existsSync(path.join(CONTROL,'state/a1-control-retired'))) throw new Error('A1 retirement marker missing after retirement');
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
      if(!fs.existsSync(path.join(CONTROL,'state/a1-control-retired'))) throw new Error('final certification requires retired A1 control role');
      if(vanPending()) throw new Error('final certification requires the rebuilt van-trading-core (pending-rebuild marker still present)');
      const verify=ubuntu("DIAL_CONTROL_OVERLAY_IP=10.77.0.1 DIAL_REPO_DIR=/home/ubuntu/dial-new /home/ubuntu/dial-new/ops/development-bootstrap/bootstrap.sh --verify --role dial-hermes-control --profile CORE_DEVELOPMENT --json",30*60*1000);
      requireOk(verify,'certify-core');
      const peers=peerCheck();
      if(!peers.every((x)=>x.ping&&x.ssh)) throw Object.assign(new Error('final peer certification failed'),{result:{peers}});
      const a1=peers.find((x)=>x.ip==='10.77.0.4');
      if(!a1 || a1.hostname!=='van-trading-core') throw Object.assign(new Error('A1 final identity is not van-trading-core'),{result:{a1}});
      if(peers.some((x)=>x.ip===SOURCE_IP)) throw new Error('migration source is still an overlay peer');
      // Owner plan 2026-09-23: dial-hermes-control is re-roled into van-trading-core (same instance,
      // answering as van-trading-core at .4, checked above) or else must be terminated.
      const sourceOcid=estateValue('DIAL_HERMES_CONTROL_SOURCE_OCID');
      if(sourceOcid && sourceOcid!==estateValue('VAN_TRADING_CORE_OCID')){
        const st=ubuntu("oci compute instance get --instance-id '"+sourceOcid.replace(/[^A-Za-z0-9._-]/g,'')+"' --query 'data.\"lifecycle-state\"' --raw-output",120000);
        requireOk(st,'certify-source-termination-state');
        if(!['TERMINATED','TERMINATING'].includes(st.stdout.trim())) throw Object.assign(new Error('dial-hermes-control must be terminated before certification (owner action)'),{result:{source_ocid:sourceOcid,state:st.stdout.trim()}});
      }
      const runner=command("systemctl list-units --type=service --state=running --no-legend | grep -q 'actions.runner.*dial-control-admin'");
      fs.writeFileSync(path.join(CONTROL,'state/zero-touch-certified'),now()+'\n',{mode:0o600});
      return {verify:verify.stdout,peers,a1_retired:true,hermes_source_terminated:true,github_admin_runner:runner.ok,github_oidc_admin:true};
    }
    case 'admin-command': {
      if(!String(claims.workflow_ref||'').includes('/.github/workflows/netcup-admin-oidc.yml@')) throw new Error('admin workflow refused');
      if(body.ack!=='I_UNDERSTAND_ROOT') throw new Error('admin acknowledgement missing');
      const raw=Buffer.from(String(body.command_b64||''),'base64').toString('utf8');
      if(!raw.trim() || raw.length > 32768) throw new Error('invalid admin command');
      const hash=crypto.createHash('sha256').update(raw).digest('hex');
      audit({event:'ADMIN_COMMAND_START',actor:claims.actor,ref:claims.ref,command_sha256:hash});
      const r=command(raw,{timeout:20*60*1000});
      audit({event:'ADMIN_COMMAND_END',actor:claims.actor,ref:claims.ref,command_sha256:hash,status:r.status,ok:r.ok});
      requireOk(r,'admin-command');
      return {command_sha256:hash,...r};
    }
    default:
      throw new Error('unsupported action');
  }
}

const server=http.createServer(async (req,res)=>{
  try{
    if(req.method==='GET' && req.url==='/healthz'){
      const receiptPath=path.join(CONTROL,'bootstrap/image-bootstrap.receipt');
      const receipt=fs.existsSync(receiptPath)?fs.readFileSync(receiptPath,'utf8'):'';
      const bootstrapRef=(receipt.match(/^bootstrap_ref=([0-9a-f]{40})$/m)||[])[1]||null;
      const bootstrapPhase=(receipt.match(/^bootstrap_phase=([^\n]+)$/m)||[])[1]||null;
      const currentRepoHead=repoHead();
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({ok:true,host:command('hostname').stdout.trim(),bootstrap_ref:bootstrapRef,bootstrap_phase:bootstrapPhase,repo_head:currentRepoHead}));
      return;
    }
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
