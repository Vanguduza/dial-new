import { compileGraphContent } from './canon-graph-compiler.mjs';
import { hashObject, loadRegistry, registryHash } from './knowledge-graph-core.mjs';

function uniq(v){return [...new Set((v||[]).filter(Boolean).map(String))].sort();}
function nodeRef(type,id){return `${type}:${id}`;}

export function compileFrontendGraphProjection({repoDir,unit,projection,featureRecord=null,contractRecord=null}={}){
  if(!repoDir||!unit) throw new Error('frontend graph overlay requires repoDir and unit');
  const base=compileGraphContent(repoDir);
  if(!projection?.applicable) return {schema_version:1,kind:'VEKL_PRODUCT_EXPERIENCE_SUBGRAPH',base_graph_generation_id:base.graph_generation_id,base_graph_revision_hash:base.graph_revision_hash,nodes:[],edges:[],subgraph_hash:hashObject({unit:unit.unit_lineage_id,empty:true})};
  const nodes=new Map(); const edges=new Map();
  const addNode=(type,id,data,authority_reference)=>{
    const ref=nodeRef(type,id);
    const row={node_ref:ref,node_type:type,canonical_id:String(id),authority_reference:authority_reference||null,data};
    const existing=nodes.get(ref); if(existing&&hashObject(existing)!==hashObject(row)) throw new Error(`frontend graph node collision: ${ref}`);
    nodes.set(ref,row); return ref;
  };
  const addEdge=(source_ref,relationship,target_ref,stable_ref,source_content_hash)=>{
    const e={edge_ref:`EDGE:${hashObject({source_ref,relationship,target_ref}).slice(0,32)}`,source_ref,relationship,target_ref,source_content_hash,provenance_ref:stable_ref,graph_schema_version:base.graph_schema_version||'vekl-graph-1',derivation_class:'COMPILED_PRODUCT_EXPERIENCE_REFERENCE',creation_graph_generation:base.graph_generation_id,tombstoned:false};
    edges.set(`${source_ref}|${relationship}|${target_ref}`,e);
  };
  const authRefs=[];
  for(const ref of projection.visual_reference_spec?.references||[]){
    const id=ref.reference_id;
    const n=addNode('DESIGN_AUTHORITY',id,{authority_level:ref.authority_level,required_fidelity:ref.required_fidelity,ref:ref.ref}, {object_type:'DESIGN_AUTHORITY',object_id:id,stable_ref:ref.ref||'DEVELOPMENT_UNIT.design_authorities',expected_content_hash:hashObject(ref)});
    authRefs.push(n);
  }
  const declaredJourneyIds=new Set();
  for(const s of projection.surface_manifest?.surfaces||[]) for(const j of s.user_journey_refs||[]) declaredJourneyIds.add(j);
  for(const j of uniq([...(featureRecord?.user_journey_refs||[]),...(contractRecord?.user_journey_refs||[])])) declaredJourneyIds.add(j);
  const journeyRefs=new Map();
  for(const id of [...declaredJourneyIds].sort()) journeyRefs.set(id,addNode('USER_JOURNEY',id,{journey_id:id},{object_type:'USER_JOURNEY',object_id:id,stable_ref:contractRecord?'FRC':'FEATURE_REGISTRY',expected_content_hash:hashObject({id})}));
  const templateRegistryRel='agent-system/registries/FRONTEND_TEMPLATE_REGISTRY.json';
  const templateRegistry=loadRegistry(repoDir,templateRegistryRel,{templates:[]});
  const templateById=new Map((templateRegistry.templates||[]).map((x)=>[x.template_id,x]));
  const templateResourceRefs=[];
  for(const id of uniq(projection.presentation_decision?.template_ids||[])){
    const row=templateById.get(id);
    if(!row) throw new Error(`frontend template missing from governed registry: ${id}`);
    templateResourceRefs.push(addNode('ENGINEERING_RESOURCE',id,{resource_class:'WORKFLOW_LOOP',status:'ACTIVE',selection_role:'POLICY',selection_purpose:'PRODUCT_EXPERIENCE_TEMPLATE',template_mode:row.mode,required_inputs:row.required_inputs||[],outputs:row.outputs||[]},{object_type:'ENGINEERING_RESOURCE',object_id:id,stable_ref:templateRegistryRel,expected_content_hash:hashObject(row)}));
  }
  for(const surface of projection.surface_manifest?.surfaces||[]){
    const sid=surface.surface_id;
    const sref=addNode('SCREEN',sid,{unit_lineage_id:unit.unit_lineage_id,feature_ids:unit.feature_ids||[],source_ref:surface.source_ref,route:surface.route||null,kind:surface.kind||null},{object_type:'SCREEN',object_id:sid,stable_ref:surface.source_ref||'FRC',expected_content_hash:hashObject(surface)});
    for(const aref of authRefs) addEdge(sref,'governed_by',aref,surface.source_ref||'DEVELOPMENT_UNIT.design_authorities',hashObject(surface));
    const refs=uniq([...(surface.user_journey_refs||[]),...(featureRecord?.user_journey_refs||[]),...(contractRecord?.user_journey_refs||[])]);
    for(const jid of refs){ const jref=journeyRefs.get(jid); if(jref) addEdge(sref,'realizes',jref,surface.source_ref||'FRC',hashObject(surface)); }
  }
  const out={
    schema_version:1,
    kind:'VEKL_PRODUCT_EXPERIENCE_SUBGRAPH',
    unit_lineage_id:unit.unit_lineage_id,
    unit_revision_hash:unit.unit_revision_hash,
    base_graph_generation_id:base.graph_generation_id,
    base_graph_revision_hash:base.graph_revision_hash,
    nodes:[...nodes.values()].sort((a,b)=>a.node_ref.localeCompare(b.node_ref)),
    edges:[...edges.values()].sort((a,b)=>a.edge_ref.localeCompare(b.edge_ref)),
    frontend_template_resource_refs:templateResourceRefs.sort(),
    frontend_template_registry_hash:registryHash(repoDir,templateRegistryRel),
    declared_missing:{design_authority:(projection.visual_reference_spec?.references||[]).length===0,user_journey:declaredJourneyIds.size===0,screen:(projection.surface_manifest?.surfaces||[]).length===0},
    authority:'DERIVED_NON_AUTHORITATIVE_INDEX',semantics:'UNIT_SCOPED_PRODUCT_EXPERIENCE_SUBGRAPH_USING_EXISTING_VEKL_NODE_AND_EDGE_VOCABULARY_NOT_A_SECOND_GRAPH_AUTHORITY',
  };
  out.subgraph_hash=hashObject({...out,subgraph_hash:null});
  return out;
}
