import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  diagnoseAndroidPlane,
  getAndroidDeviceState,
  inspectAndroidTrace,
  manageAndroidTask,
  runAndroidTest,
  startAndroidTask,
} from '../agent-system/orchestration/android-testing-plane.mjs';
import { loadSharedMemoryIndex, readSharedMemoryObject } from '../agent-system/orchestration/shared-project-memory.mjs';

const roots=[];
const envNames=[
  'DIAL_ARTEMIS_BIN','DIAL_ADB_BIN','DIAL_ANDROID_DEVICE_SERIALS','DIAL_ANDROID_AVDS',
  'DIAL_ARTEMIS_ROOT','DIAL_ARTEMIS_BRIDGE','DIAL_ARTEMIS_BRIDGE_RUNNER','DIAL_ARTEMIS_PYTHON','DIAL_TEST_SYMLINK_ESCAPE',
];
const oldEnv=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));

afterEach(()=>{
  for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});
  for(const name of envNames){
    if(oldEnv[name]===undefined) delete process.env[name]; else process.env[name]=oldEnv[name];
  }
});

function temp(prefix){const p=fs.mkdtempSync(path.join(os.tmpdir(),prefix)); roots.push(p); return p;}
function executable(file,content){fs.writeFileSync(file,content,{mode:0o755}); fs.chmodSync(file,0o755);}
function makeRepo(){
  const repo=temp('android-plane-repo-');
  fs.writeFileSync(path.join(repo,'README.md'),'android fixture\n');
  execFileSync('git',['init','-q'],{cwd:repo});
  execFileSync('git',['config','user.name','Android Plane Test'],{cwd:repo});
  execFileSync('git',['config','user.email','android@example.invalid'],{cwd:repo});
  execFileSync('git',['add','.'],{cwd:repo});
  execFileSync('git',['commit','-qm','fixture'],{cwd:repo});
  return repo;
}
function makeHarness(){
  const bin=temp('android-plane-bin-');
  const adb=path.join(bin,'adb');
  const artemisRoot=path.join(bin,'artemis-root');
  const artemisBin=path.join(artemisRoot,'.venv','bin');
  fs.mkdirSync(artemisBin,{recursive:true});
  const artemis=path.join(artemisBin,'artemis');
  executable(adb,[
    '#!/usr/bin/env bash','set -e','args="$*"',
    'if [[ "$args" == *"exec-out screencap -p"* ]]; then printf "PNG-TEST-DATA"; exit 0; fi',
    'if [[ "$args" == *"logcat -d"* ]]; then echo "I/Test: deterministic logcat evidence"; exit 0; fi',
    'if [[ "$args" == *"logcat -c"* ]]; then exit 0; fi',
    'if [[ "$args" == *"devices -l"* ]]; then printf "List of devices attached\\nSERIAL-1 device product:test\\n"; exit 0; fi',
    'if [[ "$args" == *"install -r -g"* ]]; then echo Success; exit 0; fi','exit 0','',
  ].join('\n'));
  executable(artemis,[
    '#!/usr/bin/env bash','set -e',
    'if [[ "$1" == "status" ]]; then echo "ARTEMIS READY"; exit 0; fi',
    'if [[ "$1" == "doctor" ]]; then echo "verdict=ready"; exit 0; fi',
    'if [[ "$1" == "run" ]]; then echo "task_status=success"; echo "trace_id=test-trace"; exit 0; fi',
    'exit 2','',
  ].join('\n'));
  const bridge=path.join(bin,'fake-artemis-bridge.mjs');
  fs.writeFileSync(bridge,`import fs from 'node:fs'; import path from 'node:path';
const tool=process.argv[2], root=process.argv[3];
const input=JSON.parse(fs.readFileSync(0,'utf8')||'{}');
const trace='trace-hermes-1'; const traceDir=path.join(root,'traces',trace); fs.mkdirSync(path.join(traceDir,'notes'),{recursive:true});
fs.writeFileSync(path.join(traceDir,'stdout.log'),'stdout ok\\n'); fs.writeFileSync(path.join(traceDir,'stderr.log'),''); fs.writeFileSync(path.join(traceDir,'run_outcome.json'),JSON.stringify({task_status:'passed',tests:{passed:1,failed:0}})); fs.writeFileSync(path.join(traceDir,'notes','output.md'),'report ok\\n');
let result;
if(tool==='mobile_run_task') result={trace_id:trace,status:'running',device_serial:input.device_serial,stdout_log:path.join(traceDir,'stdout.log'),stderr_log:path.join(traceDir,'stderr.log'),notes_dir:path.join(traceDir,'notes')};
else if(tool==='mobile_manage_task') result={trace_id:trace,status:input.action==='stop'?'cancelled':'completed',device_serial:'SERIAL-1',stdout_log:path.join(traceDir,'stdout.log'),stderr_log:path.join(traceDir,'stderr.log'),test_summary:{passed:1,failed:0}};
else if(tool==='mobile_get_device_state'){ if(input.view_type==='hierarchy') result='[0] Settings text=Battery'; else { const p=path.join(root,'live.jpg'); if(process.env.DIAL_TEST_SYMLINK_ESCAPE==='1') { try{fs.unlinkSync(p)}catch{} fs.symlinkSync('/etc/hosts',p); } else fs.writeFileSync(p,'JPEG-DATA'); result='file://'+p; } }
else if(tool==='mobile_inspect_trace') result={action:input.action,trace_id:input.trace_id,steps:3};
else if(tool==='mobile_diagnose') result={verdict:'ready',device:{serial:input.device_serial||null},emulator:input.launch_avd?{avd_name:input.launch_avd,status:'starting'}:null};
else { console.log(JSON.stringify({ok:false,error:'unknown'})); process.exit(1);}
console.log(JSON.stringify({ok:true,result}));
`);
  process.env.DIAL_ADB_BIN=adb;
  process.env.DIAL_ARTEMIS_BIN=artemis;
  process.env.DIAL_ARTEMIS_ROOT=artemisRoot;
  process.env.DIAL_ARTEMIS_BRIDGE=bridge;
  process.env.DIAL_ARTEMIS_BRIDGE_RUNNER=process.execPath;
  process.env.DIAL_ANDROID_DEVICE_SERIALS='SERIAL-1';
  process.env.DIAL_ANDROID_AVDS='Pixel_API_35';
  return {artemisRoot};
}

describe('Hermes Android testing plane',()=>{
  it('creates a bound synchronous evidence bundle and only a TEST_EVIDENCE candidate',async()=>{
    const root=temp('android-plane-control-');
    const repo=makeRepo();
    makeHarness();
    const result=await runAndroidTest({
      project:'van',repoDir:repo,deviceSerial:'SERIAL-1',
      objective:'Open the VAN surface and verify it produces deterministic evidence.',root,sourceHarness:'hermes',
    });
    expect(result.success).toBe(true);
    expect(result.authority).toBe('TEST_EVIDENCE_NON_AUTHORITATIVE_UNTIL_RECONCILED');
    expect(result.artifacts.screenshot.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.artifacts.logcat.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.memory_candidate.memory_id).toMatch(/^mem-/);
    const index=loadSharedMemoryIndex('van',root);
    const candidate=index.entries.find(x=>x.memory_id===result.memory_candidate.memory_id);
    expect(candidate.admission_state).toBe('CANDIDATE');
    const record=readSharedMemoryObject(candidate.object_rel,root);
    expect(record.type).toBe('TEST_EVIDENCE');
    expect(record.metadata.success).toBe(true);
  });

  it('refuses any Android device that Hermes has not admitted',async()=>{
    const root=temp('android-plane-control-');
    const repo=makeRepo();
    makeHarness();
    await expect(runAndroidTest({project:'van',repoDir:repo,deviceSerial:'UNADMITTED-2',objective:'Do not run this.',root})).rejects.toThrow(/not admitted/);
  });

  it('owns the full asynchronous ARTEMIS lifecycle and seals terminal evidence',()=>{
    const root=temp('android-plane-control-');
    const repo=makeRepo();
    makeHarness();
    const started=startAndroidTask({
      project:'van',repoDir:repo,deviceSerial:'SERIAL-1',objective:'Explore VAN and verify the live dashboard.',profile:'pro',
      verificationLevel:'strict',explorerMode:'ultra',expectedOutput:'Record findings.',root,sourceHarness:'hermes',
    });
    expect(started.trace_id).toBe('trace-hermes-1');
    expect(started.artemis_role).toBe('SUBORDINATE_ANDROID_EXECUTOR');
    const inspected=inspectAndroidTrace({traceId:started.trace_id,action:'view_summary',root});
    expect(inspected.hermes_trace_owned).toBe(true);
    expect(inspected.result.steps).toBe(3);
    const status=manageAndroidTask({traceId:started.trace_id,action:'status',root});
    expect(status.status).toBe('completed');
    expect(status.evidence.memory_candidate.memory_id).toMatch(/^mem-/);
    expect(()=>manageAndroidTask({traceId:'foreign-trace',action:'status',root})).toThrow(/not owned/);
  });

  it('supervises asynchronous ARTEMIS tasks and seals evidence without an interactive poller',()=>{
    const root=temp('android-plane-control-');
    const repo=makeRepo();
    makeHarness();
    const started=startAndroidTask({
      project:'van',repoDir:repo,deviceSerial:'SERIAL-1',objective:'Run a supervised Android workflow.',profile:'flash',root,sourceHarness:'hermes',
    });
    const output=execFileSync(process.execPath,[path.resolve('agent-system/orchestration/android-testing-supervisor.mjs')],{
      cwd:path.resolve('.'),
      env:{...process.env,DIAL_CONTROL_HOME:root},
      encoding:'utf8',
    });
    const report=JSON.parse(output);
    expect(report.checked).toBe(1);
    expect(report.sealed).toBe(1);
    expect(report.errors).toEqual([]);
    const task=JSON.parse(fs.readFileSync(path.join(root,'android-testing','tasks',`${started.trace_id}.json`),'utf8'));
    expect(task.evidence.sealed_at).toBeTruthy();
    expect(task.evidence.memory_candidate.memory_id).toMatch(/^mem-/);
  });

  it('refuses ARTEMIS evidence paths that escape the pinned root through symlinks',()=>{
    const root=temp('android-plane-control-');
    makeRepo();
    makeHarness();
    process.env.DIAL_TEST_SYMLINK_ESCAPE='1';
    const screenshot=getAndroidDeviceState({deviceSerial:'SERIAL-1',viewType:'screenshot',root});
    expect(screenshot.artifact).toBeUndefined();
    expect(String(screenshot.result)).toMatch(/live\.jpg/);
  });

  it('routes device observation and diagnosis through admitted Hermes policy',()=>{
    const root=temp('android-plane-control-');
    makeRepo();
    makeHarness();
    const hierarchy=getAndroidDeviceState({deviceSerial:'SERIAL-1',viewType:'hierarchy',root});
    expect(hierarchy.hierarchy).toMatch(/Battery/);
    const screenshot=getAndroidDeviceState({deviceSerial:'SERIAL-1',viewType:'screenshot',root});
    expect(screenshot.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    const diag=diagnoseAndroidPlane({deviceSerial:'SERIAL-1',attemptFix:true,probeDevice:true,root});
    expect(diag.result.verdict).toBe('ready');
    const avd=diagnoseAndroidPlane({launchAvd:'Pixel_API_35',root});
    expect(avd.result.emulator.avd_name).toBe('Pixel_API_35');
    expect(()=>diagnoseAndroidPlane({launchAvd:'UNAPPROVED_AVD',root})).toThrow(/not admitted/);
  });
});
