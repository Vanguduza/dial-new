import { hashObject } from './knowledge-graph-core.mjs';

export const TASK_ARCHETYPES=Object.freeze(['ROUTINE_CODE_CHANGE','BUG_LOCALIZATION','ARCHITECTURE_CHANGE','MONEY_PATH_CHANGE','AUTHORIZATION_CHANGE','DONOR_ASSIMILATION','DONOR_ADAPTATION','LOCKED_DESIGN_ENHANCEMENT','VISUAL_REGRESSION','NEW_FRONTEND_DESIGN','DATABASE_MIGRATION','SECURITY_REVIEW','INFRASTRUCTURE_CHANGE','DEPENDENCY_UPGRADE','TEST_REPAIR','EVIDENCE_RECONCILIATION','RESEARCH','DOCUMENTATION','AMBIGUOUS']);
const RISK={LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};
const HIGH_RISK=/\b(payment|ledger|settlement|refund|authorization|authorisation|identity|rls|row[- ]level|production|terraform|migration|clinical|health|secret|credential)\b/i;
const ARCH=/\b(architecture|source of truth|authority boundary|orchestrat|manager runtime|project truth)\b/i;
const MONEY=/\b(payment|ledger|settlement|refund|payable|money|checkout)\b/i;
const AUTH=/\b(auth|authorization|authorisation|identity|rls|permission|role)\b/i;
const INFRA=/\b(terraform|kubernetes|production infrastructure|cloudflare|oracle host|deployment topology)\b/i;
const MIG=/\b(database migration|schema migration|alter table|backfill|data migration)\b/i;
const DONOR=/\b(donor|fixitnow|assimil|port[- ]wholesale)\b/i;
const UI=/\b(frontend|screen|ui|ux|visual|layout|design)\b/i;
export function riskMax(a,b){return RISK[a]>=RISK[b]?a:b;}
export function classifyTask({unitMap={},instruction='',affectedPaths=[],featureRecord={},contractRecord={},designMode=null}={}){
 const text=[instruction,(affectedPaths||[]).join(' '),featureRecord?.module,featureRecord?.outcome,contractRecord?.security_profile,(contractRecord?.surfaces||[]).join(' ')].filter(Boolean).join(' ');
 const fired=[];let archetype='ROUTINE_CODE_CHANGE',risk='LOW';
 if(ARCH.test(text)){archetype='ARCHITECTURE_CHANGE';risk='CRITICAL';fired.push('ARCHITECTURE_AUTHORITY_BOUNDARY');}
 else if(MONEY.test(text)){archetype='MONEY_PATH_CHANGE';risk='HIGH';fired.push('MONEY_PATH');}
 else if(AUTH.test(text)){archetype='AUTHORIZATION_CHANGE';risk='HIGH';fired.push('AUTHORIZATION_PATH');}
 else if(INFRA.test(text)){archetype='INFRASTRUCTURE_CHANGE';risk='HIGH';fired.push('INFRASTRUCTURE_PATH');}
 else if(MIG.test(text)){archetype='DATABASE_MIGRATION';risk='HIGH';fired.push('MIGRATION_PATH');}
 else if(designMode==='LOCKED_ENHANCE'){archetype='LOCKED_DESIGN_ENHANCEMENT';risk='MEDIUM';fired.push('LOCKED_DESIGN');}
 else if(DONOR.test(text)||designMode==='DONOR_ADAPT'){archetype='DONOR_ADAPTATION';risk='MEDIUM';fired.push('DONOR_ADAPTATION');}
 else if(UI.test(text)&&(unitMap?.product_experience_map?.applicable||unitMap?.product_experience_map?.state==='RESOLVED_FOR_KNOWLEDGE')){archetype='NEW_FRONTEND_DESIGN';risk='MEDIUM';fired.push('PRODUCT_EXPERIENCE');}
 else if(/\b(test|spec|vitest|playwright)\b/i.test(text)){archetype='TEST_REPAIR';risk='LOW';fired.push('TEST_PATH');}
 else if(/\b(document|docs|readme|markdown)\b/i.test(text)){archetype='DOCUMENTATION';risk='LOW';fired.push('DOCUMENTATION_ONLY');}
 if(HIGH_RISK.test(text)){risk=riskMax(risk,'HIGH');fired.push('HIGH_RISK_FLOOR');}
 if(/\b(clinical|health claim|production money|project truth|manager runtime)\b/i.test(text)){risk='CRITICAL';fired.push('CRITICAL_RISK_FLOOR');}
 const mandatoryIndependentReview=['HIGH','CRITICAL'].includes(risk)||['DONOR_ADAPTATION','NEW_FRONTEND_DESIGN','LOCKED_DESIGN_ENHANCEMENT'].includes(archetype);
 const mandatoryCompetitiveReview=risk==='CRITICAL'&&archetype==='ARCHITECTURE_CHANGE';
 const requiredCapabilities=[archetype.includes('DESIGN')||archetype==='DONOR_ADAPTATION'?'coding':'coding'];
 if(['NEW_FRONTEND_DESIGN','LOCKED_DESIGN_ENHANCEMENT','DONOR_ADAPTATION','VISUAL_REGRESSION'].includes(archetype)) requiredCapabilities.push('visualReasoning');
 const result={schema_version:1,archetype,risk_class:risk,required_capabilities:[...new Set(requiredCapabilities)].sort(),prohibited_capabilities:[],mandatory_gates:['VEKL_CURRENT','DETERMINISTIC_VERIFICATION',...(unitMap?.product_experience_map?.applicable?['PRODUCT_EXPERIENCE']:[])],mandatory_review_classes:mandatoryIndependentReview?['INDEPENDENT_REVIEW']:[],mandatory_independent_review:mandatoryIndependentReview,mandatory_competitive_review:mandatoryCompetitiveReview,parallelizable_dimensions:[],deterministic_rules_fired:[...new Set(fired)].sort(),policy_version:'dial-aef-triage-1',input_hash:hashObject({text,designMode,unit:unitMap?.unit_revision_hash||null})};
 return {...result,triage_result_hash:hashObject(result)};
}
