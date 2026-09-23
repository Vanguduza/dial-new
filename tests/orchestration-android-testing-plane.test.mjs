import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runAndroidTest } from '../agent-system/orchestration/android-testing-plane.mjs';
import { loadSharedMemoryIndex, readSharedMemoryObject } from '../agent-system/orchestration/shared-project-memory.mjs';

const roots=[];
const oldEnv={
  artemis:process.env.DIAL_ARTEMIS_BIN,
  adb:process.env.DIAL_ADB_BIN,
  serials:process.env.DIAL_ANDROID_DEVICE_SERIALS,
};

afterEach(()=>{
  for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});
  for(const [key,name] of [['artemis','DIAL_ARTEMIS_BIN'],['adb','DIAL_ADB_BIN'],['serials','DIAL_ANDROID_DEVICE_SERIALS']]){
    if(oldEnv[key]===undefined) delete process.env[name]; else process.env[name]=oldEnv[key];
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
    '#!/usr/bin/env bash',
    'set -e',
    'args="$*"',
    'if [[ "$args" == *"exec-out screencap -p"* ]]; then printf "PNG-TEST-DATA"; exit 0; fi',
    'if [[ "$args" == *"logcat -d"* ]]; then echo "I/Test: deterministic logcat evidence"; exit 0; fi',
    'if [[ "$args" == *"logcat -c"* ]]; then exit 0; fi',
    'if [[ "$args" == *"devices -l"* ]]; then printf "List of devices attached\\nSERIAL-1 device product:test\\n"; exit 0; fi',
    'if [[ "$args" == *"install -r -g"* ]]; then echo Success; exit 0; fi',
    'exit 0',
    '',
  ].join('\n'));
  executable(artemis,[
    '#!/usr/bin/env bash',
    'set -e',
    'if [[ "$1" == "status" ]]; then echo "ARTEMIS READY"; exit 0; fi',
    'if [[ "$1" == "doctor" ]]; then echo "verdict=ready"; exit 0; fi',
    'if [[ "$1" == "run" ]]; then echo "task_status=success"; echo "trace_id=test-trace"; exit 0; fi',
    'exit 2',
    '',
  ].join('\n'));
  process.env.DIAL_ADB_BIN=adb;
  process.env.DIAL_ARTEMIS_BIN=artemis;
  process.env.DIAL_ANDROID_DEVICE_SERIALS='SERIAL-1';
}

describe('Hermes Android testing plane',()=>{
  it('creates a bound evidence bundle and only a TEST_EVIDENCE candidate',async()=>{
    const root=temp('android-plane-control-');
    const repo=makeRepo();
    makeHarness();
    const result=await runAndroidTest({
      project:'van',
      repoDir:repo,
      deviceSerial:'SERIAL-1',
      objective:'Open the VAN surface and verify it produces deterministic evidence.',
      root,
      sourceHarness:'hermes',
    });
    expect(result.success).toBe(true);
    expect(result.authority).toBe('TEST_EVIDENCE_NON_AUTHORITATIVE_UNTIL_RECONCILED');
    expect(result.preflight.output).toContain('verdict=ready');
    expect(result.preflight.output_sha256).toMatch(/^[a-f0-9]{64}$/);
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
    await expect(runAndroidTest({
      project:'van',
      repoDir:repo,
      deviceSerial:'UNADMITTED-2',
      objective:'Do not run this.',
      root,
    })).rejects.toThrow(/not admitted/);
  });
});
