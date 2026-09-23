import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DEFAULT_CONTROL_HOME, readJson, resolveControlPath } from './state-store.mjs';
import { captureGitState } from './checkpoint-store.mjs';
import { writeMemoryCandidate } from './shared-project-memory.mjs';

const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SERIAL_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const GRADLE_TASK_RE = /^[A-Za-z0-9_.:-]{1,160}$/;
const PROFILES = new Set(['flash', 'pro']);
const MAX_OUTPUT = 8 * 1024 * 1024;

function slug(value, label='value') {
  const out=String(value||'').toLowerCase().replace(/[^a-z0-9._:-]+/g,'-').replace(/^-+|-+$/g,'');
  if(!/^[a-z0-9][a-z0-9._:-]{0,220}$/.test(out)) throw new Error(`invalid ${label}: ${value}`);
  return out;
}
function redact(value) {
  return String(value ?? '')
    .replace(/\b(?:api[_-]?key|secret|token|authorization)\s*[=:]\s*["']?[^\s"'{}]{8,}/gi, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{16,}/gi, 'Bearer [REDACTED]');
}
function sha256(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function bounded(text, max=500000) {
  const s=redact(text);
  return s.length>max ? `${s.slice(0,max)}\n...[bounded]` : s;
}
function cfg(root=DEFAULT_CONTROL_HOME) {
  return {
    artemis: process.env.DIAL_ARTEMIS_BIN || '/opt/hermes-mobile-fabric/artemis/current/.venv/bin/artemis',
    adb: process.env.DIAL_ADB_BIN || 'adb',
    evidenceRoot: process.env.DIAL_ANDROID_EVIDENCE_ROOT || resolveControlPath('android-testing/evidence',root),
  };
}
function allowedSerials(root=DEFAULT_CONTROL_HOME) {
  const fromEnv=String(process.env.DIAL_ANDROID_DEVICE_SERIALS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const doc=readJson('config/android-testing-devices.json',{devices:[]},root);
  const fromFile=(doc.devices||[]).filter(d=>d?.enabled!==false).map(d=>String(d.serial||'').trim()).filter(Boolean);
  return new Set([...fromEnv,...fromFile].filter(x=>SERIAL_RE.test(x)));
}
function requireSerial(serial, root) {
  const s=String(serial||'').trim();
  if(!SERIAL_RE.test(s)) throw new Error('invalid Android device serial');
  const allowed=allowedSerials(root);
  if(!allowed.has(s)) throw new Error(`Android device is not admitted to the Hermes test plane: ${s}`);
  return s;
}
function requireProfile(value) {
  const p=String(value||'flash').toLowerCase();
  if(!PROFILES.has(p)) throw new Error(`unsupported ARTEMIS profile: ${value}`);
  return p;
}
function requirePackage(value) {
  const p=String(value||'').trim();
  if(!PACKAGE_RE.test(p)) throw new Error('invalid Android package name');
  return p;
}
function within(base,target) {
  const b=path.resolve(base), t=path.resolve(target);
  return t===b || t.startsWith(`${b}${path.sep}`);
}
function runFile(command,args,{cwd,env,timeoutMs=1800000,encoding='utf8'}={}) {
  return execFileSync(command,args,{
    cwd,
    env:{...process.env,...(env||{})},
    timeout:timeoutMs,
    maxBuffer:MAX_OUTPUT,
    encoding,
    stdio:['ignore','pipe','pipe'],
    windowsHide:true,
  });
}
function acquireLease(serial,root) {
  const dir=resolveControlPath('android-testing/leases',root);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,`${slug(serial,'serial')}.lock`);
  let fd;
  try { fd=fs.openSync(file,'wx',0o600); }
  catch(e) { if(e?.code==='EEXIST') throw new Error(`Android device already leased: ${serial}`); throw e; }
  fs.writeFileSync(fd,JSON.stringify({serial,pid:process.pid,at:new Date().toISOString()}));
  return ()=>{ try{fs.closeSync(fd);}catch{} try{fs.unlinkSync(file);}catch{} };
}
function evidenceDir(project,root) {
  const id=`run-${new Date().toISOString().replace(/[:.]/g,'')}-${crypto.randomBytes(4).toString('hex')}`;
  const dir=path.join(cfg(root).evidenceRoot,slug(project,'project'),id);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  return {id,dir};
}
function saveText(file,value) { fs.writeFileSync(file,bounded(value),{mode:0o600}); }
function captureFinalArtifacts({serial,dir,root}) {
  const c=cfg(root);
  const out={};
  try {
    const png=runFile(c.adb,['-s',serial,'exec-out','screencap','-p'],{encoding:null,timeoutMs:30000});
    const file=path.join(dir,'final-screen.png'); fs.writeFileSync(file,png,{mode:0o600});
    out.screenshot={file,sha256:sha256(png),bytes:png.length};
  } catch(e) { out.screenshot_error=String(e?.message||e); }
  try {
    const logcat=runFile(c.adb,['-s',serial,'logcat','-d','-v','threadtime','-t','5000'],{timeoutMs:45000});
    const text=bounded(logcat,1500000), file=path.join(dir,'logcat.txt'); saveText(file,text);
    out.logcat={file,sha256:sha256(text),bytes:Buffer.byteLength(text)};
  } catch(e) { out.logcat_error=String(e?.message||e); }
  return out;
}
export function androidTestingStatus({root=DEFAULT_CONTROL_HOME}={}) {
  const c=cfg(root);
  let adb='';
  try { adb=runFile(c.adb,['devices','-l'],{timeoutMs:15000}); } catch(e) { adb=String(e?.message||e); }
  let artemis='';
  try { artemis=runFile(c.artemis,['status'],{timeoutMs:20000}); } catch(e) { artemis=String(e?.message||e); }
  return {
    plane:'HERMES_ANDROID_TESTING_PLANE',
    authority:'HERMES_GOVERNED_SUBORDINATE',
    artemis_binary:c.artemis,
    artemis_present:fs.existsSync(c.artemis),
    admitted_devices:[...allowedSerials(root)].sort(),
    adb:bounded(adb,12000),
    artemis:bounded(artemis,12000),
    security:{
      raw_artemis_mcp_exposed:false,
      adb_expected_binding:'loopback_or_governed_device_bridge',
      shell_execution_from_mcp:false,
      device_lease_required:true,
      upstream_shell_hardening_patch_required:true,
    },
  };
}
export async function runAndroidTest({
  project,
  repoDir,
  deviceSerial,
  objective,
  profile='flash',
  gradleTask=null,
  apkPath=null,
  packageName=null,
  timeoutMs=1800000,
  root=DEFAULT_CONTROL_HOME,
  sourceHarness='hermes',
}={}) {
  const projectId=slug(project,'project');
  const serial=requireSerial(deviceSerial,root);
  const selectedProfile=requireProfile(profile);
  const task=String(objective||'').trim();
  if(!task || task.length>12000) throw new Error('Android test objective is required and must be <= 12000 characters');
  const repo=path.resolve(repoDir||'.');
  if(!fs.existsSync(repo)) throw new Error(`repository missing: ${repo}`);
  const release=acquireLease(serial,root);
  const run=evidenceDir(projectId,root);
  const c=cfg(root);
  const started=new Date().toISOString();
  let build=null, install=null, artemis=null, success=false, error=null;
  try {
    try { runFile(c.adb,['-s',serial,'logcat','-c'],{timeoutMs:15000}); } catch {}
    if(gradleTask) {
      const gt=String(gradleTask).trim();
      if(!GRADLE_TASK_RE.test(gt)) throw new Error('invalid Gradle task');
      const gradlew=path.join(repo,'gradlew');
      if(!fs.existsSync(gradlew)) throw new Error('gradlew not found in repository');
      const output=runFile(gradlew,[gt,'--no-daemon'],{cwd:repo,timeoutMs:Math.min(Math.max(Number(timeoutMs)||1800000,60000),2700000)});
      saveText(path.join(run.dir,'gradle.txt'),output);
      build={task:gt,output_sha256:sha256(bounded(output))};
    }
    if(apkPath) {
      const absolute=path.resolve(repo,apkPath);
      if(!within(repo,absolute)) throw new Error('APK path escapes repository');
      if(!fs.existsSync(absolute) || !absolute.endsWith('.apk')) throw new Error(`APK not found: ${absolute}`);
      const output=runFile(c.adb,['-s',serial,'install','-r','-g',absolute],{timeoutMs:180000});
      install={apk:path.relative(repo,absolute),apk_sha256:sha256(fs.readFileSync(absolute)),result:bounded(output,12000)};
    }
    if(packageName) requirePackage(packageName);
    const env={ADB_DEVICE_SERIAL:serial,DIAL_ANDROID_TEST_RUN_ID:run.id};
    const output=runFile(c.artemis,['run',task,'--profile',selectedProfile],{
      cwd:path.resolve(path.dirname(c.artemis),'../..'),
      env,
      timeoutMs:Math.min(Math.max(Number(timeoutMs)||1800000,60000),2700000),
    });
    saveText(path.join(run.dir,'artemis.txt'),output);
    artemis={profile:selectedProfile,output_sha256:sha256(bounded(output)),output:bounded(output,80000)};
    success=true;
  } catch(e) {
    error=bounded(e?.stderr || e?.stdout || e?.message || e,80000);
    saveText(path.join(run.dir,'failure.txt'),error);
  } finally {
    const artifacts=captureFinalArtifacts({serial,dir:run.dir,root});
    const git=captureGitState(repo);
    const summary={
      schema_version:1,run_id:run.id,project:projectId,device_serial:serial,profile:selectedProfile,
      objective_sha256:sha256(task),repository_sha:git.commit,branch:git.branch,started_at:started,finished_at:new Date().toISOString(),
      success,build,install,artemis,error,artifacts,
      authority:'TEST_EVIDENCE_NON_AUTHORITATIVE_UNTIL_RECONCILED',
    };
    const summaryPath=path.join(run.dir,'summary.json');
    const tmpSummary=`${summaryPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpSummary,`${JSON.stringify(summary,null,2)}\n`,{mode:0o600});
    fs.renameSync(tmpSummary,summaryPath);
    const candidate=writeMemoryCandidate({
      project:projectId,tier:'HOT',type:'TEST_EVIDENCE',
      text:`Android test ${run.id} ${success?'PASSED':'FAILED'} on ${serial}. Objective hash ${summary.objective_sha256}. Repository ${git.commit}.`,
      refs:[`android-evidence:${path.relative(root||DEFAULT_CONTROL_HOME,run.dir)}`,`git:${git.commit}`],
      sourceHarness,repositorySha:git.commit,metadata:{run_id:run.id,success,profile:selectedProfile,device_serial:serial},
    },root);
    summary.memory_candidate={memory_id:candidate.memory_id,object_rel:candidate.object_rel};
    const tmpFinal=`${summaryPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpFinal,`${JSON.stringify(summary,null,2)}\n`,{mode:0o600});
    fs.renameSync(tmpFinal,summaryPath);
    release();
    return summary;
  }
}
