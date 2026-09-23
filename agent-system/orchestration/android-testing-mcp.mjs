#!/usr/bin/env node
import readline from 'node:readline';
import {
  androidTestingStatus,
  diagnoseAndroidPlane,
  getAndroidDeviceState,
  inspectAndroidTrace,
  manageAndroidTask,
  runAndroidTest,
  startAndroidTask,
} from './android-testing-plane.mjs';
import { ARTEMIS_SUBORDINATE_CAPABILITIES } from './artemis-subordinate-client.mjs';
import { resolveProjectRepository } from './project-repository-resolver.mjs';

const root=process.env.DIAL_CONTROL_HOME;
const defaultProject=process.env.DIAL_PROJECT_ID||'dial';
const defaultHarness=process.env.DIAL_HARNESS_ID||'hermes';
const defaultRepo=process.env.DIAL_REPO_DIR||process.cwd();

const TOOLS=[
  {
    name:'android_testing_status',
    description:'Read the Hermes-governed ARTEMIS Android plane status, admitted devices, capabilities and security posture.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
  },
  {
    name:'android_task_start',
    description:'Start an asynchronous ARTEMIS subordinate task. Supports Flash/Pro, locked app, APK install, strict/checkpoint verification, explorer depth, multi-device execution and long-running/continuous workflows. Hermes admission remains mandatory.',
    inputSchema:{
      type:'object',
      properties:{
        project:{type:'string'},
        device_serial:{type:'string'},
        objective:{type:'string'},
        profile:{type:'string',enum:['flash','pro']},
        apk_path:{type:'string'},
        package_name:{type:'string'},
        expected_output:{type:'string'},
        verification_level:{type:'string',enum:['off','final','checkpoints','strict']},
        explorer_mode:{type:'string',enum:['flash','pro','ultra']},
      },
      required:['objective'],
      additionalProperties:false,
    },
  },
  {
    name:'android_task_manage',
    description:'Poll, steer, gracefully release a continuous ARTEMIS loop, or stop a Hermes-owned Android task. Terminal status seals test evidence into a non-authoritative SPMRF candidate.',
    inputSchema:{
      type:'object',
      properties:{
        trace_id:{type:'string'},
        action:{type:'string',enum:['status','inject_instruction','stop']},
        instruction:{type:'string'},
        release_loop:{type:'boolean'},
      },
      required:['trace_id','action'],
      additionalProperties:false,
    },
  },
  {
    name:'android_device_state',
    description:'Use ARTEMIS to inspect an admitted Android device in real time as a screenshot or accessibility/OCR hierarchy. Screenshot output is copied into Hermes evidence storage.',
    inputSchema:{
      type:'object',
      properties:{device_serial:{type:'string'},view_type:{type:'string',enum:['screenshot','hierarchy']}},
      additionalProperties:false,
    },
  },
  {
    name:'android_trace_inspect',
    description:'Inspect a Hermes-owned ARTEMIS trace: summary, deterministic search, per-step screenshots/action overlays, or full step replay details.',
    inputSchema:{
      type:'object',
      properties:{
        trace_id:{type:'string'},
        action:{type:'string',enum:['view_summary','search','view_step_screenshots','view_step_details']},
        step_number:{type:'integer',minimum:1},
        query:{type:'string'},
        step_range:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:1}},
        max_results:{type:'integer',minimum:1,maximum:50},
      },
      required:['trace_id','action'],
      additionalProperties:false,
    },
  },
  {
    name:'android_diagnose',
    description:'Run ARTEMIS environment/device diagnosis under Hermes control. Can verify credentials, probe an admitted device, apply ARTEMIS safe self-heals, and launch only explicitly allowlisted AVDs.',
    inputSchema:{
      type:'object',
      properties:{
        device_serial:{type:'string'},
        attempt_fix:{type:'boolean'},
        launch_avd:{type:'string'},
        verify_credentials:{type:'boolean'},
        probe_device:{type:'boolean'},
      },
      additionalProperties:false,
    },
  },
  {
    name:'android_test_run',
    description:'Run the synchronous deterministic build/install/ARTEMIS exercise/evidence pipeline. This is the certification-oriented path; device admission and exclusive lease are mandatory.',
    inputSchema:{
      type:'object',
      properties:{
        project:{type:'string'},
        device_serial:{type:'string'},
        objective:{type:'string'},
        profile:{type:'string',enum:['flash','pro']},
        gradle_task:{type:'string'},
        apk_path:{type:'string'},
        package_name:{type:'string'},
        timeout_ms:{type:'integer',minimum:60000,maximum:2700000},
      },
      required:['device_serial','objective'],
      additionalProperties:false,
    },
  },
];

function send(v){process.stdout.write(`${JSON.stringify(v)}\n`);}
function result(id,value){return {jsonrpc:'2.0',id,result:value};}
function clean(v){return String(v??'').slice(0,12000);}
function repoFor(project){
  return resolveProjectRepository({project:project||defaultProject,root,defaultRepoDir:defaultRepo}).repo_dir;
}
async function invoke(name,args={}){
  if(name==='android_testing_status') return androidTestingStatus({root});
  if(name==='android_task_start'){
    const project=args.project||defaultProject;
    return startAndroidTask({
      project,repoDir:repoFor(project),deviceSerial:args.device_serial||null,objective:args.objective,
      profile:args.profile||'flash',apkPath:args.apk_path||null,packageName:args.package_name||null,
      expectedOutput:args.expected_output||null,verificationLevel:args.verification_level||'strict',
      explorerMode:args.explorer_mode||'flash',root,sourceHarness:defaultHarness,
    });
  }
  if(name==='android_task_manage') return manageAndroidTask({
    traceId:args.trace_id,action:args.action,instruction:args.instruction||null,releaseLoop:Boolean(args.release_loop),root,
  });
  if(name==='android_device_state') return getAndroidDeviceState({
    deviceSerial:args.device_serial||null,viewType:args.view_type||'screenshot',root,
  });
  if(name==='android_trace_inspect') return inspectAndroidTrace({
    traceId:args.trace_id,action:args.action,stepNumber:args.step_number??null,query:args.query||null,
    stepRange:args.step_range||null,maxResults:args.max_results||5,root,
  });
  if(name==='android_diagnose') return diagnoseAndroidPlane({
    deviceSerial:args.device_serial||null,attemptFix:Boolean(args.attempt_fix),launchAvd:args.launch_avd||null,
    verifyCredentials:Boolean(args.verify_credentials),probeDevice:Boolean(args.probe_device),root,
  });
  if(name==='android_test_run'){
    const project=args.project||defaultProject;
    return runAndroidTest({
      project,repoDir:repoFor(project),deviceSerial:args.device_serial,objective:args.objective,
      profile:args.profile||'flash',gradleTask:args.gradle_task||null,apkPath:args.apk_path||null,
      packageName:args.package_name||null,timeoutMs:args.timeout_ms||1800000,root,sourceHarness:defaultHarness,
    });
  }
  throw new Error(`unknown Android testing tool: ${name}`);
}
async function handle(message){
  const id=message?.id;
  if(message?.method==='initialize') return result(id,{
    protocolVersion:message?.params?.protocolVersion||'2025-06-18',
    capabilities:{tools:{listChanged:false}},
    serverInfo:{name:'dial-hermes-android-testing',version:'2.0.0'},
    instructions:[
      'Hermes is the Android control authority and ARTEMIS is its subordinate executor.',
      'Use ARTEMIS for the Android work it excels at: live device exploration, cross-app UI automation, Flash/Pro execution, strict verification, device observation, trace replay, diagnosis, safe self-heal and multi-device testing.',
      'Never expose or connect the raw upstream ARTEMIS MCP. All ARTEMIS access passes through this admission, trace-ownership and evidence broker.',
      'Prefer Flash for routine deterministic UI paths; use Pro for exploration, recovery, ADB/log diagnosis, checkpoint verification, long-horizon work or continuous monitoring.',
      'Results are evidence, not Project Truth. Physical certification requires a real admitted device run.',
    ].join(' '),
  });
  if(message?.method==='notifications/initialized') return null;
  if(message?.method==='ping') return result(id,{});
  if(message?.method==='tools/list') return result(id,{tools:TOOLS});
  if(message?.method==='tools/call'){
    try{
      const value=await invoke(message.params?.name,message.params?.arguments||{});
      return result(id,{content:[{type:'text',text:JSON.stringify(value,null,2)}],structuredContent:value,isError:false});
    }catch(error){
      return result(id,{content:[{type:'text',text:clean(error?.message||error)}],isError:true});
    }
  }
  return {jsonrpc:'2.0',id:id??null,error:{code:-32601,message:`method not found: ${message?.method}`}};
}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async(line)=>{
  if(!line.trim()) return;
  let message;
  try{message=JSON.parse(line);}catch{return send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'parse error'}});}
  try{const response=await handle(message); if(response) send(response);}
  catch(error){send({jsonrpc:'2.0',id:message?.id??null,error:{code:-32603,message:clean(error?.message||error)}});}
});

export { ARTEMIS_SUBORDINATE_CAPABILITIES };
