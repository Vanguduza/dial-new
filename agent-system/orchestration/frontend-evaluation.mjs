import { hashObject } from './knowledge-graph-core.mjs';

export const FRONTEND_FAILURE_CAUSES=Object.freeze(['WORKER_PERFORMANCE','RESOURCE_DEFICIT','TEMPLATE_DEFICIT','EXTERNAL_PROVIDER_FAILURE','HARNESS_FAILURE','AUTHORITY_AMBIGUITY','UNDETERMINED']);
export function attributeFrontendOutcome({certification,providerHealth=null,workerOutcome=null,resourceDiagnostics=null,templateDiagnostics=null}={}){
  let cause='UNDETERMINED',reason='insufficient causal evidence';
  if(certification?.ok===true){cause='WORKER_PERFORMANCE';reason='successful outcome; no failure attribution required';}
  else if(providerHealth&&['UNAVAILABLE','DEGRADED','QUARANTINED'].includes(providerHealth.state)){cause='EXTERNAL_PROVIDER_FAILURE';reason=`provider ${providerHealth.state}`;}
  else if(resourceDiagnostics?.missing_required_context===true){cause='RESOURCE_DEFICIT';reason='required context/resource missing';}
  else if(templateDiagnostics?.template_inadequate===true){cause='TEMPLATE_DEFICIT';reason='selected template did not cover required execution mode';}
  else if(workerOutcome?.harness_failure===true){cause='HARNESS_FAILURE';reason='execution harness failure';}
  else if(workerOutcome?.completed===true&&workerOutcome?.verification_failed===true){cause='WORKER_PERFORMANCE';reason='worker completed but verification failed without resource/provider deficit';}
  const out={schema_version:1,artifact_type:'FrontendOutcomeAttribution',cause,reason,certification_hash:certification?.content_hash||null,updates_worker_rating:cause==='WORKER_PERFORMANCE'&&certification?.ok!==true,updates_vekl_resources:['RESOURCE_DEFICIT','TEMPLATE_DEFICIT'].includes(cause),updates_provider_health:cause==='EXTERNAL_PROVIDER_FAILURE',canon_mutation_allowed:false};out.content_hash=hashObject({...out,content_hash:null});return out;
}
