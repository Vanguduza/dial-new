function splitShell(command){
 const s=String(command||''); let q=null,escaped=false,segment='',parts=[];
 for(let i=0;i<s.length;i++){
  const c=s[i];if(escaped){segment+=c;escaped=false;continue;}if(c==='\\'){segment+=c;escaped=true;continue;}
  if(q){segment+=c;if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;segment+=c;continue;}
  if(c===';'||c==='\n'||c==='|'||(c==='&'&&s[i+1]==='&')||(c==='|'&&s[i+1]==='|')){parts.push(segment.trim());segment='';if((c==='&'||c==='|')&&s[i+1]===c)i++;continue;}segment+=c;
 }if(segment.trim())parts.push(segment.trim());return parts.filter(Boolean);
}
const SIMPLE_READ=/^(?:pwd|ls(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|wc(?:\s|$)|jq(?:\s|$)|sed\s+-n(?:\s|$))/i;
const NETWORK_SHELL=/^(?:curl|wget|ssh|scp|sftp|ftp|nc|ncat|telnet)\b|^rsync\b.*(?:\w+@)?[A-Za-z0-9.-]+:|^git\s+(?:clone|fetch|pull|push|ls-remote)\b|^(?:npm|pnpm|yarn|pip3?|cargo)\s+(?:install|add|publish|update)\b/i;
const NETWORK_TOOL=/(?:browser|web|http|fetch|url|request|network|search)/i;
function gitRead(seg){const m=seg.match(/^git\s+([a-z-]+)(?:\s+(.*))?$/i);if(!m)return false;const op=m[1].toLowerCase(),rest=(m[2]||'').trim();if(['status','diff','log','show','rev-parse','merge-base'].includes(op))return true;if(op==='branch')return !rest||/^(?:--list|-l|--show-current|-a|--all|-r|--remotes)(?:\s|$)/.test(rest);return false;}
function canonicalHost(value){let v=String(value||'').trim().toLowerCase();if(!v)return null;try{if(/^[a-z][a-z0-9+.-]*:\/\//i.test(v))v=new URL(v).hostname.toLowerCase();}catch{return null;}v=v.replace(/^\[|\]$/g,'').replace(/:\d+$/,'').replace(/\.$/,'');return v||null;}
function extractNetworkHosts(text){const value=String(text||''),out=new Set();for(const m of value.matchAll(/\bhttps?:\/\/[^\s'"<>]+/ig)){try{out.add(new URL(m[0]).hostname.toLowerCase());}catch{}}
 for(const m of value.matchAll(/\b(?:ssh|scp|sftp)\s+(?:-[A-Za-z]\s+\S+\s+|-[A-Za-z]+\s+)*(?:[^\s@]+@)?([A-Za-z0-9.-]+)(?::\d+)?\b/ig)){const h=canonicalHost(m[1]);if(h)out.add(h);}
 for(const m of value.matchAll(/\b(?:git@|[^\s@]+@)([A-Za-z0-9.-]+):[^\s]+/g)){const h=canonicalHost(m[1]);if(h)out.add(h);}
 return [...out].sort();}
function hostAllowed(host,allowlist){const h=canonicalHost(host);if(!h)return false;return allowlist.some((raw)=>{let a=String(raw||'').trim().toLowerCase();if(!a)return false;if(a==='*')return true;if(a.startsWith('*.'))return h.endsWith(a.slice(1))&&h!==a.slice(2);const parsed=canonicalHost(a);return parsed===h;});}
export function classifyShellEffect(command){
 const s=String(command||'').trim();if(!s)return{effect:'READ_ONLY',reason:'EMPTY'};
 if(/[<>]|`|\$\(|\|/.test(s))return{effect:'MATERIAL',reason:'SHELL_COMPOSITION_OR_REDIRECTION'};
 const parts=splitShell(s);if(parts.length!==1)return{effect:'MATERIAL',reason:'MULTI_COMMAND'};
 const seg=parts[0];
 if(/^node\s+(?:"[^"]*adaptive-execution-delegate\.mjs"|'[^']*adaptive-execution-delegate\.mjs'|\S*adaptive-execution-delegate\.mjs)(?:\s|$)/i.test(seg))return{effect:'GOVERNED_DELEGATION',reason:'FFDRM_ENVELOPED_WORKER_DELEGATION'};if(/engineering-knowledge-resolve\.mjs\b.*--packet-id/i.test(seg)&&!/[;&|<>`]|\$\(/.test(seg))return{effect:'EXPLICIT_RERESOLUTION',reason:'VEKL_RERESOLUTION'};
 if(/^find\b/i.test(seg)){if(/(?:\s-(?:delete|exec|execdir|ok|okdir)\b)/i.test(seg))return{effect:'MATERIAL',reason:'FIND_MUTATOR'};return{effect:'READ_ONLY',reason:'FIND_INSPECTION'};}
 if(SIMPLE_READ.test(seg)||gitRead(seg))return{effect:'READ_ONLY',reason:'ALLOWLISTED_INSPECTION'};
 return{effect:'MATERIAL',reason:'NOT_PROVEN_READ_ONLY'};
}
export function networkAccessIntent(toolName,toolInput={}){const tool=String(toolName||''),source=(tool==='Bash'||tool==='PowerShell')?String(toolInput.command||''):JSON.stringify(toolInput||{});const shellIntent=(tool==='Bash'||tool==='PowerShell')&&(NETWORK_SHELL.test(source)||/\bhttps?:\/\//i.test(source));const toolIntent=tool!=='Bash'&&tool!=='PowerShell'&&NETWORK_TOOL.test(tool);const network=shellIntent||toolIntent;return{network,targets:network?extractNetworkHosts(source):[],reason:shellIntent?'NETWORK_SHELL':toolIntent?'NETWORK_TOOL':'NONE'};}
export function networkPolicyDecision({toolName,toolInput={},allowlist=[]}={}){const intent=networkAccessIntent(toolName,toolInput);if(!intent.network)return{ok:true,reason:'NO_NETWORK_INTENT',targets:[],denied:[]};const allowed=(allowlist||[]).map(String).filter(Boolean);if(!allowed.length)return{ok:false,reason:'NETWORK_ACCESS_NOT_GRANTED',targets:intent.targets,denied:intent.targets.length?intent.targets:['<unresolved>']};if(!intent.targets.length)return{ok:false,reason:'NETWORK_TARGET_UNRESOLVED',targets:[],denied:['<unresolved>']};const denied=intent.targets.filter((host)=>!hostAllowed(host,allowed));return{ok:denied.length===0,reason:denied.length?'NETWORK_TARGET_NOT_ALLOWED':'NETWORK_TARGET_ALLOWED',targets:intent.targets,denied};}
export function isConsequentialToolUse(toolName,toolInput={}){if(toolName==='Edit'||toolName==='Write')return true;if(networkAccessIntent(toolName,toolInput).network)return true;if(toolName!=='Bash'&&toolName!=='PowerShell')return false;const effect=classifyShellEffect(toolInput.command).effect;return effect==='MATERIAL'||effect==='GOVERNED_DELEGATION';}
export function governedPacketDecision({governed=false,consequential=false,packetId=null}={}){
 if(governed&&consequential&&!packetId)return{decision:'deny',reason:'DIAL VEKL 2.2 guard: governed material tool use requires DIAL_PACKET_ID and a persisted activation.'};
 return{decision:null,reason:''};
}
