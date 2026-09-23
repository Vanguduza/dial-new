import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DEFAULT_CONTROL_HOME, readJson, resolveControlPath } from './state-store.mjs';
import { captureGitState } from './checkpoint-store.mjs';
import { writeMemoryCandidate } from './shared-project-memory.mjs';
import {
  ARTEMIS_SUBORDINATE_CAPABILITIES,
  artemisSubordinateConfig,
  invokeArtemisSubordinate,
} from './artemis-subordinate-client.mjs';

const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SERIAL_RE = /^[A-Za-z0-9._:-]{1,160}$/;
const TRACE_RE = /^[A-Za-z0-9._:-]{1,200}$/;
const AVD_RE = /^[A-Za-z0-9._ -]{1,120}$/;
const GRADLE_TASK_RE = /^[A-Za-z0-9_.:-]{1,160}$/;
const PROFILES = new Set(['flash', 'pro']);
const VERIFICATION_LEVELS = new Set(['off', 'final', 'checkpoints', 'strict']);
const EXPLORER_MODES = new Set(['flash', 'pro', 'ultra']);
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
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
  const upstream=artemisSubordinateConfig();
  return {
    ...upstream,
    artemis: upstream.binary,
    adb: process.env.DIAL_ADB_BIN || 'adb',
    evidenceRoot: process.env.DIAL_ANDROID_EVIDENCE_ROOT || resolveControlPath('android-testing/evidence',root),
    taskRoot: resolveControlPath('android-testing/tasks',root),
    observationRoot: resolveControlPath('android-testing/observations',root),
  };
}
function admissionDoc(root=DEFAULT_CONTROL_HOME) {
  return readJson('config/android-testing-devices.json',{schema_version:2,devices:[],avds:[]},root);
}
function allowedSerials(root=DEFAULT_CONTROL_HOME) {
  const fromEnv=String(process.env.DIAL_ANDROID_DEVICE_SERIALS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const doc=admissionDoc(root);
  const fromFile=(doc.devices||[]).filter(d=>d?.enabled!==false).map(d=>String(d.serial||'').trim()).filter(Boolean);
  return new Set([...fromEnv,...fromFile].filter(x=>SERIAL_RE.test(x)));
}
function allowedAvds(root=DEFAULT_CONTROL_HOME) {
  const fromEnv=String(process.env.DIAL_ANDROID_AVDS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const doc=admissionDoc(root);
  const fromFile=(doc.avds||[]).filter(v=>typeof v==='string' || v?.enabled!==false).map(v=>String(typeof v==='string'?v:v.name||'').trim()).filter(Boolean);
  return new Set([...fromEnv,...fromFile].filter(x=>AVD_RE.test(x)));
}
function requireSerial(serial, root) {
  const s=String(serial||'').trim();
  if(!SERIAL_RE.test(s)) throw new Error('invalid Android device serial');
  const allowed=allowedSerials(root);
  if(!allowed.has(s)) throw new Error(`Android device is not admitted to the Hermes test plane: ${s}`);
  return s;
}
function requireTrace(traceId) {
  const t=String(traceId||'').trim();
  if(!TRACE_RE.test(t)) throw new Error('invalid ARTEMIS trace id');
  return t;
}
function requireProfile(value) {
  const p=String(value||'flash').toLowerCase();
  if(!PROFILES.has(p)) throw new Error(`unsupported ARTEMIS profile: ${value}`);
  return p;
}
function requireVerification(value, profile) {
  if(profile!=='pro') return null;
  const v=String(value||'strict').toLowerCase();
  if(!VERIFICATION_LEVELS.has(v)) throw new Error(`unsupported ARTEMIS verification level: ${value}`);
  return v;
}
function requireExplorer(value, profile) {
  if(profile!=='pro') return null;
  const v=String(value||'flash').toLowerCase();
  if(!EXPLORER_MODES.has(v)) throw new Error(`unsupported ARTEMIS explorer mode: ${value}`);
  return v;
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
function connectedReadySerials(root=DEFAULT_CONTROL_HOME) {
  const allowed=allowedSerials(root);
  const c=cfg(root);
  let text='';
  try { text=runFile(c.adb,['devices','-l'],{timeoutMs:15000}); } catch { return []; }
  return String(text).split(/\r?\n/).slice(1).map(line=>line.trim()).filter(Boolean).map(line=>{
    const [serial,state]=line.split(/\s+/,3);
    return {serial,state};
  }).filter(x=>x.state==='device' && allowed.has(x.serial)).map(x=>x.serial).sort();
}
function resolveAdmittedSerial(serial,root) {
  if(serial) return requireSerial(serial,root);
  const ready=connectedReadySerials(root);
  if(ready.length===1) return ready[0];
  if(ready.length===0) throw new Error('no connected admitted Android device is ready');
  throw new Error(`multiple connected admitted Android devices are ready; device_serial is required: ${ready.join(', ')}`);
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
function evidenceDir(project,root,id=null) {
  const runId=id ? slug(id,'evidence id') : `run-${new Date().toISOString().replace(/[:.]/g,'')}-${crypto.randomBytes(4).toString('hex')}`;
  const dir=path.join(cfg(root).evidenceRoot,slug(project,'project'),runId);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  return {id:runId,dir};
}
function saveText(file,value) { fs.writeFileSync(file,bounded(value),{mode:0o600}); }
function writeJsonAtomic(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=`${file}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
  fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});
  fs.renameSync(tmp,file);
}
function readJsonFile(file) { return JSON.parse(fs.readFileSync(file,'utf8')); }
function taskRecordPath(traceId,root) { return path.join(cfg(root).taskRoot,`${slug(requireTrace(traceId),'trace id')}.json`); }
function loadTaskRecord(traceId,root) {
  const file=taskRecordPath(traceId,root);
  if(!fs.existsSync(file)) throw new Error(`ARTEMIS trace is not owned by the Hermes Android plane: ${traceId}`);
  return {file,record:readJsonFile(file)};
}
function captureFinalArtifacts({serial,dir,root}) {
  const c=cfg(root);
  const out={};
  try {
    const png=runFile(c.adb,['-s',serial,'exec-out','screencap','-p'],{encoding:null,timeoutMs:30000});
    const file=path.join(dir,'final-screen.png'); fs.writeFileSync(file,png,{mode:0o600});
    out.screenshot={file,sha256:sha256(png),bytes:png.length};
  } catch(e) { out.screenshot_error=bounded(e?.message||e,12000); }
  try {
    const logcat=runFile(c.adb,['-s',serial,'logcat','-d','-v','threadtime','-t','5000'],{timeoutMs:45000});
    const text=bounded(logcat,1500000), file=path.join(dir,'logcat.txt'); saveText(file,text);
    out.logcat={file,sha256:sha256(text),bytes:Buffer.byteLength(text)};
  } catch(e) { out.logcat_error=bounded(e?.message||e,12000); }
  return out;
}
function safeArtemisFile(file,root) {
  if(!file) return null;
  const c=cfg(root);
  const resolved=path.resolve(String(file).replace(/^file:\/\//,''));
  if(!within(c.root,resolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}
function copyTextEvidence(source,dest,root,max=1500000) {
  const safe=safeArtemisFile(source,root);
  if(!safe) return null;
  const text=bounded(fs.readFileSync(safe,'utf8'),max);
  fs.writeFileSync(dest,text,{mode:0o600});
  return {file:dest,sha256:sha256(text),bytes:Buffer.byteLength(text)};
}
function deriveTraceFiles(record,status,root) {
  const candidates={
    stdout:status?.stdout_log || record?.upstream?.stdout_log,
    stderr:status?.stderr_log || record?.upstream?.stderr_log,
  };
  const stdout=safeArtemisFile(candidates.stdout,root);
  const traceDir=stdout ? path.dirname(stdout) : null;
  if(traceDir){
    candidates.run_outcome=path.join(traceDir,'run_outcome.json');
    candidates.output=path.join(traceDir,'notes','output.md');
    candidates.task_plan=path.join(traceDir,'notes','task_plan.md');
  }
  return candidates;
}
function sealAsyncEvidence(traceId,status,root=DEFAULT_CONTROL_HOME) {
  const loaded=loadTaskRecord(traceId,root);
  const rec=loaded.record;
  if(rec.evidence?.sealed_at) return rec.evidence;
  const run=evidenceDir(rec.project,root,`trace-${traceId}`);
  const artifacts=captureFinalArtifacts({serial:rec.device_serial,dir:run.dir,root});
  const traceFiles=deriveTraceFiles(rec,status,root);
  const upstream_artifacts={};
  for(const [name,source] of Object.entries(traceFiles)){
    const ext=path.extname(String(source||'')) || '.txt';
    const copied=copyTextEvidence(source,path.join(run.dir,`${name}${ext}`),root);
    if(copied) upstream_artifacts[name]=copied;
  }
  const summary={
    schema_version:1,
    trace_id:traceId,
    project:rec.project,
    device_serial:rec.device_serial,
    profile:rec.profile,
    objective_sha256:rec.objective_sha256,
    repository_sha:rec.repository_sha,
    started_at:rec.started_at,
    sealed_at:new Date().toISOString(),
    upstream_status:status?.status || 'unknown',
    test_summary:status?.test_summary || null,
    artifacts,
    upstream_artifacts,
    authority:'TEST_EVIDENCE_NON_AUTHORITATIVE_UNTIL_RECONCILED',
  };
  const summaryPath=path.join(run.dir,'summary.json');
  writeJsonAtomic(summaryPath,summary);
  const candidate=writeMemoryCandidate({
    project:rec.project,tier:'HOT',type:'TEST_EVIDENCE',
    text:`ARTEMIS Android trace ${traceId} ended ${summary.upstream_status} on ${rec.device_serial}. Objective hash ${rec.objective_sha256}. Repository ${rec.repository_sha}.`,
    refs:[`android-evidence:${path.relative(root||DEFAULT_CONTROL_HOME,run.dir)}`,`artemis-trace:${traceId}`,`git:${rec.repository_sha}`],
    sourceHarness:rec.source_harness||'hermes',repositorySha:rec.repository_sha,
    metadata:{trace_id:traceId,status:summary.upstream_status,profile:rec.profile,device_serial:rec.device_serial},
  },root);
  rec.evidence={sealed_at:summary.sealed_at,dir:run.dir,summary_path:summaryPath,memory_candidate:{memory_id:candidate.memory_id,object_rel:candidate.object_rel}};
  writeJsonAtomic(loaded.file,rec);
  return rec.evidence;
}

export function androidTestingStatus({root=DEFAULT_CONTROL_HOME}={}) {
  const c=cfg(root);
  let adb='';
  try { adb=runFile(c.adb,['devices','-l'],{timeoutMs:15000}); } catch(e) { adb=String(e?.message||e); }
  let artemis='';
  try { artemis=runFile(c.artemis,['status'],{timeoutMs:20000}); } catch(e) { artemis=String(e?.message||e); }
  return {
    plane:'HERMES_ANDROID_TESTING_PLANE',
    authority:'HERMES_CONTROL_AUTHORITY',
    subordinate:'ARTEMIS',
    artemis_binary:c.artemis,
    artemis_present:fs.existsSync(c.artemis),
    raw_upstream_mcp_exposed:false,
    admitted_devices:[...allowedSerials(root)].sort(),
    connected_admitted_devices:connectedReadySerials(root),
    admitted_avds:[...allowedAvds(root)].sort(),
    adb:bounded(adb,12000),
    artemis:bounded(artemis,12000),
    capabilities:ARTEMIS_SUBORDINATE_CAPABILITIES.capabilities,
    security:{
      hermes_is_only_exposed_control_surface:true,
      raw_artemis_mcp_exposed:false,
      direct_artemis_ui_enabled_by_default:false,
      adb_expected_binding:'loopback_or_governed_device_bridge',
      shell_execution_from_dial_mcp:false,
      upstream_internal_pro_diagnostics_governed_by_artemis:true,
      device_admission_required:true,
      task_trace_ownership_required:true,
      upstream_shell_hardening_patch_required:true,
    },
  };
}

export function startAndroidTask({
  project,
  repoDir,
  deviceSerial=null,
  objective,
  profile='flash',
  apkPath=null,
  packageName=null,
  expectedOutput=null,
  verificationLevel='strict',
  explorerMode='flash',
  root=DEFAULT_CONTROL_HOME,
  sourceHarness='hermes',
}={}) {
  const projectId=slug(project,'project');
  const serial=resolveAdmittedSerial(deviceSerial,root);
  const selectedProfile=requireProfile(profile);
  const task=String(objective||'').trim();
  if(!task || task.length>12000) throw new Error('Android task objective is required and must be <= 12000 characters');
  const repo=path.resolve(repoDir||'.');
  if(!fs.existsSync(repo)) throw new Error(`repository missing: ${repo}`);
  const git=captureGitState(repo);
  const lockedPackage=packageName ? requirePackage(packageName) : null;
  let absoluteApk=null, apkSha=null;
  if(apkPath){
    absoluteApk=path.resolve(repo,apkPath);
    if(!within(repo,absoluteApk)) throw new Error('APK path escapes repository');
    if(!fs.existsSync(absoluteApk) || !absoluteApk.endsWith('.apk')) throw new Error(`APK not found: ${absoluteApk}`);
    apkSha=sha256(fs.readFileSync(absoluteApk));
  }
  const verification=requireVerification(verificationLevel,selectedProfile);
  const explorer=requireExplorer(explorerMode,selectedProfile);
  const args={
    task_desc:task,
    model:selectedProfile==='pro'?'Pro':'Flash',
    device_serial:serial,
  };
  if(lockedPackage) args.locked_app_package=lockedPackage;
  if(absoluteApk) args.app_path=absoluteApk;
  if(selectedProfile==='pro'){
    args.verification_level=verification;
    args.explorer_mode=explorer;
    if(expectedOutput) args.expected_output_desc=String(expectedOutput).slice(0,8000);
  }
  const upstream=invokeArtemisSubordinate('mobile_run_task',args,{timeoutMs:120000});
  const traceId=requireTrace(upstream?.trace_id);
  const record={
    schema_version:1,
    trace_id:traceId,
    authority:'HERMES_OWNED_ARTEMIS_SUBORDINATE_TASK',
    project:projectId,
    repository_sha:git.commit,
    repository_branch:git.branch,
    device_serial:serial,
    profile:selectedProfile,
    verification_level:verification,
    explorer_mode:explorer,
    package_name:lockedPackage,
    apk_sha256:apkSha,
    objective_sha256:sha256(task),
    source_harness:sourceHarness,
    started_at:new Date().toISOString(),
    upstream:{
      status:upstream?.status||null,
      stdout_log:upstream?.stdout_log||null,
      stderr_log:upstream?.stderr_log||null,
      notes_dir:upstream?.notes_dir||null,
    },
  };
  writeJsonAtomic(taskRecordPath(traceId,root),record);
  return {
    ...upstream,
    trace_id:traceId,
    device_serial:serial,
    hermes_authority:'HERMES_CONTROL_AUTHORITY',
    artemis_role:'SUBORDINATE_ANDROID_EXECUTOR',
    objective_sha256:record.objective_sha256,
    repository_sha:git.commit,
    evidence_state:'PENDING_TERMINAL_SEAL',
  };
}

export function manageAndroidTask({traceId,action='status',instruction=null,releaseLoop=false,root=DEFAULT_CONTROL_HOME}={}) {
  const trace=requireTrace(traceId);
  const {record}=loadTaskRecord(trace,root);
  const op=String(action||'status').toLowerCase();
  if(!['status','inject_instruction','stop'].includes(op)) throw new Error(`unsupported ARTEMIS task action: ${action}`);
  if(op==='inject_instruction' && !releaseLoop && !String(instruction||'').trim()) throw new Error('instruction is required unless release_loop=true');
  const args={action:op,trace_id:trace};
  if(op==='inject_instruction'){
    if(instruction) args.instruction=String(instruction).slice(0,8000);
    args.release_loop=Boolean(releaseLoop);
  }
  const upstream=invokeArtemisSubordinate('mobile_manage_task',args,{timeoutMs:120000});
  if(upstream?.device_serial && String(upstream.device_serial)!==String(record.device_serial)) throw new Error('ARTEMIS device binding drift detected for Hermes-owned trace');
  let evidence=record.evidence||null;
  if(TERMINAL.has(String(upstream?.status||'').toLowerCase())) evidence=sealAsyncEvidence(trace,upstream,root);
  return {...upstream,hermes_trace_owned:true,hermes_device_binding:record.device_serial,evidence};
}

export function inspectAndroidTrace({traceId,action='view_summary',stepNumber=null,query=null,stepRange=null,maxResults=5,root=DEFAULT_CONTROL_HOME}={}) {
  const trace=requireTrace(traceId);
  const {record}=loadTaskRecord(trace,root);
  const op=String(action||'view_summary');
  if(!['view_summary','search','view_step_screenshots','view_step_details'].includes(op)) throw new Error(`unsupported ARTEMIS trace action: ${action}`);
  const args={action:op,trace_id:trace,max_results:Math.min(Math.max(Number(maxResults)||5,1),50)};
  if(stepNumber!==null && stepNumber!==undefined) args.step_number=Math.max(1,Math.trunc(Number(stepNumber)));
  if(query) args.query=String(query).slice(0,4000);
  if(stepRange){
    if(!Array.isArray(stepRange) || stepRange.length!==2) throw new Error('step_range must be [start,end]');
    args.step_range=[Math.max(1,Math.trunc(Number(stepRange[0]))),Math.max(1,Math.trunc(Number(stepRange[1])))];
  }
  const result=invokeArtemisSubordinate('mobile_inspect_trace',args,{timeoutMs:120000});
  return {trace_id:trace,device_serial:record.device_serial,hermes_trace_owned:true,result};
}

export function getAndroidDeviceState({deviceSerial=null,viewType='screenshot',root=DEFAULT_CONTROL_HOME}={}) {
  const serial=resolveAdmittedSerial(deviceSerial,root);
  const view=String(viewType||'screenshot').toLowerCase();
  if(!['screenshot','hierarchy'].includes(view)) throw new Error(`unsupported ARTEMIS device view: ${viewType}`);
  const result=invokeArtemisSubordinate('mobile_get_device_state',{view_type:view,device_serial:serial},{timeoutMs:120000});
  if(view==='hierarchy') return {device_serial:serial,view_type:view,hierarchy:bounded(typeof result==='string'?result:JSON.stringify(result),500000)};
  const raw=typeof result==='string'?result:(result?.uri||result?.path||result?.text||'');
  const source=safeArtemisFile(raw,root);
  if(!source) return {device_serial:serial,view_type:view,result};
  const dir=path.join(cfg(root).observationRoot,slug(serial,'serial'));
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const ext=path.extname(source)||'.jpg';
  const dest=path.join(dir,`obs-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  const bytes=fs.readFileSync(source); fs.writeFileSync(dest,bytes,{mode:0o600});
  return {device_serial:serial,view_type:view,artifact:{file:dest,sha256:sha256(bytes),bytes:bytes.length}};
}

export function diagnoseAndroidPlane({
  deviceSerial=null,
  attemptFix=false,
  launchAvd=null,
  verifyCredentials=false,
  probeDevice=false,
  root=DEFAULT_CONTROL_HOME,
}={}) {
  let serial=deviceSerial ? requireSerial(deviceSerial,root) : null;
  if((attemptFix||probeDevice) && !serial) serial=resolveAdmittedSerial(null,root);
  let avd=null;
  if(launchAvd){
    avd=String(launchAvd).trim();
    if(!AVD_RE.test(avd) || !allowedAvds(root).has(avd)) throw new Error(`Android AVD is not admitted to the Hermes test plane: ${launchAvd}`);
  }
  const args={attempt_fix:Boolean(attemptFix),verify_credentials:Boolean(verifyCredentials),probe_device:Boolean(probeDevice)};
  if(serial) args.device_serial=serial;
  if(avd) args.launch_avd=avd;
  const result=invokeArtemisSubordinate('mobile_diagnose',args,{timeoutMs:(verifyCredentials||probeDevice||avd)?240000:120000});
  return {hermes_authority:'HERMES_CONTROL_AUTHORITY',artemis_role:'SUBORDINATE_DIAGNOSTIC_EXECUTOR',result};
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
  let build=null, install=null, preflight=null, artemis=null, success=false, error=null;
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
    const lockedPackage=packageName ? requirePackage(packageName) : null;
    const env={
      ADB_DEVICE_SERIAL:serial,
      ARTEMIS_DEVICE_ID:serial,
      ARTEMIS_TASK_INGRESS:'dial-hermes-android-testing',
      DIAL_ANDROID_TEST_RUN_ID:run.id,
      DIAL_ARTEMIS_SUBORDINATE:'1',
    };
    const doctorOutput=runFile(c.artemis,['doctor'],{
      cwd:c.root,
      env,
      timeoutMs:120000,
    });
    saveText(path.join(run.dir,'artemis-doctor.txt'),doctorOutput);
    preflight={output_sha256:sha256(bounded(doctorOutput)),output:bounded(doctorOutput,40000)};
    const tracesPath=path.join(run.dir,'artemis-traces');
    fs.mkdirSync(tracesPath,{recursive:true,mode:0o700});
    const artemisArgs=[
      'run',task,
      '--profile',selectedProfile,
      '--device-serial',serial,
      '--standalone',
      '--test-name',run.id,
      '--traces-path',tracesPath,
    ];
    if(lockedPackage) artemisArgs.push('--locked-app',lockedPackage);
    if(selectedProfile==='pro') artemisArgs.push('--verification-level','strict');
    const output=runFile(c.artemis,artemisArgs,{
      cwd:c.root,
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
      success,build,install,preflight,artemis,error,artifacts,
      authority:'TEST_EVIDENCE_NON_AUTHORITATIVE_UNTIL_RECONCILED',
    };
    const summaryPath=path.join(run.dir,'summary.json');
    writeJsonAtomic(summaryPath,summary);
    const candidate=writeMemoryCandidate({
      project:projectId,tier:'HOT',type:'TEST_EVIDENCE',
      text:`Android test ${run.id} ${success?'PASSED':'FAILED'} on ${serial}. Objective hash ${summary.objective_sha256}. Repository ${git.commit}.`,
      refs:[`android-evidence:${path.relative(root||DEFAULT_CONTROL_HOME,run.dir)}`,`git:${git.commit}`],
      sourceHarness,repositorySha:git.commit,metadata:{run_id:run.id,success,profile:selectedProfile,device_serial:serial},
    },root);
    summary.memory_candidate={memory_id:candidate.memory_id,object_rel:candidate.object_rel};
    writeJsonAtomic(summaryPath,summary);
    release();
    return summary;
  }
}
