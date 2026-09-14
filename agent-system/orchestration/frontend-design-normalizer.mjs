import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

function uniq(v){return [...new Set((v||[]).filter(Boolean).map(String))].sort();}
function ids(registry,key,idKey){return new Set((registry?.[key]||[]).map((x)=>x[idKey]).filter(Boolean));}

export function normalizeDesignCandidate({repoDir,candidate={},fdep,changeBudget=null}={}){
  if(!repoDir||!fdep||fdep.applicable===false) throw new Error('Design Normalizer requires an applicable FDEP');
  const tokenReg=loadRegistry(repoDir,'agent-system/registries/FRONTEND_TOKEN_REGISTRY.json',{tokens:[]});
  const componentReg=loadRegistry(repoDir,'agent-system/registries/FRONTEND_COMPONENT_REGISTRY.json',{components:[]});
  const patternReg=loadRegistry(repoDir,'agent-system/registries/FRONTEND_PATTERN_POLICY.json',{rules:[]});
  const allowedTokens=ids(tokenReg,'tokens','token_id');
  const allowedComponents=ids(componentReg,'components','component_id');
  const allowedPatterns=new Set((patternReg.rules||[]).filter((x)=>x.allowed===true).map((x)=>x.pattern_id));
  const usedTokens=uniq(candidate.token_ids||candidate.tokens), usedComponents=uniq(candidate.component_ids||candidate.components), usedPatterns=uniq(candidate.pattern_ids||candidate.patterns);
  const unknownTokens=usedTokens.filter((x)=>!allowedTokens.has(x));
  const unknownComponents=usedComponents.filter((x)=>!allowedComponents.has(x));
  const unknownPatterns=usedPatterns.filter((x)=>!allowedPatterns.has(x));
  const budget=changeBudget||fdep.change_budget||{};
  const approvedNewTokens=new Set(budget.new_token_ids||[]),approvedNewComponents=new Set(budget.new_component_ids||[]),approvedNewPatterns=new Set(budget.new_pattern_ids||[]);
  const violations=[];
  for(const x of unknownTokens) if(!approvedNewTokens.has(x)) violations.push(`UNAPPROVED_TOKEN:${x}`);
  for(const x of unknownComponents) if(!approvedNewComponents.has(x)) violations.push(`UNAPPROVED_COMPONENT:${x}`);
  for(const x of unknownPatterns) if(!approvedNewPatterns.has(x)) violations.push(`UNAPPROVED_PATTERN:${x}`);
  if(candidate.domain_truth_invented===true) violations.push('DOMAIN_TRUTH_INVENTED');
  if(candidate.visual_authority_delta===true && !(budget.approved_visual_delta_refs||[]).length) violations.push('UNAPPROVED_VISUAL_AUTHORITY_DELTA');
  const structuralDelta={
    added_regions:uniq(candidate.structural_delta?.added_regions),
    removed_regions:uniq(candidate.structural_delta?.removed_regions),
    moved_regions:uniq(candidate.structural_delta?.moved_regions),
  };
  const structuralChangeCount=structuralDelta.added_regions.length+structuralDelta.removed_regions.length+structuralDelta.moved_regions.length;
  if(budget.allowed_structural_delta==='NONE' && structuralChangeCount) violations.push('CHANGE_BUDGET_STRUCTURAL_DELTA_EXCEEDED');
  const evidence={
    schema_version:1,artifact_type:'DesignNormalizationEvidence',artifact_id:`normalize:${fdep.task_id}`,
    status:violations.length?'REJECTED':'NORMALIZED',task_id:fdep.task_id,fdep_hash:fdep.content_hash,
    registry_versions:{tokens:tokenReg.registry_version||null,components:componentReg.registry_version||null,patterns:patternReg.registry_version||null},
    used:{token_ids:usedTokens,component_ids:usedComponents,pattern_ids:usedPatterns},unknown:{token_ids:unknownTokens,component_ids:unknownComponents,pattern_ids:unknownPatterns},
    structural_delta:structuralDelta,change_budget_hash:budget.content_hash||hashObject(budget),violations,
    provider_output_remains_non_authoritative:true,
    provenance:{candidate_hash:hashObject(candidate)},
  };
  evidence.content_hash=hashObject({...evidence,content_hash:null});
  return evidence;
}
