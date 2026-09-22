#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDesignAuthority } from './design-authority-projector.mjs';
import { selectDesignStrategy, evaluateProviderEligibility } from './design-provider-router.mjs';
import { projectExternalReferenceInspiration } from './frontend-donor-projection.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const read=(rel)=>JSON.parse(fs.readFileSync(path.join(repo,rel),'utf8'));
const text=(rel)=>fs.readFileSync(path.join(repo,rel),'utf8');
const rows=[];
const gate=(id,ok,detail)=>rows.push({id,ok:Boolean(ok),detail});

try {
  const policy=read('agent-system/registries/EXTERNAL_REFERENCE_POLICY.json');
  gate('REF-G01',policy.mode==='REFERENCE_AND_INSPIRATION_ONLY' && policy.production_import_allowed===false && policy.runtime_dependency_allowed===false && policy.design_authority_allowed===false,'external repository policy is reference/inspiration only with no production authority');
  gate('REF-G02',['DIRECT_CODE_IMPORT','COMPONENT_IMPORT','ASSET_IMPORT','SCHEMA_IMPORT','BUSINESS_LOGIC_IMPORT','PIXEL_COPY','RUNTIME_DEPENDENCY'].every((x)=>policy.forbidden_uses.includes(x)),'all literal reuse paths are explicitly forbidden');

  const truth=text('agent-system/canon/PROJECT_TRUTH.md');
  gate('REF-G03',truth.includes('External repository reference lock — DEC-039') && !/FixItNow[^\n]{0,120}PORT-WHOLESALE/i.test(truth),'Project Truth carries DEC-039 and no active FixItNow wholesale-port directive');

  const donorRegistry=read('docs/dial/final-audit/11_FEATURE_REALIZATION/DONOR_REGISTRY.json');
  const externalRows=donorRegistry.filter((x)=>/^(DONOR-|REF-)/.test(String(x.donor_id||'')) && x.kind!=='SPECIALIST_SPEC');
  const refOnly=(x)=>x.adoption_mode==='REFERENCE_AND_INSPIRATION_ONLY' && x.production_import_allowed===false && x.runtime_dependency_allowed===false && x.source_of_truth_allowed===false && x.design_authority_allowed===false;
  gate('REF-G04',externalRows.length>0 && externalRows.every(refOnly),`${externalRows.length} external donor/reference registry rows are reference-only`);

  const qualification=read('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/DONOR_QUALIFICATION_STATUS.json');
  const qExternal=qualification.filter((x)=>/^(DONOR-|REF-)/.test(String(x.donor_id||'')) && x.kind!=='SPECIALIST_SPEC');
  gate('REF-G05',qExternal.every((x)=>x.locked_adoption_mode==='REFERENCE_AND_INSPIRATION_ONLY' && x.qualification_state==='REFERENCE_ONLY' && x.production_import_allowed===false && x.runtime_dependency_allowed===false),`${qExternal.length} qualification rows forbid production reuse`);

  const applicability=read('agent-system/registries/DONOR_APPLICABILITY_REGISTRY.json');
  const appRows=applicability.donors||[];
  gate('REF-G06',appRows.filter((x)=>x.classification==='EXTERNAL_REFERENCE').every((x)=>x.reference_policy==='REFERENCE_AND_INSPIRATION_ONLY' && x.production_import_allowed===false && x.runtime_dependency_allowed===false && x.design_authority_allowed===false),'commerce applicability registry is non-authoritative reference only');

  const unitMap={unit_lineage_id:'U-REF',unit_revision_hash:'r',product_experience_map:{applicable:true,knowledge_hash:'k',design_authorities:['DIAL']}};
  const legacy=projectDesignAuthority({unitMap,designMode:'DONOR_ADAPT',repoDir:repo});
  const strategy=selectDesignStrategy({designMode:'REFERENCE_INSPIRED_DIAL_NATIVE',directWorkerEligible:true});
  gate('REF-G07',legacy.design_mode==='REFERENCE_INSPIRED_DIAL_NATIVE' && legacy.donor_transformation_hash===null && !strategy.candidates.includes('DIRECT_DONOR_PORT_AND_TRANSFORM'),'legacy donor provenance canonicalizes to DIAL-native design and no direct donor port route exists');

  const provider=evaluateProviderEligibility({provider:{provider_id:'google-stitch',authority:'NON_AUTHORITATIVE_CANDIDATE',qualification_required:false,health:'HEALTHY',supported_phases:['EXPLORE'],supported_inputs:['structured_prompt','donor_screen'],supported_outputs:['design_artifact'],sensitive_data_allowed:false},phase:'EXPLORE',designProvenanceMode:'REFERENCE_INSPIRED_DIAL_NATIVE',requiredOutputs:['design_artifact']});
  gate('REF-G08',provider.eligible===false && provider.reasons.includes('RAW_EXTERNAL_REPOSITORY_SCREEN_INPUT_FORBIDDEN'),'raw external repository screens cannot be provider authority/input in reference-informed mode');

  const archetypes=read('agent-system/registries/TASK_ARCHETYPE_REGISTRY.json').archetypes;
  const templates=read('agent-system/registries/FRONTEND_TEMPLATE_REGISTRY.json').templates;
  gate('REF-G09',!archetypes.includes('DONOR_ASSIMILATION') && !archetypes.includes('DONOR_ADAPTATION') && archetypes.includes('EXTERNAL_REFERENCE_RESEARCH'),'task taxonomy has no donor assimilation/adaptation archetype');
  gate('REF-G10',!templates.some((x)=>x.mode==='ASSIMILATE'||/donor-assimilate/i.test(x.template_id||'')) && templates.some((x)=>x.mode==='REFERENCE_INSPIRATION'),'frontend templates expose research inspiration, not assimilation');

  const nodeTypes=read('agent-system/registries/KNOWLEDGE_NODE_TYPE_REGISTRY.json').node_types.map((x)=>x.node_type);
  const edgeTypes=read('agent-system/registries/KNOWLEDGE_EDGE_TYPE_REGISTRY.json').edge_types;
  gate('REF-G11',nodeTypes.includes('EXTERNAL_REFERENCE') && !nodeTypes.includes('DONOR') && edgeTypes.some((x)=>x.source_type==='EXTERNAL_REFERENCE'&&x.relationship==='informs_non_authoritatively'&&x.target_type==='FEATURE') && !edgeTypes.some((x)=>x.relationship==='transformed_for'),'GraphRAG models external references as non-authoritative evidence, not transformed implementation');

  const realization=read('docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json');
  const withExternal=realization.filter((x)=>(x.donor_refs||[]).some((id)=>/^(DONOR-|REF-)/.test(String(id))));
  gate('REF-G12',withExternal.every((x)=>x.donor_customization?.policy==='REFERENCE_AND_INSPIRATION_ONLY'),'every feature with an external reference has reference-only customization semantics');

  const frcs=read('docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json');
  const staleFrc=frcs.filter((x)=>JSON.stringify(x).includes('donor provenance/parity is green where code is assimilated'));
  gate('REF-G13',staleFrc.length===0,'feature implementation contracts no longer require donor assimilation/parity');

  const contracts=read('agent-system/registries/FRONTEND_CONTRACT_SCHEMA_REGISTRY.json').required_contracts;
  const schema=read('agent-system/schemas/frontend/FRONTEND_CONTRACTS.schema.json');
  gate('REF-G14',contracts.includes('ExternalReferenceInspirationProjection') && schema.$defs?.ExternalReferenceInspirationProjection && schema.$defs?.DonorFrontendReuseProjection?.deprecated===true,'frontend contracts make external-reference projection canonical and donor-reuse schema historical only');

  const projected=projectExternalReferenceInspiration({repoDir:repo,referenceId:'DONOR-FIXITNOW',unit:{unit_lineage_id:'U-REF'}});
  gate('REF-G15',projected.applicable===true && projected.use_mode==='REFERENCE_AND_INSPIRATION_ONLY' && projected.production_import_allowed===false && projected.runtime_dependency_allowed===false && projected.authority_semantics==='NON_AUTHORITATIVE_REFERENCE_ONLY','broad VEKL reference projection converts FixItNow into non-authoritative inspiration');
} catch(error) { gate('REF-INTERNAL',false,error.stack||error.message); }

for(const row of rows) console.log(`${row.ok?'PASS':'FAIL'} ${row.id} ${row.detail}`);
const failures=rows.filter((x)=>!x.ok);
console.log(JSON.stringify({status:failures.length?'RED':'GREEN',gates:rows.length,failures:failures.map((x)=>x.id)},null,2));
if(failures.length) process.exitCode=1;
