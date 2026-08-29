import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const load=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const exists=(p)=>fs.existsSync(path.join(root,p));
let fail=[];

const features=load("agent-system/registries/FEATURE_REGISTRY.json");
const facets=load("docs/dial/final-audit/11_FEATURE_REALIZATION/SUBFEATURE_FUNCTION_REGISTRY.json");
const realization=load("docs/dial/final-audit/11_FEATURE_REALIZATION/FEATURE_REALIZATION_REGISTRY.json");
const frcs=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/FEATURE_IMPLEMENTATION_CONTRACT_REGISTRY.json");
const ev=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/02_EVENTUALITY_CONTRACTS/EXECUTABLE_EVENTUALITY_CONTRACT_REGISTRY.json");
const donors=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/DONOR_QUALIFICATION_STATUS.json");
const nfr=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/04_NFR/NFR_BUDGET_REGISTRY.json");
const envs=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/05_DEPLOYMENT/ENVIRONMENT_REGISTRY.json");
const blockers=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/06_ACTIVATION/ACTIVATION_BLOCKER_REGISTRY.json");
const ops=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/07_OPERATING_MODEL/OPERATIONAL_RESPONSIBILITY_REGISTRY.json");
const md=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/08_MASTER_DATA/MASTER_DATA_REGISTRY.json");
const branches=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/10_ACTIVATION_CONFIG/BRANCH_ACTIVATION_REGISTRY.json");
const repo=load("docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/11_REPOSITORY_ALIGNMENT/REPOSITORY_BOOTSTRAP_CHECKLIST.json");

if(features.length!==186) fail.push(`features=${features.length}, expected 186`);
if(facets.length!==186*9) fail.push(`facets=${facets.length}, expected ${186*9}`);
if(realization.length!==186) fail.push(`realization=${realization.length}, expected 186`);
if(frcs.length!==186) fail.push(`FRCs=${frcs.length}, expected 186`);

const forbidden=/feature-specific typed commands|domain state change event|all eight realization facets/i;
for(const f of frcs){
  if(!f.aggregate) fail.push(`${f.feature_id}: aggregate missing`);
  if(!Array.isArray(f.states)||f.states.length<3) fail.push(`${f.feature_id}: concrete states missing`);
  if(!Array.isArray(f.commands)||f.commands.length<3) fail.push(`${f.feature_id}: concrete commands missing`);
  if(!Array.isArray(f.queries)||f.queries.length<3) fail.push(`${f.feature_id}: queries missing`);
  if(!Array.isArray(f.events)||f.events.length<3) fail.push(`${f.feature_id}: events missing`);
  const txt=JSON.stringify(f);
  if(forbidden.test(txt)) fail.push(`${f.feature_id}: forbidden placeholder remains`);
}

for(const r of realization){
  const txt=JSON.stringify(r);
  if(forbidden.test(txt)) fail.push(`${r.feature_id}: legacy placeholder/drift remains`);
}

if(ev.length<250) fail.push(`eventuality contracts unexpectedly thin: ${ev.length}`);
for(const e of ev.filter(x=>x.materiality==="MATERIAL")){
  for(const k of ["owner_queue","commands","procedure_steps","terminal_states","closure_evidence"]){
    if(!e[k] || (Array.isArray(e[k]) && e[k].length===0)) fail.push(`${e.eventuality_id}: ${k} missing`);
  }
}

if(donors.length<40) fail.push(`donor qualification unexpectedly thin: ${donors.length}`);
for(const d of donors){
  if(!d.locked_adoption_mode||!d.qualification_state||!d.pre_use_gate) fail.push(`${d.donor_id}: donor gate incomplete`);
}
if(nfr.length<15) fail.push(`NFR systems unexpectedly thin: ${nfr.length}`);
if(envs.length<6) fail.push(`environment model unexpectedly thin: ${envs.length}`);
if(blockers.length<8) fail.push(`activation blockers unexpectedly thin: ${blockers.length}`);
if(ops.length<10) fail.push(`operations responsibility unexpectedly thin: ${ops.length}`);
if(md.length<10) fail.push(`master data registry unexpectedly thin: ${md.length}`);
if(branches.length<10) fail.push(`branch activation registry unexpectedly thin: ${branches.length}`);

const textFiles=[
 "docs/dial/final-audit/00_MASTER/DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md",
 "docs/dial/final-audit/00_MASTER/V2_2_ANCHOR_INDEX.md",
 "docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md",
 // v2.1 supersedes the v2.0 prompt for frontend/donor/Spare-transition work.
 // Both must be present: the v2.0 document remains active for everything v2.1
 // does not restate, and is retained with a supersession banner.
 "docs/dial/final-audit/13_PROMPTS/DIAL_MASTER_DEVELOPMENT_PROMPT_v2.md",
 "docs/dial/final-audit/13_PROMPTS/DIAL_MASTER_DEVELOPMENT_PROMPT_v2_1.md",
 "docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/02_TRANSITION_EPC_LOCK/TRANSITION_EPC_INTEGRATION_LOCK.md",
 "docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md",
 "docs/dial/final-audit/22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md",
 "docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/11_REPOSITORY_ALIGNMENT/ACTUAL_GITHUB_REPOSITORY_ALIGNMENT_AUDIT.md"
];
for(const p of textFiles) if(!exists(p)) fail.push(`missing ${p}`);

if(fail.length){
  console.error("DIAL v2 closure: RED");
  console.error(fail.join("\n"));
  process.exit(1);
}
const pendingBootstrap=repo.filter(x=>x.status!=="COMPLETE");
console.log(JSON.stringify({
  status: pendingBootstrap.length
    ? "CANON_CLOSED_PILOT_REQUIRED_BEFORE_FANOUT"
    : "CANON_CLOSED_REPOSITORY_ALIGNED",
  features:features.length,
  facets:facets.length,
  frcs:frcs.length,
  material_eventualities:ev.filter(x=>x.materiality==="MATERIAL").length,
  donors:donors.length,
  nfr_systems:nfr.length,
  environments:envs.length,
  activation_blockers:blockers.length,
  repo_bootstrap_tasks_pending:pendingBootstrap.length,
  repo_bootstrap_pending_ids:pendingBootstrap.map(x=>x.id),
  contract_specificity:"see: node agent-system/bin/contract-specificity.mjs (CT-7)"
},null,2));
