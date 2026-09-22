import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';
const uniq=(v=[])=>[...new Set((v||[]).filter(Boolean).map(String))].sort();

export function projectExternalReferenceInspiration({ repoDir, referenceId=null, donorId=null, donorRecord=null, unit=null }={}) {
  const commerce=loadRegistry(repoDir,'agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json',{donors:[]});
  const commerceRows=Array.isArray(commerce)?commerce:(commerce.donors||[]);
  const broad=loadRegistry(repoDir,'docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json',[]);
  const id=referenceId||donorId;
  const commerceRow=commerceRows.find((x)=>[x.donor_id,x.id,x.repository_id,x.name].filter(Boolean).includes(id))||null;
  const broadRow=(broad||[]).find((x)=>[x.donor_id,x.id,x.repository_id,x.name].filter(Boolean).includes(id))||null;
  const row=donorRecord||commerceRow||broadRow||null;
  const isExternal=Boolean(row && (row.classification==='EXTERNAL_REFERENCE' || String(row.donor_id||id||'').startsWith('DONOR-') || String(row.donor_id||id||'').startsWith('REF-')));
  if(!isExternal) return {applicable:false,state:'NO_EXTERNAL_REFERENCE',use_mode:'NONE'};
  const sourceRegistry=commerceRow?'agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json':'docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json';
  const result={
    schema_version:1,artifact_type:'ExternalReferenceInspirationProjection',artifact_id:`external-reference:${row.donor_id||row.id||row.name||'unknown'}`,
    status:'REFERENCE_ONLY',applicable:true,reference_id:row.donor_id||row.id||row.name||id,unit_lineage_id:unit?.unit_lineage_id||null,
    use_mode:'REFERENCE_AND_INSPIRATION_ONLY',
    inspiration_topics:uniq(row.inspiration_topics||row.preserve),
    anti_patterns_and_exclusions:uniq(row.anti_patterns_and_exclusions||row.replace),
    reference_notes:uniq(row.reference_notes||[row.role]),
    upstream:row.upstream||{repository:row.name||null,canonical_url:row.url||null,pinned_revision:null},
    production_import_allowed:false,runtime_dependency_allowed:false,source_of_truth_allowed:false,design_authority_allowed:false,
    visual_authority_promotion_allowed:false,semantic_preservation_required:false,pixel_copy_allowed:false,
    provider_projection:'ABSTRACT_SYNTHESIZED_DESCRIPTORS_ONLY',source_reference_hash:hashObject(row),
    source_registry:sourceRegistry,decision_ref:'DEC-039',authority_semantics:'NON_AUTHORITATIVE_REFERENCE_ONLY',
    provenance:{source_registry:sourceRegistry,reference_id:row.donor_id||id,decision_ref:'DEC-039'}
  };
  result.content_hash=hashObject({...result,content_hash:null});
  return result;
}

// Compatibility export: legacy callers may still use the old symbol, but its semantics are permanently reference-only under DEC-039.
export function projectFrontendDonorDecision(args={}) { return projectExternalReferenceInspiration(args); }
