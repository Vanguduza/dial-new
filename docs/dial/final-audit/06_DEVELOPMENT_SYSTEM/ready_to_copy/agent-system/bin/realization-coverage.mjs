import fs from "node:fs";
const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const f=load("agent-system/registries/FEATURE_REGISTRY.json");
const r=load("docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json");
const s=load("docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json");
const e=load("docs/dial/final-audit/11_FEATURE_REALIZATION/EVENTUALITY_PLAYBOOK_REGISTRY.json");
const c=load("docs/dial/final-audit/12_CLIENT_EXPERIENCE/CUSTOMER_ENDPOINT_REGISTRY.json");
const pf=load("docs/dial/final-audit/11_FEATURE_REALIZATION/SHARED_PLATFORM_FUNCTION_REGISTRY.json");
const sp=load("docs/dial/final-audit/17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json");
const wf=load("docs/dial/final-audit/16_HOME_IDENTITY_WHATSAPP/WHATSAPP_FLOW_REGISTRY.json");
let fail=[];
for(const x of f){
 const rr=r.filter(y=>y.feature_id===x.feature_id);
 if(rr.length!==1) fail.push(`${x.feature_id}: realization count ${rr.length}`);
 const facets=s.filter(y=>y.parent_feature_id===x.feature_id);
 if(facets.length!==9) fail.push(`${x.feature_id}: expected 9 facets, got ${facets.length}`);
 if(!(x.donor_refs||[]).length) fail.push(`${x.feature_id}: donor/source strategy missing`);
 if(!sp.some(y=>y.feature_id===x.feature_id)) fail.push(`${x.feature_id}: security profile missing`);
 if(["CUSTOMER","B2B_CUSTOMER","MIXED"].includes(x.client_exposure||"")){
   if(!c.some(y=>y.feature_id===x.feature_id)) fail.push(`${x.feature_id}: customer endpoint missing`);
 }
}
if(!e.some(x=>x.eventuality_id==="EV-DELIVERY-DAMAGE-001")) fail.push("shared delivery damage playbook missing");
if(e.length < 100) fail.push(`eventuality registry unexpectedly thin: ${e.length}`);
if(pf.length < 150) fail.push(`shared platform function registry unexpectedly thin: ${pf.length}`);
if(wf.length < 50) fail.push(`WhatsApp Flow registry unexpectedly thin: ${wf.length}`);
if(fail.length){console.error(fail.join("\n"));process.exit(1)}
console.log(JSON.stringify({
 top_level_features:f.length,
 realization_records:r.length,
 mandatory_facets:s.length,
 eventuality_playbooks:e.length,
 customer_endpoint_records:c.length,
 shared_platform_functions:pf.length,
 security_profiles:sp.length,
 whatsapp_flows:wf.length,
 status:"GREEN"
},null,2));
