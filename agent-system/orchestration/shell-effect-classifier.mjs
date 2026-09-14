function splitShell(command){
 const s=String(command||''); let q=null,escaped=false,segment='',parts=[];
 for(let i=0;i<s.length;i++){
  const c=s[i];if(escaped){segment+=c;escaped=false;continue;}if(c==='\\'){segment+=c;escaped=true;continue;}
  if(q){segment+=c;if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;segment+=c;continue;}
  if(c===';'||c==='\n'||c==='|'||(c==='&'&&s[i+1]==='&')||(c==='|'&&s[i+1]==='|')){parts.push(segment.trim());segment='';if((c==='&'||c==='|')&&s[i+1]===c)i++;continue;}segment+=c;
 }if(segment.trim())parts.push(segment.trim());return parts.filter(Boolean);
}
const SIMPLE_READ=/^(?:pwd|ls(?:\s|$)|rg(?:\s|$)|grep(?:\s|$)|cat(?:\s|$)|head(?:\s|$)|tail(?:\s|$)|wc(?:\s|$)|jq(?:\s|$)|sed\s+-n(?:\s|$))/i;
function gitRead(seg){const m=seg.match(/^git\s+([a-z-]+)(?:\s+(.*))?$/i);if(!m)return false;const op=m[1].toLowerCase(),rest=(m[2]||'').trim();if(['status','diff','log','show','rev-parse','merge-base'].includes(op))return true;if(op==='branch')return !rest||/^(?:--list|-l|--show-current|-a|--all|-r|--remotes)(?:\s|$)/.test(rest);return false;}
export function classifyShellEffect(command){
 const s=String(command||'').trim();if(!s)return{effect:'READ_ONLY',reason:'EMPTY'};
 if(/[<>]|`|\$\(|\|/.test(s))return{effect:'MATERIAL',reason:'SHELL_COMPOSITION_OR_REDIRECTION'};
 const parts=splitShell(s);if(parts.length!==1)return{effect:'MATERIAL',reason:'MULTI_COMMAND'};
 const seg=parts[0];if(/engineering-knowledge-resolve\.mjs\b.*--packet-id/i.test(seg)&&!/[;&|<>`]|\$\(/.test(seg))return{effect:'EXPLICIT_RERESOLUTION',reason:'VEKL_RERESOLUTION'};
 if(/^find\b/i.test(seg)){if(/(?:\s-(?:delete|exec|execdir|ok|okdir)\b)/i.test(seg))return{effect:'MATERIAL',reason:'FIND_MUTATOR'};return{effect:'READ_ONLY',reason:'FIND_INSPECTION'};}
 if(SIMPLE_READ.test(seg)||gitRead(seg))return{effect:'READ_ONLY',reason:'ALLOWLISTED_INSPECTION'};
 return{effect:'MATERIAL',reason:'NOT_PROVEN_READ_ONLY'};
}
export function isConsequentialToolUse(toolName,toolInput={}){if(toolName==='Edit'||toolName==='Write')return true;if(toolName!=='Bash'&&toolName!=='PowerShell')return false;return classifyShellEffect(toolInput.command).effect==='MATERIAL';}
