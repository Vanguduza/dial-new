import fs from 'node:fs';
import path from 'node:path';
import { hashObject } from './knowledge-graph-core.mjs';

const SRC='docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/01_DONOR_STRATEGY/DONOR_ASSIMILATION_MATRIX_v2_1.json';
const POLICY='agent-system/registries/EXTERNAL_REFERENCE_POLICY.json';
const OUT='agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json';
const DIAL_NATIVE_ID='DIAL-EPC-TRANSITION-NATIVE';
const uniq=(xs=[])=>[...new Set(xs.filter(Boolean).map(String))].sort();

function makeReference(row, policy){
  if(row.donor_id===DIAL_NATIVE_ID){
    const base={
      schema_version:1,donor_id:row.donor_id,classification:'DIAL_NATIVE_CANONICAL_NOT_EXTERNAL_REFERENCE',
      applicable_divisions:uniq(row.applies_to||[]),canonical_authority_refs:uniq(row.authority_refs||[]),
      reference_policy:'NOT_APPLICABLE_DIAL_NATIVE',production_import_allowed:false,runtime_dependency_allowed:false,
      source_of_truth_allowed:false,design_authority_allowed:false,visual_authority_promotion_allowed:false,
      note:'This historical matrix row describes DIAL-native frozen contracts; authority comes from DIAL canon, never from donor/reference policy.',
      authority:'DERIVED_REFERENCE_CLASSIFICATION'
    };
    return {...base,projection_hash:hashObject(base)};
  }
  const base={
    schema_version:1,donor_id:row.donor_id,classification:'EXTERNAL_REFERENCE',
    authority_refs:[SRC,POLICY,'DEC-039'],applicable_divisions:uniq(row.applies_to||[]),
    upstream:{repository:row.name,canonical_url:row.url||null,pinned_revision:null},
    license:{status:'RESEARCH_CONTEXT_ONLY_UNRESOLVED_FOR_PRODUCTION'},
    reference_policy:policy.mode,
    inspiration_topics:uniq(row.use||[]),
    reference_notes:uniq([row.integration_rule].filter(Boolean)),
    anti_patterns_and_exclusions:uniq(row.do_not_adopt||[]),
    production_import_allowed:false,runtime_dependency_allowed:false,source_of_truth_allowed:false,
    design_authority_allowed:false,visual_authority_promotion_allowed:false,semantic_preservation_required:false,
    code_copy_allowed:false,component_copy_allowed:false,asset_copy_allowed:false,schema_copy_allowed:false,business_logic_copy_allowed:false,pixel_copy_allowed:false,
    provider_input_policy:policy.provider_input_policy,
    sanitization_policy_id:'dial-donor-egress-1',egress_policy_id:'dial-provider-egress-1',
    refresh_policy:'RESEARCH_REFRESH_ONLY_NO_IMPORT',authority:'NON_AUTHORITATIVE_EXTERNAL_REFERENCE'
  };
  return {...base,projection_hash:hashObject(base)};
}
export function compileDonorApplicability(repoDir){
  const rows=JSON.parse(fs.readFileSync(path.join(repoDir,SRC),'utf8'));
  const policy=JSON.parse(fs.readFileSync(path.join(repoDir,POLICY),'utf8'));
  return {schema_version:1,registry_version:'dial-external-reference-1',authority:'NON_AUTHORITATIVE_EXTERNAL_REFERENCE_REGISTRY',decision_ref:'DEC-039',policy_hash:hashObject(policy),source_hash:hashObject(rows),donors:rows.map((r)=>makeReference(r,policy)).sort((a,b)=>a.donor_id.localeCompare(b.donor_id))};
}
export function writeDonorApplicability(repoDir){const out=compileDonorApplicability(repoDir);fs.writeFileSync(path.join(repoDir,OUT),JSON.stringify(out,null,2)+'\n');return out;}
export function checkDonorApplicability(repoDir){const a=compileDonorApplicability(repoDir),b=JSON.parse(fs.readFileSync(path.join(repoDir,OUT),'utf8'));return{ok:JSON.stringify(a)===JSON.stringify(b),references:a.donors.length,hash:hashObject(a)};}
if(import.meta.url===`file://${process.argv[1]}`){const repo=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');const cmd=process.argv[2]||'check';const r=cmd==='write'?writeDonorApplicability(repo):checkDonorApplicability(repo);console.log(JSON.stringify(r,null,2));if(cmd!=='write'&&!r.ok)process.exitCode=1;}
