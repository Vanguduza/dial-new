import fs from "node:fs";

const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const controls=load("docs/dial/final-audit/17_SECURITY/SECURITY_CONTROL_REGISTRY.json");
const profiles=load("docs/dial/final-audit/17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json");
const features=load("agent-system/registries/FEATURE_REGISTRY.json");
const facets=load("docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json");

let fail=[];
if(controls.length < 90) fail.push(`security control registry unexpectedly thin: ${controls.length}`);
if(profiles.length !== features.length) fail.push(`security profiles ${profiles.length} != features ${features.length}`);

for(const f of features){
 const p=profiles.find(x=>x.feature_id===f.feature_id);
 if(!p) continue;
 if(!["S1","S2","S3"].includes(p.security_tier)) fail.push(`${f.feature_id}: invalid security tier`);
 const sf=facets.filter(x=>x.parent_feature_id===f.feature_id && x.kind==="SECURITY_PRIVACY");
 if(sf.length!==1) fail.push(`${f.feature_id}: expected one SECURITY_PRIVACY facet, got ${sf.length}`);
}

const required=["SEC-SEC-001","SEC-DB-002","SEC-AUTH-001","SEC-ABUSE-001","SEC-IN-001","SEC-FILE-001","SEC-WEB-003","SEC-WEB-001","SEC-SC-002"];
for(const id of required) if(!controls.some(x=>x.control_id===id)) fail.push(`missing control ${id}`);

if(fail.length){console.error(fail.join("\n"));process.exit(1)}
console.log(JSON.stringify({
 security_controls:controls.length,
 feature_security_profiles:profiles.length,
 security_facets:facets.filter(x=>x.kind==="SECURITY_PRIVACY").length,
 status:"GREEN"
},null,2));
