// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectDesignAuthority } from '../agent-system/orchestration/design-authority-projector.mjs';
import { evaluateProviderEligibility, selectDesignStrategy } from '../agent-system/orchestration/design-provider-router.mjs';
import { projectExternalReferenceInspiration } from '../agent-system/orchestration/frontend-donor-projection.mjs';
import { admitDesignCandidate } from '../agent-system/orchestration/design-candidate-admission.mjs';

const repoDir=process.cwd();
const load=(rel)=>JSON.parse(fs.readFileSync(path.join(repoDir,rel),'utf8'));

describe('VEKL external repositories are reference and inspiration only',()=>{
  it('projects every external donor/reference registry row as non-authoritative',()=>{
    const rows=load('docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json')
      .filter((x)=>/^(DONOR-|REF-)/.test(String(x.donor_id||'')) && x.kind!=='SPECIALIST_SPEC');
    expect(rows.length).toBeGreaterThan(20);
    for(const row of rows){
      expect(row.adoption_mode,row.donor_id).toBe('REFERENCE_AND_INSPIRATION_ONLY');
      expect(row.production_import_allowed,row.donor_id).toBe(false);
      expect(row.runtime_dependency_allowed,row.donor_id).toBe(false);
      expect(row.source_of_truth_allowed,row.donor_id).toBe(false);
      expect(row.design_authority_allowed,row.donor_id).toBe(false);
    }
  });

  it('turns legacy donor design modes into reference-inspired DIAL-native design',()=>{
    const unitMap={unit_lineage_id:'U',unit_revision_hash:'r',product_experience_map:{applicable:true,knowledge_hash:'k',design_authorities:['DIAL']}};
    const p=projectDesignAuthority({unitMap,designMode:'DONOR_ADAPT',repoDir});
    expect(p.design_mode).toBe('REFERENCE_INSPIRED_DIAL_NATIVE');
    expect(p.donor_transformation_hash).toBe(null);
    expect(p.legacy_design_mode_input).toBe('DONOR_ADAPT');
  });

  it('has no direct donor port strategy and rejects raw donor-screen provider input',()=>{
    const s=selectDesignStrategy({designMode:'REFERENCE_INSPIRED_DIAL_NATIVE',directWorkerEligible:true});
    expect(s.candidates).not.toContain('DIRECT_DONOR_PORT_AND_TRANSFORM');
    const verdict=evaluateProviderEligibility({
      provider:{provider_id:'google-stitch',authority:'NON_AUTHORITATIVE_CANDIDATE',qualification_required:false,health:'HEALTHY',supported_phases:['EXPLORE'],supported_inputs:['structured_prompt','donor_screen'],supported_outputs:['design_artifact'],sensitive_data_allowed:false},
      phase:'EXPLORE',designProvenanceMode:'REFERENCE_INSPIRED_DIAL_NATIVE',requiredOutputs:['design_artifact']
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons).toContain('RAW_EXTERNAL_REPOSITORY_SCREEN_INPUT_FORBIDDEN');
  });

  it('projects non-commerce references such as FixItNow through the same non-authority contract',()=>{
    const p=projectExternalReferenceInspiration({repoDir,referenceId:'DONOR-FIXITNOW',unit:{unit_lineage_id:'U'}});
    expect(p.applicable).toBe(true);
    expect(p.use_mode).toBe('REFERENCE_AND_INSPIRATION_ONLY');
    expect(p.production_import_allowed).toBe(false);
    expect(p.runtime_dependency_allowed).toBe(false);
    expect(p.design_authority_allowed).toBe(false);
    expect(p.source_registry).toBe('docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json');
  });

  it('blocks candidate admission when the external-reference non-authority boundary is violated',()=>{
    const candidate={candidate_id:'C',candidate_hash:'h',unit_lineage_id:'U'};
    const result=admitDesignCandidate({candidate,authorityConforms:true,requiredStatesPresent:true,externalReferenceNonAuthorityPreserved:false});
    expect(result.ok).toBe(false);
    expect(result.failures).toContain('EXTERNAL_REFERENCE_NON_AUTHORITY_VIOLATION');
  });

  it('keeps external reference nodes non-authoritative in GraphRAG vocabulary',()=>{
    const nodes=load('agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json').node_types.map((x)=>x.node_type);
    const edges=load('agent-system/registries/KNOWLEDGE_EDGE_TYPE_REGISTRY.json').edge_types;
    expect(nodes).toContain('EXTERNAL_REFERENCE');
    expect(nodes).not.toContain('DONOR');
    expect(edges).toContainEqual(expect.objectContaining({source_type:'EXTERNAL_REFERENCE',relationship:'informs_non_authoritatively',target_type:'FEATURE'}));
    expect(edges.some((x)=>x.relationship==='transformed_for')).toBe(false);
  });
});
