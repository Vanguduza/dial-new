import { hashObject } from './knowledge-graph-core.mjs';
import { buildDesignCandidateManifest, quarantineDesignArtifact } from './design-candidate-admission.mjs';
import { normalizeDesignCandidate } from './frontend-design-normalizer.mjs';

export const FIGMA_AUTHORITY_STATES=Object.freeze(['NON_AUTHORITATIVE_CANDIDATE','REFINEMENT_SOURCE','PROMOTION_PENDING','PROMOTED_VISUAL_AUTHORITY']);

export function providerPromptFromDesignBrief({brief,fdep}={}){
  if(!brief||!fdep) throw new Error('provider design brief and FDEP required');
  const surfaces=(fdep.surface_manifest?.surfaces||[]).map((x)=>x.surface_id).join(', ');
  const states=(fdep.surface_state_matrix?.surfaces||[]).flatMap((x)=>x.states.filter((s)=>String(s.requirement).startsWith('REQUIRED')).map((s)=>`${x.surface_id}:${s.state_id}`)).join(', ');
  return [
    'DIAL bounded frontend design task. Provider output is a non-authoritative candidate.',
    `Execution mode: ${fdep.presentation_decision?.execution_mode}.`,
    `Renderer target: ${fdep.presentation_decision?.renderer_id}.`,
    `Archetype: ${fdep.presentation_decision?.archetype_id}.`,
    `Pattern policy selection: ${fdep.presentation_decision?.pattern_id}.`,
    `Surfaces: ${surfaces||'authority-defined'}.`,
    `Required whole-surface states: ${states||'see SurfaceStateMatrix'}.`,
    'Do not invent product truth, prices, permissions, domain rules, security policy, tokens, or component identities.',
    'Preserve approved visual authority exactly where the packet declares CANONICAL_REFERENCE.',
    `Design brief hash: ${brief.content_hash}. FDEP hash: ${fdep.content_hash}.`,
  ].join('\n');
}

export function bindProviderCandidate({repoDir,providerId,taskId,unitLineageId,unitRevisionHash,rawContent,screenRefs=[],fdep,brief,candidateSemantics={}}={}){
  if(!fdep||!brief) throw new Error('provider candidate requires FDEP and DesignBriefBundle');
  const quarantine=quarantineDesignArtifact({content:rawContent,mimeType:'text/html'});
  if(!quarantine.ok) return {ok:false,stage:'QUARANTINE',quarantine};
  const manifest=buildDesignCandidateManifest({taskId,providerId,unitLineageId,unitRevisionHash,designAuthorityProjectionHash:fdep.visual_reference_spec?.content_hash||'SYSTEM_STANDARD',rawContent,quarantine,screenRefs,fdepHash:fdep.content_hash,designBriefHash:brief.content_hash,changeBudgetHash:fdep.change_budget?.content_hash||null,presentationDecisionHash:fdep.presentation_decision?.content_hash||null,vrdeHash:fdep.visual_render_determinism_envelope?.content_hash||null});
  const normalization=normalizeDesignCandidate({repoDir,candidate:candidateSemantics,fdep});
  return {ok:normalization.status==='NORMALIZED',stage:normalization.status==='NORMALIZED'?'NORMALIZED':'REJECTED',quarantine,manifest,normalization};
}

export function createFigmaCandidateState({taskId,fileRef,nodeRefs=[],fdep,previous=null,action='CREATE_CANDIDATE',authorityApprovalRef=null}={}){
  if(!fdep) throw new Error('Figma state requires FDEP');
  const transitions={
    CREATE_CANDIDATE:['NON_AUTHORITATIVE_CANDIDATE'],
    MARK_REFINEMENT_SOURCE:['REFINEMENT_SOURCE'],
    REQUEST_PROMOTION:['PROMOTION_PENDING'],
    PROMOTE:['PROMOTED_VISUAL_AUTHORITY'],
  };
  const target=(transitions[action]||[])[0]; if(!target) throw new Error(`unknown Figma action: ${action}`);
  const prev=previous?.authority_state||null;
  if(action==='PROMOTE' && prev!=='PROMOTION_PENDING') throw new Error('FIGMA_PROMOTION_REQUIRES_PENDING_STATE');if(action==='PROMOTE'&&!authorityApprovalRef)throw new Error('FIGMA_PROMOTION_REQUIRES_AUTHORITY_APPROVAL');
  const artifact={schema_version:1,artifact_type:'FigmaDesignCandidateState',artifact_id:`figma:${taskId}`,task_id:taskId,file_ref:fileRef||null,node_refs:[...new Set(nodeRefs)].sort(),authority_state:target,previous_authority_state:prev,fdep_hash:fdep.content_hash,presentation_decision_hash:fdep.presentation_decision?.content_hash||null,promotion_requires_owner_or_authorized_design_authority:target==='PROMOTED_VISUAL_AUTHORITY',authority_approval_ref:target==='PROMOTED_VISUAL_AUTHORITY'?authorityApprovalRef:null,reverse_authority_flow_forbidden:true,status:target,provenance:{action,previous_content_hash:previous?.content_hash||null}};
  artifact.content_hash=hashObject({...artifact,content_hash:null}); return artifact;
}
