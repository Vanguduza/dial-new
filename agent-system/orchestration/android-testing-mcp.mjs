#!/usr/bin/env node
import readline from 'node:readline';
import { androidTestingStatus, runAndroidTest } from './android-testing-plane.mjs';
import { resolveProjectRepository } from './project-repository-resolver.mjs';

const root=process.env.DIAL_CONTROL_HOME;
const defaultProject=process.env.DIAL_PROJECT_ID||'dial';
const defaultHarness=process.env.DIAL_HARNESS_ID||'hermes';
const defaultRepo=process.env.DIAL_REPO_DIR||process.cwd();

const TOOLS=[
  {
    name:'android_testing_status',
    description:'Read the Hermes-governed ARTEMIS Android testing-plane status, admitted devices and security posture.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
  },
  {
    name:'android_test_run',
    description:'Run a deterministic Android build/install/test/evidence pipeline through the hardened ARTEMIS plane. Device admission and exclusive lease are mandatory.',
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
function clean(v){return String(v??'').slice(0,6000);}
function repoFor(project){
  return resolveProjectRepository({project:project||defaultProject,root,defaultRepoDir:defaultRepo}).repo_dir;
}
async function invoke(name,args={}){
  if(name==='android_testing_status') return androidTestingStatus({root});
  if(name==='android_test_run'){
    const project=args.project||defaultProject;
    return runAndroidTest({
      project,
      repoDir:repoFor(project),
      deviceSerial:args.device_serial,
      objective:args.objective,
      profile:args.profile||'flash',
      gradleTask:args.gradle_task||null,
      apkPath:args.apk_path||null,
      packageName:args.package_name||null,
      timeoutMs:args.timeout_ms||1800000,
      root,
      sourceHarness:defaultHarness,
    });
  }
  throw new Error(`unknown Android testing tool: ${name}`);
}
async function handle(message){
  const id=message?.id;
  if(message?.method==='initialize') return result(id,{
    protocolVersion:message?.params?.protocolVersion||'2025-06-18',
    capabilities:{tools:{listChanged:false}},
    serverInfo:{name:'dial-hermes-android-testing',version:'1.0.0'},
    instructions:'Hermes-governed Android verification plane. ARTEMIS is a subordinate executor, raw ARTEMIS MCP is not exposed, every device must be admitted and leased, and results are evidence rather than project authority.',
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
