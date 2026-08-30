import fs from "node:fs";

const load=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const controls=load("docs/dial/final-audit/17_SECURITY/SECURITY_CONTROL_REGISTRY.json");
const profiles=load("docs/dial/final-audit/17_SECURITY/FEATURE_SECURITY_PROFILE_REGISTRY.json");
const features=load("agent-system/registries/FEATURE_REGISTRY.json");
const facets=load("docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json");

// Class list per docs/dial/final-audit/17_SECURITY/SECURITY_CLASS_CANON.md.
// This was hard-coded ["S1","S2","S3"], which would have rejected every S4
// profile the moment the four-class scheme was adopted.
const SECURITY_CLASSES=["S1","S2","S3","S4"];
const S4_STEP_UP_TEST="step-up authentication for privileged high-impact actions";

let fail=[];
if(controls.length < 90) fail.push(`security control registry unexpectedly thin: ${controls.length}`);
if(profiles.length !== features.length) fail.push(`security profiles ${profiles.length} != features ${features.length}`);

for(const f of features){
 const p=profiles.find(x=>x.feature_id===f.feature_id);
 if(!p) continue;
 if(!SECURITY_CLASSES.includes(p.security_tier)) fail.push(`${f.feature_id}: security tier "${p.security_tier}" is not a declared class (${SECURITY_CLASSES.join("/")})`);
 // S4 is privileged/admin/legal authority or health-specialist data. Expansion
 // 29.2 requires step-up authentication for privileged high-impact actions on
 // this class, so a profile that claims S4 without that test is not S4.
 if(p.security_tier==="S4"){
  if(!p.required_control_categories?.includes("PRIVILEGED_ACCESS")) fail.push(`${f.feature_id}: S4 profile missing PRIVILEGED_ACCESS control category`);
  if(!p.mandatory_tests?.includes(S4_STEP_UP_TEST)) fail.push(`${f.feature_id}: S4 profile missing the step-up authentication test`);
 }
 const sf=facets.filter(x=>x.parent_feature_id===f.feature_id && x.kind==="SECURITY_PRIVACY");
 if(sf.length!==1) fail.push(`${f.feature_id}: expected one SECURITY_PRIVACY facet, got ${sf.length}`);
}

const required=["SEC-SEC-001","SEC-DB-002","SEC-AUTH-001","SEC-ABUSE-001","SEC-IN-001","SEC-FILE-001","SEC-WEB-003","SEC-WEB-001","SEC-SC-002"];
for(const id of required) if(!controls.some(x=>x.control_id===id)) fail.push(`missing control ${id}`);

if(fail.length){console.error(fail.join("\n"));process.exit(1)}
const tiers={};for(const x of profiles)tiers[x.security_tier]=(tiers[x.security_tier]??0)+1;
console.log(JSON.stringify({
 security_controls:controls.length,
 tiers,
 feature_security_profiles:profiles.length,
 security_facets:facets.filter(x=>x.kind==="SECURITY_PRIVACY").length,
 status:"GREEN"
},null,2));
