import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

export function buildComponentLabFixtures({repoDir,componentIds=null}={}){
  const reg=loadRegistry(repoDir,'agent-system/registries/FRONTEND_COMPONENT_REGISTRY.json',{components:[]});
  const wanted=componentIds?new Set(componentIds):null;const components=(reg.components||[]).filter((x)=>!wanted||wanted.has(x.component_id));
  const fixtures=[];for(const c of components){for(const state of c.required_states||['READY']){const row={fixture_id:`${c.component_id}:${state}`,component_id:c.component_id,state,token_refs:[...(c.token_refs||[])].sort(),bindings:c.bindings||{},requirements:{semantic_role:true,keyboard_or_touch_access:true,reduced_motion_safe:true,no_fake_data:true}};fixtures.push({...row,fixture_hash:hashObject(row)});}}
  const artifact={schema_version:1,artifact_type:'ComponentLab',registry_version:reg.registry_version,fixtures:fixtures.sort((a,b)=>a.fixture_id.localeCompare(b.fixture_id))};artifact.content_hash=hashObject({...artifact,content_hash:null});return artifact;
}

export function certifyComponentFixture({fixture,evidence={}}={}){
  const required=['semantic_role','interaction','visual_states','accessibility','token_binding'];const failures=required.filter((x)=>evidence[x]!==true);const out={schema_version:1,artifact_type:'ComponentCertification',artifact_id:`component-cert:${fixture?.fixture_id||'unknown'}`,component_id:fixture?.component_id||null,fixture_id:fixture?.fixture_id||null,status:failures.length?'FAILED':'PASSED',failures,evidence_hash:hashObject(evidence),provenance:{fixture_hash:fixture?.fixture_hash||hashObject(fixture||{})}};out.content_hash=hashObject({...out,content_hash:null});return out;
}
