import { hashObject, loadRegistry } from './knowledge-graph-core.mjs';

function resolveAlias(value,map,stack=[]){
  if(typeof value!=='string') return value;
  const m=value.match(/^\{([^}]+)\}$/); if(!m) return value;
  const id=m[1]; if(stack.includes(id)) throw new Error(`token alias cycle: ${[...stack,id].join(' -> ')}`);
  const row=map.get(id); if(!row) throw new Error(`unknown token alias: ${id}`);
  return resolveAlias(row.value??row.alias,map,[...stack,id]);
}
function nameCss(id){return `--${id.replace(/[^a-zA-Z0-9_-]/g,'-')}`;}
function nameCompose(id){return id.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((x,i)=>i?x[0].toUpperCase()+x.slice(1):x).join('');}
export function compileFrontendTokens({repoDir,target='CSS'}={}){
  const r=loadRegistry(repoDir,'agent-system/registries/FRONTEND_TOKEN_REGISTRY.json',{tokens:[]});const map=new Map((r.tokens||[]).map((x)=>[x.token_id,x]));
  const resolved=(r.tokens||[]).map((x)=>({...x,resolved_value:resolveAlias(x.value??x.alias,map,[x.token_id])})).sort((a,b)=>a.token_id.localeCompare(b.token_id));
  let output;
  if(target==='CSS') output=`:root {\n${resolved.map((x)=>`  ${nameCss(x.token_id)}: ${x.resolved_value};`).join('\n')}\n}\n`;
  else if(target==='JETPACK_COMPOSE') output=resolved.map((x)=>`// ${x.type}\nval ${nameCompose(x.token_id)} = ${JSON.stringify(String(x.resolved_value))}`).join('\n');
  else if(target==='JSON') output=JSON.stringify(Object.fromEntries(resolved.map((x)=>[x.token_id,x.resolved_value])),null,2)+'\n';
  else throw new Error(`unsupported token target: ${target}`);
  return {schema_version:1,artifact_type:'TokenProjection',target,registry_version:r.registry_version,tokens:resolved,output,content_hash:hashObject({target,registry_version:r.registry_version,resolved})};
}
