import crypto from 'node:crypto';
import { classifyEngineeringTask } from './skill-resolver.mjs';
import { DEFAULT_REPO } from './skill-registry.mjs';
import { EXECUTABLE_RESOURCE_CLASSES, EXECUTABLE_RESOURCE_STATES, PASSIVE_RESOURCE_STATES, loadAllEngineeringResources, loadEngineeringResourceSources } from './engineering-resource-registry.mjs';
import { readJson } from './state-store.mjs';

const EXTRA = [
 ['WEB_UI_IMPLEMENTATION', /\b(next\.?js|react|frontend|web ui|app router|server component|tailwind|shadcn)\b/i],
 ['WEB_ROUTING', /\b(route handler|app router|middleware|web route|next navigation)\b/i],
 ['WEB_SECURITY', /\b(csp|csrf|xss|web security|security header|cookie security)\b/i],
 ['TYPESCRIPT_IMPLEMENTATION', /\btypescript|tsconfig|nodenext|\.tsx?\b/i],
 ['DATABASE', /\b(database|supabase|postgres|postgresql|sql|migration|schema)\b/i],
 ['POSTGRES', /\bpostgres|postgresql|pgvector\b/i],
 ['AUTH', /\b(auth|authentication|supabase auth|session|jwt)\b/i],
 ['RLS_SECURITY', /\b(row level security|\brls\b|tenant isolation)\b/i],
 ['E2E_TESTING', /\b(playwright|e2e|end[- ]to[- ]end|browser test)\b/i],
 ['UNIT_TESTING', /\b(vitest|unit test|test suite|mocking)\b/i],
 ['SCHEMA_VALIDATION', /\bzod|schema validation|typed schema\b/i],
 ['SEARCH', /\bmeilisearch|search index|hybrid search|full[- ]text search\b/i],
 ['OBSERVABILITY', /\bopentelemetry|observability|trace|tracing|metric|span\b/i],
 ['PRODUCT_ANALYTICS', /\bposthog|product analytics|funnel|retention|activation metric|session replay|heatmap\b/i],
 ['FEATURE_ROLLOUT', /\bfeature flag|rollout|dogfood|canary release|progressive delivery\b/i],
 ['EXPERIMENTATION', /\b(a\/b|multivariate|experiment|variant assignment)\b/i],
 ['AI_GATEWAY', /\blitellm|ai gateway|model routing\b/i],
 ['AI_EVALUATION', /\bpromptfoo|ai eval|rag eval|red team\b/i],
 ['CUSTOMER_SUPPORT', /\bchatwoot|support inbox|customer support\b/i],
 ['WHATSAPP', /\bwhatsapp|cloud api|whatsapp flow\b/i],
 ['OBJECT_STORAGE', /\bcloudflare r2|\br2\b|object storage|presigned\b/i],
 ['ORACLE_CLOUD', /\boracle cloud|\boci\b|oracle instance\b/i],
 ['GEOCODING', /\bnominatim|geocod|reverse geocod\b/i],
 ['ROUTING', /\bosrm|routing engine\b/i],
 ['ROUTE_OPTIMIZATION', /\bvroom|vehicle routing|route optimization|vrp\b/i],
 ['MAP_RENDERING', /\bmaplibre|map rendering|vector tile\b/i],
 ['DEPENDENCY_SECURITY', /\bdependency.*vulnerab|cve|security advisory|sca|sbom\b/i],
 ['DEPENDENCY_RESEARCH', /\bdependency|library version|package version|upgrade\b/i],
 ['EXTERNAL_RESEARCH', /\bresearch|documentation|current api|latest api\b/i],
];

const ROLE_BY_CLASS = Object.freeze({
  OFFICIAL_DOC: 'AUTHORITY',
  RELEASE_NOTES: 'AUTHORITY',
  SECURITY_ADVISORY: 'AUTHORITY',
  SKILL: 'GUIDANCE',
  PLUGIN: 'EXECUTOR',
  TOOL: 'EXECUTOR',
  MCP_SERVER: 'EXECUTOR',
  RULESET: 'POLICY',
  HOOK: 'POLICY',
  WORKFLOW_LOOP: 'POLICY',
  REPOSITORY: 'REFERENCE',
  PACKAGE_REGISTRY: 'REFERENCE',
  EXAMPLE_REFERENCE: 'REFERENCE',
  ISSUE_DISCUSSION: 'DIAGNOSTIC',
  FORUM_QA: 'DIAGNOSTIC',
});
export const ENGINEERING_RESOURCE_ROLES = new Set(['AUTHORITY','GUIDANCE','EXECUTOR','VERIFIER','POLICY','REUSE','DIAGNOSTIC','REFERENCE']);

function uniq(xs){ return [...new Set(xs.filter(Boolean))]; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])]));
  return value;
}
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizePurpose(value){ return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,96) || 'GENERAL'; }

export function classifyEngineeringResourcesTask({ instruction='', affectedPaths=[], featureRecord=null }={}) {
  const base = classifyEngineeringTask({ instruction, affectedPaths, featureRecord });
  const text = [instruction, ...(affectedPaths || []), featureRecord ? JSON.stringify(featureRecord) : ''].join('\n');
  const extra = EXTRA.filter(([,re]) => re.test(text)).map(([id]) => id);
  return uniq([...base.filter((x)=>x!=='GENERAL_DEVELOPMENT'), ...extra, ...(base.includes('GENERAL_DEVELOPMENT') && !extra.length ? ['GENERAL_DEVELOPMENT'] : [])]);
}

function matchAny(values, classes){ return (values || []).includes('*') || (values || []).some((v)=>classes.includes(v)); }
function keywordMatch(resource, text){ return (resource.keywords || []).some((k)=>text.toLowerCase().includes(String(k).toLowerCase())); }
function techMatch(resource, text){ return (resource.technologies || []).some((k)=>text.toLowerCase().includes(String(k).toLowerCase())); }
function trustWeight(source){ return ({T0_DIAL_PROJECT:1,T1_OFFICIAL:.95,T2_MAINTAINER_COMMUNITY:.75,T3_COMMUNITY_CORROBORATION:.45,T4_COMMUNITY_SIGNAL:.2})[source?.trust_tier] ?? .1; }
function stateAllowed(resource){
  if (resource.activation_mode === 'EXECUTABLE_CAPABILITY' || EXECUTABLE_RESOURCE_CLASSES.has(resource.resource_class) && !['REFERENCE_ONLY','CORROBORATION_ONLY','DISCOVERY_ONLY','PROCESS_RULE','READ_ONLY_TOOL'].includes(resource.activation_mode)) return EXECUTABLE_RESOURCE_STATES.has(resource.status);
  return PASSIVE_RESOURCE_STATES.has(resource.status);
}
function latestCacheFor(resourceId, root){
  const index = readJson('knowledge/research/cache-index.json', { resources:{} }, root);
  return index?.resources?.[resourceId] || null;
}
function selectionRole(resource,hint={}){
  const role=hint.selection_role || resource.selection_role || ROLE_BY_CLASS[resource.resource_class] || 'REFERENCE';
  return ENGINEERING_RESOURCE_ROLES.has(role) ? role : 'REFERENCE';
}
function selectionPurpose(resource, taskClasses, hint={}){
  if (hint.selection_purpose) return normalizePurpose(hint.selection_purpose);
  if (resource.selection_purpose) return normalizePurpose(resource.selection_purpose);
  if ((resource.technologies || []).length) return normalizePurpose(resource.technologies[0]);
  const exact=(resource.task_classes || []).filter((x)=>x!=='*' && taskClasses.includes(x)).sort()[0];
  if (exact) return normalizePurpose(exact);
  return normalizePurpose(`${resource.resource_class}_${resource.resource_id}`);
}
export function engineeringResourceRegistryFingerprint(resource, source){
  return sha256(JSON.stringify(canonical({
    resource_id:resource.resource_id,source_id:resource.source_id,resource_class:resource.resource_class,
    status:resource.status,activation_mode:resource.activation_mode,locator:resource.locator,
    task_classes:resource.task_classes || [],technologies:resource.technologies || [],keywords:resource.keywords || [],
    content_hash:resource.content_hash || null,forbidden_effects:resource.forbidden_effects || [],requires_tools:resource.requires_tools || [],
    selection_role:resource.selection_role || null,selection_purpose:resource.selection_purpose || null,always_bind:resource.always_bind === true,
    resource_lineage:resource.resource_lineage || null,workflow_pattern:resource.workflow_pattern || null,
    source_trust:source?.trust_tier || null,source_kind:source?.source_kind || null,
  })));
}
export function evaluateEngineeringResourceHardEligibility({resource,source,taskClasses,text,availableTools=[],featureRecord=null}) {
  if (!source) return {eligible:false,reason:'SOURCE_NOT_ADMITTED'};
  if (!(source.resource_classes || []).includes(resource.resource_class)) return {eligible:false,reason:'SOURCE_CLASS_NOT_ADMITTED'};
  if (!stateAllowed(resource)) return {eligible:false,reason:`NOT_ACTIVATABLE:${resource.status}`};
  const executable = resource.activation_mode === 'EXECUTABLE_CAPABILITY';
  if (executable && source.executable_content_allowed !== true) return {eligible:false,reason:'EXECUTION_NOT_ADMITTED_BY_SOURCE'};
  const required=resource.requires_tools || [];
  if (required.some((tool)=>!availableTools.includes(tool))) return {eligible:false,reason:'REQUIRED_TOOL_UNAVAILABLE'};
  const community=resource.authority==='COMMUNITY_SIGNAL_ONLY';
  const zie619=resource.derived_from_corpus==='community.zie619.n8n_workflows' || resource.resource_id==='community.zie619.n8n_workflows.corpus';
  const healthSpecialist=String(featureRecord?.module||'').toUpperCase()==='HEALTH' || String(featureRecord?.feature_id||'').startsWith('HEALTH-') || (!featureRecord && taskClasses.includes('HEALTH_SENSITIVE'));
  if (zie619 && healthSpecialist) return {eligible:false,reason:'HEALTH_SENSITIVE_COMMUNITY_CORPUS_BLOCKED'};
  const lexical=keywordMatch(resource,text) || techMatch(resource,text);
  if (community && !lexical) return {eligible:false,reason:'COMMUNITY_NOT_TASK_SPECIFIC'};
  const task=matchAny(resource.task_classes, taskClasses);
  const alwaysBind=resource.always_bind === true;
  if (!task && !lexical && !alwaysBind) return {eligible:false,reason:'NOT_RELEVANT'};
  return {eligible:true,task,lexical,community,alwaysBind};
}


export function deterministicMinimalCoalition(candidates,maxResources=8) {
  const ordered=[...(candidates || [])].sort((a,b)=>a.resource.resource_id.localeCompare(b.resource.resource_id));
  const mandatory=ordered.filter((row)=>row.mandatory);
  const slots=new Map();
  for (const row of ordered.filter((candidate)=>!candidate.mandatory)) {
    const key=`${row.purpose}\u0000${row.role}`;
    const previous=slots.get(key);
    if (!previous || row.score>previous.score || (row.score===previous.score && row.resource.resource_id.localeCompare(previous.resource.resource_id)<0)) slots.set(key,row);
  }
  const optional=[...slots.values()].sort((a,b)=>b.score-a.score || a.purpose.localeCompare(b.purpose) || a.role.localeCompare(b.role) || a.resource.resource_id.localeCompare(b.resource.resource_id));
  const cap=Math.max(0,Math.min(24,Number.isFinite(Number(maxResources))?Number(maxResources):8));
  const mandatorySorted=[...mandatory].sort((a,b)=>a.resource.resource_id.localeCompare(b.resource.resource_id));
  const room=Math.max(0,cap-mandatorySorted.length);
  const selected=[...mandatorySorted,...optional.slice(0,room)];
  const rejected=[];
  if (mandatorySorted.length>cap) rejected.push({resource_id:'<budget>',reason:`MANDATORY_RESOURCE_BUDGET_EXCEEDED:${mandatorySorted.length}>${cap}`});
  for (const loser of optional.slice(room)) rejected.push({resource_id:loser.resource.resource_id,reason:'CONTEXT_BUDGET_PRUNED'});
  // Peers that lost their (purpose, role) slot are deliberately recorded too.
  const selectedIds=new Set(selected.map((row)=>row.resource.resource_id));
  const slotWinnerIds=new Set(optional.map((row)=>row.resource.resource_id));
  for (const row of ordered) {
    if (!row.mandatory && !slotWinnerIds.has(row.resource.resource_id)) rejected.push({resource_id:row.resource.resource_id,reason:`REDUNDANT_PEER_PRUNED:${row.purpose}:${row.role}`});
  }
  return {selected,rejected,selected_resource_ids:[...selectedIds].sort()};
}

/**
 * Deterministic VEKL resolution law:
 * 1) hard eligibility is a correctness boundary;
 * 2) Skills are owned by the dedicated exact-pin Skill resolver, never selected twice here;
 * 3) optional peers compete only inside the same (purpose, role) slot;
 * 4) complementary roles/purposes survive together until the explicit context budget applies;
 * 5) input order never changes the selected identities.
 */
export function resolveEngineeringResources({ repoDir=DEFAULT_REPO, root, instruction='', affectedPaths=[], featureRecord=null, maxResources=8, availableTools=[], eligibleResourceIds=null, resourceBindingHints={} }={}) {
  const resources = loadAllEngineeringResources(repoDir);
  const sources = new Map(loadEngineeringResourceSources(repoDir).map((s)=>[s.source_id,s]));
  const taskClasses = classifyEngineeringResourcesTask({ instruction, affectedPaths, featureRecord });
  const text = [instruction, ...(affectedPaths || []), featureRecord ? JSON.stringify(featureRecord) : ''].join('\n');
  const candidates=[]; const rejected=[]; const eligibleSet=Array.isArray(eligibleResourceIds)?new Set(eligibleResourceIds):null;
  for (const resource of resources) {
    // Skills have one owner: resolveEngineeringSkills(). Keeping them out of this
    // generic resource pass prevents duplicate activation and split provenance.
    if (resource.resource_class === 'SKILL') continue;
    if (eligibleSet && !eligibleSet.has(resource.resource_id)) { rejected.push({resource_id:resource.resource_id,reason:'OUTSIDE_GRAPH_NEIGHBOURHOOD'}); continue; }
    const source=sources.get(resource.source_id);
    const eligibility=evaluateEngineeringResourceHardEligibility({resource,source,taskClasses,text,availableTools,featureRecord});
    if (!eligibility.eligible) {
      if (eligibility.reason !== 'NOT_RELEVANT' && eligibility.reason !== 'COMMUNITY_NOT_TASK_SPECIFIC') rejected.push({resource_id:resource.resource_id,reason:eligibility.reason});
      continue;
    }
    const cache=latestCacheFor(resource.resource_id, root);
    const hint=resourceBindingHints?.[resource.resource_id] || {};
    const role=selectionRole(resource,hint);
    const purpose=selectionPurpose(resource,taskClasses,hint);
    const score = (eligibility.alwaysBind?.25:0) + (eligibility.task?.45:0) + (eligibility.lexical?.2:0) + trustWeight(source)*.15 + (cache?.fresh===true?.08:0) - (eligibility.community?.08:0);
    const mandatory=eligibility.alwaysBind;
    candidates.push({resource,source,cache,role,purpose,mandatory,score,eligibility});
  }

  const coalitionResult=deterministicMinimalCoalition(candidates,maxResources);
  rejected.push(...coalitionResult.rejected);
  const selected=coalitionResult.selected.map(({resource,source,cache,role,purpose,mandatory,score,eligibility})=>({
    resource_id:resource.resource_id,name:resource.name,resource_class:resource.resource_class,source_id:resource.source_id,
    trust_tier:source.trust_tier,authority:resource.authority,activation_mode:resource.activation_mode,locator:resource.locator,
    task_classes:resource.task_classes || [],technologies:resource.technologies || [],forbidden_effects:resource.forbidden_effects || [],
    cache_ref:cache?.cache_ref || null,content_hash:cache?.content_hash || resource.content_hash || null,fetched_at:cache?.fetched_at || null,
    freshness:cache?.fresh===true?'FRESH':(cache?'STALE':'NOT_CACHED'),
    corroboration_required:resource.authority==='COMMUNITY_SIGNAL_ONLY',selection_score:Number(score.toFixed(4)),
    selection_role:role,selection_purpose:purpose,mandatory,
    selection_reason: mandatory ? 'MANDATORY_EXPLICIT_POLICY_BINDING' : `WINNER:${purpose}:${role}`,
    context_delivery: (resourceBindingHints?.[resource.resource_id]?.context_delivery) || (role==='AUTHORITY' && eligibility.lexical ? 'EAGER_EXCERPT' : 'DESCRIPTOR_ONLY'),
    registry_fingerprint:engineeringResourceRegistryFingerprint(resource,source),
    resource_lineage:resource.resource_lineage || null,workflow_pattern:resource.workflow_pattern || null,
    untrusted_external_reference:resource.derived_from_corpus==='community.zie619.n8n_workflows',
  }));
  return {
    policy_version:'vekl-2.1',resolver_version:'purpose-role-minimal-coalition-v1',task_classes:taskClasses,
    selected_resources:selected,rejected,ranked_candidates:candidates.map((c)=>({resource_id:c.resource.resource_id,score:Number(c.score.toFixed(4)),selection_role:c.role,selection_purpose:c.purpose,mandatory:c.mandatory})).sort((a,b)=>b.score-a.score||a.resource_id.localeCompare(b.resource_id)),
    authority:'NON_AUTHORITATIVE_ENGINEERING_KNOWLEDGE_EXCEPT_PROJECT_LOCAL_POLICY',
    invariants:{hard_eligibility_before_ranking:true,graph_neighbourhood_before_ranking:Boolean(eligibleSet),skill_single_selection_owner:true,selection_role_and_purpose_are_contextual:true,competition_key:['selection_purpose','selection_role'],input_order_independent:true,context_size_is_not_quality_score:true},
  };
}
