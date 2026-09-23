#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { manageAndroidTask } from './android-testing-plane.mjs';

const root=process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control';
const taskDir=path.join(root,'android-testing','tasks');
const limit=Math.min(Math.max(Number(process.env.DIAL_ANDROID_SUPERVISOR_MAX_TASKS)||100,1),1000);
const report={
  schema_version:1,
  plane:'HERMES_ANDROID_TESTING_PLANE',
  authority:'HERMES_CONTROL_AUTHORITY',
  checked_at:new Date().toISOString(),
  checked:0,
  active:0,
  sealed:0,
  terminal:0,
  errors:[],
};

if(fs.existsSync(taskDir)){
  const files=fs.readdirSync(taskDir).filter(x=>x.endsWith('.json')).sort().slice(0,limit);
  for(const name of files){
    const file=path.join(taskDir,name);
    try{
      const record=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!record?.trace_id) continue;
      if(record?.evidence?.sealed_at){
        report.terminal+=1;
        continue;
      }
      report.checked+=1;
      const result=manageAndroidTask({traceId:record.trace_id,action:'status',root});
      const status=String(result?.status||'unknown').toLowerCase();
      if(['completed','failed','cancelled'].includes(status)){
        report.terminal+=1;
        if(result?.evidence?.sealed_at) report.sealed+=1;
      }else{
        report.active+=1;
      }
    }catch(error){
      report.errors.push({task_file:name,error:String(error?.message||error).slice(0,1200)});
    }
  }
}
process.stdout.write(`${JSON.stringify(report)}\n`);
if(report.errors.length) process.exitCode=2;
