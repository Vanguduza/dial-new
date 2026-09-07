import path from 'node:path';
import fs from 'node:fs';
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

function uniq(xs){ return [...new Set(xs.filter(Boolean))]; }
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

export function resolveEngineeringResources({ repoDir=DEFAULT_REPO, root, instruction='', affectedPaths=[], featureRecord=null, maxResources=8, availableTools=[] }={}) {
  const resources = loadAllEngineeringResources(repoDir);
  const sources = new Map(loadEngineeringResourceSources(repoDir).map((s)=>[s.source_id,s]));
  const taskClasses = classifyEngineeringResourcesTask({ instruction, affectedPaths, featureRecord });
  const text = [instruction, ...(affectedPaths || []), featureRecord ? JSON.stringify(featureRecord) : ''].join('\n');
  const candidates=[]; const rejected=[];
  for (const resource of resources) {
    const source=sources.get(resource.source_id) || {trust_tier:'T1_OFFICIAL'};
    const task=matchAny(resource.task_classes, taskClasses);
    const lexical=keywordMatch(resource,text) || techMatch(resource,text);
    const projectRule=resource.authority==='PROJECT_LOCAL_ENGINEERING_POLICY';
    if (!task && !lexical && !projectRule) continue;
    if (!stateAllowed(resource)) { rejected.push({resource_id:resource.resource_id,reason:`NOT_ACTIVATABLE:${resource.status}`}); continue; }
    const required=resource.requires_tools || [];
    if (required.some((t)=>!availableTools.includes(t))) { rejected.push({resource_id:resource.resource_id,reason:'REQUIRED_TOOL_UNAVAILABLE'}); continue; }
    const community=resource.authority==='COMMUNITY_SIGNAL_ONLY';
    if (community && !lexical) continue;
    const cache=latestCacheFor(resource.resource_id, root);
    const score = (projectRule?.2:0) + (task?.45:0) + (lexical?.2:0) + trustWeight(source)*.15 + (cache?.fresh===true?.08:0) - (community?.08:0);
    candidates.push({resource,source,cache,score});
  }
  candidates.sort((a,b)=>b.score-a.score || a.resource.resource_id.localeCompare(b.resource.resource_id));
  const selected=candidates.slice(0,Math.max(0,Math.min(12,maxResources))).map(({resource,source,cache,score})=>({
    resource_id:resource.resource_id,name:resource.name,resource_class:resource.resource_class,source_id:resource.source_id,
    trust_tier:source.trust_tier,authority:resource.authority,activation_mode:resource.activation_mode,locator:resource.locator,
    task_classes:resource.task_classes || [],technologies:resource.technologies || [],forbidden_effects:resource.forbidden_effects || [],
    cache_ref:cache?.cache_ref || null,content_hash:cache?.content_hash || resource.content_hash || null,fetched_at:cache?.fetched_at || null,
    freshness:cache?.fresh===true?'FRESH':(cache?'STALE':'NOT_CACHED'),
    corroboration_required:resource.authority==='COMMUNITY_SIGNAL_ONLY',selection_score:Number(score.toFixed(4)),
  }));
  return {policy_version:'vekl-2.0',task_classes:taskClasses,selected_resources:selected,rejected,authority:'NON_AUTHORITATIVE_ENGINEERING_KNOWLEDGE_EXCEPT_PROJECT_LOCAL_POLICY'};
}
