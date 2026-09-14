import { hashObject } from './knowledge-graph-core.mjs';

export function compileFrontendLearningSignal({taskId,fdep,certification,outcomeAttribution=null,resourceIds=[],templateIds=[],providerId=null}={}){
  if(!taskId||!fdep||!certification) throw new Error('frontend learning signal requires task, FDEP and certification');
  const cause=outcomeAttribution?.cause||'UNDETERMINED';
  const success=certification.ok===true;
  const artifact={
    schema_version:1,
    artifact_type:'FrontendLearningSignal',
    artifact_id:`frontend-learning:${taskId}`,
    status:'PROPOSAL_ONLY',
    task_id:taskId,
    fdep_hash:fdep.content_hash,
    certification_hash:certification.content_hash,
    polarity:success?'POSITIVE':'ANTI_PATTERN',
    cause_attribution:cause,
    resource_ids:[...new Set(resourceIds)].sort(),
    template_ids:[...new Set(templateIds)].sort(),
    provider_id:providerId,
    resource_improvement_required:!success&&['RESOURCE_DEFICIT','TEMPLATE_DEFICIT'].includes(cause),
    authority_constraints:{project_truth_mutation:false,visual_authority_mutation:false,decision_log_mutation:false,requires_normal_vekl_admission:true},
    evidence:{failures:certification.failures||[]},
  };
  artifact.content_hash=hashObject({...artifact,content_hash:null}); return artifact;
}
