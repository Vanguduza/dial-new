import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

function uniq(v){return [...new Set((v||[]).filter(Boolean).map(String))].sort();}
function upper(v){return String(v||'').toUpperCase();}

function modeFromRecord(row={}) {
  const adoption=upper(row.adoption_mode || row.mode || '');
  const t=row.transformation || row.transformation_policy || {};
  const preserve=uniq(t.preserve), adapt=uniq(t.adapt), replace=uniq(t.replace), enhance=uniq(t.enhance), forbid=uniq(t.forbid);
  const blob=upper(JSON.stringify(row));
  if (/REJECT|FORBID|NOT_APPLICABLE/.test(adoption) && !preserve.length && !adapt.length) return 'REJECT';
  if (/WHOLESALE/.test(adoption)) return replace.length ? 'PORT_AND_ADAPT' : 'WHOLESALE';
  if (/REFERENCE/.test(adoption)) return /VISUAL|UI|DESIGN/.test(blob) ? 'VISUAL_PATTERN_ONLY' : 'REFERENCE_ONLY';
  if (/ALGORITHM/.test(blob) && !/UI|UX|VISUAL/.test(blob)) return 'ALGORITHM_ONLY';
  if (/LOGIC/.test(blob) && !/VISUAL|STYLE/.test(blob)) return 'LOGIC_ONLY';
  if (/UX|FLOW|INTERACTION/.test(blob) && !/VISUAL|STYLE|THEME/.test(blob)) return 'UX_PATTERN_ONLY';
  if (/VISUAL|STYLE|THEME|COMPONENT/.test(blob) && !/BUSINESS LOGIC|DOMAIN/.test(blob)) return 'VISUAL_PATTERN_ONLY';
  if (preserve.length || adapt.length || enhance.length) return 'PORT_AND_ADAPT';
  return 'REFERENCE_ONLY';
}

export function projectFrontendDonorDecision({ repoDir, donorId=null, donorRecord=null, unit=null }={}) {
  const registry=loadRegistry(repoDir,'agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json',[]);
  const rows=Array.isArray(registry)?registry:(registry.donors||registry.entries||[]);
  const row=donorRecord || rows.find((x)=>[x.donor_id,x.id,x.repository_id,x.name].filter(Boolean).includes(donorId)) || null;
  if(!row) return {applicable:false,state:'NO_DONOR_DECISION',reuse_mode:'REJECT'};
  const transformation=row.transformation || row.transformation_policy || {};
  const result={
    schema_version:1,
    artifact_type:'DonorFrontendReuseProjection',
    artifact_id:`donor-frontend:${row.donor_id||row.id||row.name||'unknown'}`,
    status:'DERIVED_FROM_EXISTING_DONOR_AUTHORITY',
    applicable:true,
    donor_id:row.donor_id||row.id||row.name||donorId,
    unit_lineage_id:unit?.unit_lineage_id||null,
    reuse_mode:modeFromRecord(row),
    preserve:uniq(transformation.preserve),
    adapt:uniq(transformation.adapt),
    replace:uniq(transformation.replace),
    enhance:uniq(transformation.enhance),
    forbid:uniq(transformation.forbid),
    source_authority_hash:hashObject(row),
    source_registry:'agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json',
    authority_semantics:'PROJECTION_ONLY_EXISTING_DONOR_APPLICABILITY_REMAINS_SUPERIOR',
    provenance:{existing_donor_decision_id:row.decision_id||row.donor_id||row.id||null},
  };
  result.content_hash=hashObject({...result,content_hash:null});
  return result;
}
