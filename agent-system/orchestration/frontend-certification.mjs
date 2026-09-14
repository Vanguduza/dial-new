import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';
import { evaluateProductExperienceHardGate, evaluateProductExperienceQualitativeGate } from './product-experience-knowledge-gate.mjs';

const VISUAL_GATES=Object.freeze(['V1_STRUCTURAL','V2_GEOMETRY','V3_TYPOGRAPHY','V4_ASSETS','V5_PERCEPTUAL','V6_DELTA_PROVENANCE','V7_RESPONSIVE_IDENTITY','V8_AUTHORITY_SIGNOFF']);
function uniq(v){return [...new Set((v||[]).filter(Boolean).map(String))].sort();}

export function areVisualEnvelopesComparable(a,b){
  if(!a||!b) return {comparable:false,reasons:['VRDE_MISSING']};
  const fields=['platform','renderer','density','locale','timezone','color_scheme','font_scale','animation_policy','capture_settle_policy','dynamic_region_policy','asset_manifest_hash','framework_version','harness_version'];
  const reasons=[];
  for(const f of fields) if((a[f]??null)!==(b[f]??null)) reasons.push(`VRDE_MISMATCH:${f}`);
  if(hashObject(a.viewport||null)!==hashObject(b.viewport||null)) reasons.push('VRDE_MISMATCH:viewport');
  return {comparable:reasons.length===0,reasons};
}

export function evaluateDesignLint({repoDir,implementation={}}={}){
  const tokenReg=loadRegistry(repoDir,'agent-system/registries/FRONTEND_TOKEN_REGISTRY.json',{tokens:[]});
  const componentReg=loadRegistry(repoDir,'agent-system/registries/FRONTEND_COMPONENT_REGISTRY.json',{components:[]});
  const tokenIds=new Set((tokenReg.tokens||[]).map((x)=>x.token_id));
  const componentIds=new Set((componentReg.components||[]).map((x)=>x.component_id));
  const violations=[];
  for(const id of uniq(implementation.token_ids)) if(!tokenIds.has(id)) violations.push(`UNKNOWN_TOKEN:${id}`);
  for(const id of uniq(implementation.component_ids)) if(!componentIds.has(id)) violations.push(`UNKNOWN_COMPONENT:${id}`);
  if(implementation.hardcoded_design_values===true) violations.push('HARDCODED_DESIGN_VALUES');
  if(implementation.dead_controls===true) violations.push('DEAD_CONTROLS');
  if(implementation.placeholder_helper_text===true) violations.push('PLACEHOLDER_HELPER_TEXT');
  if(implementation.fake_data===true) violations.push('FAKE_DATA');
  const result={schema_version:1,artifact_type:'DesignLintReport',artifact_id:`design-lint:${hashObject(implementation).slice(0,24)}`,status:violations.length?'FAILED':'PASSED',violations,provenance:{implementation_hash:hashObject(implementation)}};
  result.content_hash=hashObject({...result,content_hash:null}); return result;
}

export function measureDesignSystemSaturation({implementation={}}={}){
  const total=Math.max(0,Number(implementation.total_visual_elements||0));
  const governed=Math.max(0,Number(implementation.governed_visual_elements||0));
  const ratio=total?Math.min(1,governed/total):1;
  return {total_visual_elements:total,governed_visual_elements:governed,saturation:Number(ratio.toFixed(6)),state:ratio>=0.95?'GREEN':ratio>=0.8?'REVIEW':'FAIL'};
}

export function evaluateDesignCodeParity({design={},code={},authorityState='DERIVED'}={}){
  const designComponents=uniq(design.component_ids),codeComponents=uniq(code.component_ids); const designTokens=uniq(design.token_ids),codeTokens=uniq(code.token_ids);
  const drift={component_only_in_design:designComponents.filter((x)=>!codeComponents.includes(x)),component_only_in_code:codeComponents.filter((x)=>!designComponents.includes(x)),token_only_in_design:designTokens.filter((x)=>!codeTokens.includes(x)),token_only_in_code:codeTokens.filter((x)=>!designTokens.includes(x))};
  const hasDrift=Object.values(drift).some((x)=>x.length);
  const result={schema_version:1,artifact_type:'DesignCodeParityStatus',artifact_id:`design-code-parity:${hashObject({design,code,authorityState}).slice(0,24)}`,authority_state:authorityState,status:hasDrift?'DRIFT':'ALIGNED',drift,reconciliation:hasDrift?(authorityState==='CANONICAL_REFERENCE'?'CODE_MUST_RECONCILE_TO_AUTHORITY':'REVIEW_BIDIRECTIONALLY'):'NONE',provenance:{design_hash:hashObject(design),code_hash:hashObject(code)}};
  result.content_hash=hashObject({...result,content_hash:null}); return result;
}

function visualGateResult(id,evidence,fdep){
  const value=evidence?.[id];
  if(value===true || value?.passed===true) return {gate_id:id,state:'PASSED',evidence_hash:value?.evidence_hash||null};
  if(id==='V8_AUTHORITY_SIGNOFF'){
    const canonical=(fdep.visual_reference_spec?.references||[]).some((x)=>x.authority_level==='CANONICAL_REFERENCE');
    if(!canonical && (value?.delegated_pass===true || evidence?.delegated_authority_signoff===true)) return {gate_id:id,state:'PASSED_DELEGATED',evidence_hash:value?.evidence_hash||null};
  }
  return {gate_id:id,state:'FAILED',reason:value?.reason||'EVIDENCE_MISSING_OR_FALSE'};
}

export function evaluateFrontendCertification({repoDir,fdep,evidence={}}={}){
  if(!fdep||fdep.applicable===false) return {applicable:false,state:'NOT_APPLICABLE',ok:true};
  const hard=evaluateProductExperienceHardGate(evidence.product_experience_hard||{});
  const qualitative=evaluateProductExperienceQualitativeGate(evidence.product_experience_qualitative||{});
  const visuals=VISUAL_GATES.map((id)=>visualGateResult(id,evidence.visual||{},fdep));
  const stateCoverage=evidence.surface_state_matrix_coverage===true;
  const accessibility=evidence.accessibility_passed===true;
  const performance=evidence.performance_passed===true;
  const security=evidence.security_passed===true;
  const domainTruth=evidence.domain_truth_passed===true;
  const normalizer=evidence.design_normalization?.status==='NORMALIZED';
  const lint=evidence.design_lint?.status==='PASSED';
  const parity=evidence.design_code_parity?.status==='ALIGNED' || evidence.design_code_parity?.waiver_approved===true;
  const vrde=evidence.render_vrde && areVisualEnvelopesComparable(fdep.visual_render_determinism_envelope,evidence.render_vrde);
  const failures=[];
  if(!hard.ok) failures.push(...hard.failures.map((x)=>`PX_HARD:${x}`));
  if(qualitative.state!=='PASSED') failures.push('PX_QUALITATIVE');
  for(const x of visuals) if(!String(x.state).startsWith('PASSED')) failures.push(x.gate_id);
  if(!stateCoverage) failures.push('SURFACE_STATE_MATRIX_COVERAGE');
  if(!accessibility) failures.push('ACCESSIBILITY'); if(!performance) failures.push('PERFORMANCE'); if(!security) failures.push('SECURITY'); if(!domainTruth) failures.push('DOMAIN_TRUTH');
  if(!normalizer) failures.push('DESIGN_NORMALIZATION'); if(!lint) failures.push('DESIGN_LINT'); if(!parity) failures.push('DESIGN_CODE_PARITY');
  if(!vrde?.comparable) failures.push(...(vrde?.reasons||['VRDE_COMPARABILITY']));
  const result={schema_version:1,artifact_type:'CertificationEvidence',artifact_id:`frontend-cert:${fdep.task_id}`,status:failures.length?'FAILED':'PASSED',ok:failures.length===0,task_id:fdep.task_id,fdep_hash:fdep.content_hash,hard_gate:hard,qualitative_gate:qualitative,visual_gates:visuals,state_matrix_coverage:stateCoverage,accessibility,performance,security,domain_truth:domainTruth,normalization:normalizer,design_lint:lint,parity,vrde_comparable:vrde?.comparable===true,failures,provenance:{fdep_hash:fdep.content_hash,evidence_hash:hashObject(evidence)}};
  result.content_hash=hashObject({...result,content_hash:null}); return result;
}


export function evaluateResponsiveIdentity({baseline={},variants=[]}={}){
  const baseComponents=uniq(baseline.component_ids),baseAnchors=uniq(baseline.brand_anchor_ids),baseProfile=baseline.product_design_profile_hash||null;
  const failures=[];
  for(const variant of variants||[]){
    const id=variant.viewport_id||variant.viewport||'unknown';
    if(baseProfile&&(variant.product_design_profile_hash||null)!==baseProfile) failures.push(`PROFILE_DRIFT:${id}`);
    const missingComponents=baseComponents.filter((x)=>!(variant.component_ids||[]).includes(x));
    const missingAnchors=baseAnchors.filter((x)=>!(variant.brand_anchor_ids||[]).includes(x));
    if(missingComponents.length) failures.push(`COMPONENT_IDENTITY_LOSS:${id}:${missingComponents.join(',')}`);
    if(missingAnchors.length) failures.push(`BRAND_ANCHOR_LOSS:${id}:${missingAnchors.join(',')}`);
    if(variant.horizontal_overflow_unapproved===true) failures.push(`UNAPPROVED_HORIZONTAL_OVERFLOW:${id}`);
  }
  const out={schema_version:1,artifact_type:'ResponsiveIdentityEvidence',artifact_id:`responsive:${hashObject({baseline,variants}).slice(0,24)}`,status:failures.length?'FAILED':'PASSED',failures,provenance:{baseline_hash:hashObject(baseline),variant_hashes:(variants||[]).map(hashObject)}};
  out.content_hash=hashObject({...out,content_hash:null});return out;
}

export { VISUAL_GATES };
