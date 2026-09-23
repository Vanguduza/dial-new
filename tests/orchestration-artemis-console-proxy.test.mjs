import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  isHermesOwnedAndroidTrace,
  registerOwnerConsoleTask,
  requireAdmittedAndroidAvd,
  resolveAdmittedAndroidSerial,
} from '../agent-system/orchestration/android-testing-plane.mjs';
import {
  classifyConsoleMutation,
  prepareOwnerRunRequest,
} from '../agent-system/orchestration/artemis-console-proxy.mjs';

const roots=[];
const oldSerials=process.env.DIAL_ANDROID_DEVICE_SERIALS;
const oldAvds=process.env.DIAL_ANDROID_AVDS;
afterEach(()=>{
  for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});
  if(oldSerials===undefined) delete process.env.DIAL_ANDROID_DEVICE_SERIALS; else process.env.DIAL_ANDROID_DEVICE_SERIALS=oldSerials;
  if(oldAvds===undefined) delete process.env.DIAL_ANDROID_AVDS; else process.env.DIAL_ANDROID_AVDS=oldAvds;
});
function temp(prefix){const p=fs.mkdtempSync(path.join(os.tmpdir(),prefix)); roots.push(p); return p;}
function repo(){
  const dir=temp('artemis-console-repo-');
  fs.writeFileSync(path.join(dir,'README.md'),'fixture\n');
  execFileSync('git',['init','-q'],{cwd:dir});
  execFileSync('git',['config','user.name','Console Test'],{cwd:dir});
  execFileSync('git',['config','user.email','console@example.invalid'],{cwd:dir});
  execFileSync('git',['add','.'],{cwd:dir});
  execFileSync('git',['commit','-qm','fixture'],{cwd:dir});
  return dir;
}
describe('Hermes-governed ARTEMIS owner console',()=>{
  it('admits task/device/emulator controls but blocks secret, destructive and lifecycle admin mutations',()=>{
    expect(classifyConsoleMutation('/api/run')).toBe('RUN_TASK');
    expect(classifyConsoleMutation('/api/stop')).toBe('STOP_TASK');
    expect(classifyConsoleMutation('/api/system/devices/select')).toBe('SELECT_DEVICE');
    expect(classifyConsoleMutation('/api/system/emulator/launch')).toBe('LAUNCH_AVD');
    expect(classifyConsoleMutation('/api/system/adb/restart')).toBe('SAFE_GLOBAL_DIAGNOSTIC');
    expect(classifyConsoleMutation('/api/system/credentials')).toBe('BLOCKED_ADMIN');
    expect(classifyConsoleMutation('/api/cleanup')).toBe('BLOCKED_ADMIN');
    expect(classifyConsoleMutation('/api/system/shutdown')).toBe('BLOCKED_LIFECYCLE');
    expect(classifyConsoleMutation('/api/sessions/abc/delete')).toBe('BLOCKED_DELETE');
    expect(classifyConsoleMutation('/api/sessions/abc/steps/1/replay')).toBe('BLOCKED_REPLAY');
  });
  it('forces owner web tasks onto admitted devices, one governed trace at a time',()=>{
    const root=temp('artemis-console-control-');
    const projectRepo=repo();
    process.env.DIAL_ANDROID_DEVICE_SERIALS='SERIAL-1';
    process.env.DIAL_ANDROID_AVDS='Pixel_API_35';
    const prepared=prepareOwnerRunRequest({goal:'Verify the VAN dashboard.',profile:'Pro',device_serial:'SERIAL-1'},{root,repoDir:projectRepo});
    expect(prepared.device_serial).toBe('SERIAL-1');
    expect(prepared.profile).toBe('pro');
    expect(prepared.ingress).toBe('dial-hermes-van-owner-ui');
    expect(prepared.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(()=>prepareOwnerRunRequest({goals:['one','two'],device_serial:'SERIAL-1'},{root,repoDir:projectRepo})).toThrow(/one governed task/);
    expect(()=>prepareOwnerRunRequest({goal:'x',device_serial:'UNADMITTED'},{root,repoDir:projectRepo})).toThrow(/not admitted/);
    expect(resolveAdmittedAndroidSerial('SERIAL-1',{root})).toBe('SERIAL-1');
    expect(requireAdmittedAndroidAvd('Pixel_API_35',{root})).toBe('Pixel_API_35');
  });
  it('registers owner-web traces as Hermes-owned evidence candidates, never Project Truth',()=>{
    const root=temp('artemis-console-control-');
    const projectRepo=repo();
    process.env.DIAL_ANDROID_DEVICE_SERIALS='SERIAL-1';
    const trace='owner-web-trace-1';
    const rec=registerOwnerConsoleTask({
      traceId:trace,project:'van',repoDir:projectRepo,deviceSerial:'SERIAL-1',
      objective:'Exercise the VAN owner surface.',profile:'flash',root,
    });
    expect(rec.authority).toBe('HERMES_OWNED_ARTEMIS_SUBORDINATE_TASK');
    expect(rec.owner_surface).toBe('VAN_ARTEMIS_WEB_CONSOLE');
    expect(rec.upstream.ingress).toBe('dial-hermes-van-owner-ui');
    expect(isHermesOwnedAndroidTrace(trace,{root})).toBe(true);
    expect(isHermesOwnedAndroidTrace('foreign-trace',{root})).toBe(false);
  });
});
