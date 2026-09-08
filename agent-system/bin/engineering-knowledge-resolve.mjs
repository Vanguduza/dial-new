#!/usr/bin/env node
import { activationSummary } from '../orchestration/skill-activation-store.mjs';
import { reResolvePacketEngineeringKnowledge, resolvePacketEngineeringKnowledge } from '../orchestration/engineering-knowledge-broker.mjs';
import { resolveEngineeringResources } from '../orchestration/engineering-resource-resolver.mjs';
import { resolveEngineeringSkills } from '../orchestration/skill-resolver.mjs';

const args=process.argv.slice(2);let featureId=null,task='',packetId=null,reason=null,activate=false;const paths=[];const tools=[];
for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(!arg.startsWith('--')&&!featureId){featureId=arg;continue;}
  if(arg==='--task'){task=args[++i]||'';continue;}
  if(arg==='--packet-id'){packetId=args[++i]||'';continue;}
  if(arg==='--path'){paths.push(args[++i]||'');continue;}
  if(arg==='--tool'){tools.push(args[++i]||'');continue;}
  if(arg==='--activate'){activate=true;continue;}
  if(arg==='--reason'){reason=args[++i]||'';continue;}
}
const repoDir=process.env.DIAL_REPO_DIR||process.cwd();const metadata={feature_id:featureId,affected_paths:paths,available_tools:tools};
if(!activate){
  const skills=resolveEngineeringSkills({repoDir,featureId,instruction:task,affectedPaths:paths,metadata});
  const resources=resolveEngineeringResources({repoDir,instruction:task,affectedPaths:paths,availableTools:tools});
  console.log(JSON.stringify({policy_version:'vekl-2.1',feature_id:featureId,skill_plan:skills,resource_plan:resources},null,2));
}else{
  const id=packetId||process.env.DIAL_PACKET_ID;if(!id)throw new Error('--packet-id or DIAL_PACKET_ID is required with --activate');
  const manifest=reason
    ? reResolvePacketEngineeringKnowledge({repoDir,packetId:id,instruction:task,metadata,reason})
    : resolvePacketEngineeringKnowledge({repoDir,packetId:id,instruction:task,metadata});
  console.log(JSON.stringify({manifest,summary:activationSummary(manifest)},null,2));
}
