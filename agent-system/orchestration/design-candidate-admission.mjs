import { hashObject } from './knowledge-graph-core.mjs';
const BAD=[['SCRIPT',/<script\b/i],['EVENT_HANDLER',/\son[a-z]+\s*=/i],['JAVASCRIPT_URL',/javascript:/i],['EVAL',/\beval\s*\(|new\s+Function\s*\(/i],['IFRAME',/<(?:iframe|object|embed)\b/i],['META_REFRESH',/<meta[^>]+http-equiv=["']?refresh/i],['SERVICE_WORKER',/serviceWorker\.register/i],['WEBSOCKET',/\b(?:WebSocket|EventSource)\s*\(/i],['CSS_IMPORT',/@import\s+/i],['REMOTE_URL',/https?:\/\//i],['SVG_SCRIPT',/<svg[\s\S]*?<script\b/i]];
export function quarantineDesignArtifact({content,mimeType='text/html'}={}){const text=String(content??'');const violations=BAD.filter(([,r])=>r.test(text)).map(([id])=>id);return{ok:violations.length===0,mime_type:mimeType,size_bytes:Buffer.byteLength(text),artifact_hash:hashObject(text),violations};}

export function sanitizeDesignArtifactForEvidence({content,mimeType='text/html'}={}){
  const raw=String(content??'');
  const rawQuarantine=quarantineDesignArtifact({content:raw,mimeType});
  let inert=raw
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi,'')
    .replace(/<(?:iframe|object|embed)\b[\s\S]*?<\/(?:iframe|object|embed)\s*>/gi,'')
    .replace(/<(?:iframe|object|embed)\b[^>]*\/?\s*>/gi,'')
    .replace(/<meta\b[^>]*http-equiv=[\"']?refresh[^>]*>/gi,'')
    .replace(/\s+on[a-z]+\s*=\s*(?:[\"'][^\"']*[\"']|[^\s>]+)/gi,'')
    .replace(/\s+(?:src|href|action|formaction|poster)\s*=\s*([\"'])https?:\/\/[^\"']*\1/gi,'')
    .replace(/\s+(?:src|href|action|formaction|poster)\s*=\s*https?:\/\/[^\s>]+/gi,'')
    .replace(/url\(\s*([\"']?)https?:\/\/[^)]*\1\s*\)/gi,'url("")')
    .replace(/@import\s+(?:url\()?\s*([\"']?)https?:\/\/[^;)]*\1\)?\s*;?/gi,'')
    .replace(/javascript:/gi,'')
    .replace(/https?:\/\/[^\s<>'\")]+/gi,'');
  const sanitizedQuarantine=quarantineDesignArtifact({content:inert,mimeType});
  return {
    ok:sanitizedQuarantine.ok,
    content:inert,
    raw_quarantine:rawQuarantine,
    sanitized_quarantine:sanitizedQuarantine,
    transformed:raw!==inert,
    transformation_hash:hashObject({raw_artifact_hash:rawQuarantine.artifact_hash,sanitized_artifact_hash:sanitizedQuarantine.artifact_hash,policy:'INERT_DESIGN_EVIDENCE_V1'}),
  };
}
export function buildDesignCandidateManifest({taskId,providerId,unitLineageId,unitRevisionHash,designAuthorityProjectionHash,rawContent,quarantine,screenRefs=[],fdepHash=null,designBriefHash=null,changeBudgetHash=null,presentationDecisionHash=null,vrdeHash=null}={}){if(!quarantine?.ok)throw new Error('PROVIDER_OUTPUT_QUARANTINE_FAILED');const base={schema_version:1,task_id:taskId,provider_id:providerId,unit_lineage_id:unitLineageId,unit_revision_hash:unitRevisionHash,design_authority_projection_hash:designAuthorityProjectionHash,frontend_design_execution_packet_hash:fdepHash,design_brief_bundle_hash:designBriefHash,change_budget_hash:changeBudgetHash,presentation_decision_hash:presentationDecisionHash,visual_render_determinism_envelope_hash:vrdeHash,raw_artifact_hash:hashObject(String(rawContent??'')),quarantine_evidence_hash:hashObject(quarantine),screen_refs:[...new Set(screenRefs)].sort(),security_state:'PASS',authority_state:'REVIEW_REQUIRED',authority:'NON_AUTHORITATIVE_DESIGN_CANDIDATE'};return{...base,candidate_hash:hashObject(base),candidate_id:`DESIGN-${hashObject(base).slice(0,24)}`};}
export function admitDesignCandidate({
  candidate,
  authorityConforms,
  requiredStatesPresent,
  stateCoverageMode='PROVIDER_REQUIRED',
  primaryCompositionPresent=null,
  donorSemanticsPreserved=true,
  designNormalizationEvidence=null,
  changeBudgetSatisfied=null,
}={}){
  if(!candidate) throw new Error('candidate required');
  const failures=[];
  const deferred=stateCoverageMode==='DOWNSTREAM_AEF_REQUIRED';
  if(!['PROVIDER_REQUIRED','DOWNSTREAM_AEF_REQUIRED'].includes(stateCoverageMode)) failures.push('STATE_COVERAGE_MODE_INVALID');
  if(authorityConforms!==true) failures.push('DESIGN_AUTHORITY_DRIFT');
  if(!deferred && requiredStatesPresent!==true) failures.push('REQUIRED_STATES_MISSING');
  if(deferred && !candidate.frontend_design_execution_packet_hash) failures.push('STATE_COVERAGE_DEFER_REQUIRES_FDEP');
  if(deferred && primaryCompositionPresent!==true) failures.push('PRIMARY_COMPOSITION_REQUIRED');
  if(donorSemanticsPreserved!==true) failures.push('DONOR_SEMANTICS_NOT_PRESERVED');
  if(candidate.frontend_design_execution_packet_hash&&designNormalizationEvidence?.status!=='NORMALIZED') failures.push('DESIGN_NORMALIZATION_REQUIRED');
  if(candidate.change_budget_hash&&changeBudgetSatisfied!==true) failures.push('CHANGE_BUDGET_NOT_SATISFIED');
  if(failures.length) return {ok:false,failures};
  const base={
    schema_version:1,
    candidate_id:candidate.candidate_id,
    candidate_hash:candidate.candidate_hash,
    unit_lineage_id:candidate.unit_lineage_id,
    unit_revision_hash:candidate.unit_revision_hash,
    design_authority_projection_hash:candidate.design_authority_projection_hash,
    frontend_design_execution_packet_hash:candidate.frontend_design_execution_packet_hash||null,
    design_normalization_evidence_hash:designNormalizationEvidence?.content_hash||null,
    accepted_screen_refs:candidate.screen_refs,
    state_coverage_mode:stateCoverageMode,
    required_states_present_at_admission:requiredStatesPresent===true,
    downstream_state_certification_required:deferred,
    accepted_at:new Date().toISOString(),
  };
  return {ok:true,manifest:{...base,manifest_hash:hashObject({...base,accepted_at:null})}};
}
