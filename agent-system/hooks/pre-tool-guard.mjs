import { loadSkillActivationForPacket } from '../orchestration/skill-activation-store.mjs';
import { checkKnowledgeBinding } from '../orchestration/knowledge-admission-guard.mjs';
import { checkKnowledgeExemption } from '../orchestration/knowledge-exemption.mjs';

let input=""; for await (const c of process.stdin) input+=c;
let j={}; try{j=JSON.parse(input)}catch{}
const tool=j.tool_name||"", ti=j.tool_input||{};
let d=null, reason="";
const packetId=process.env.DIAL_PACKET_ID||null;
const repoDir=process.env.DIAL_REPO_DIR||process.cwd();
const root=process.env.DIAL_CONTROL_HOME||undefined;
const readOnlyShell=/^(?:\s*(?:pwd|ls|find|grep|rg|cat|head|tail|wc|jq)\b|\s*git\s+(?:status|diff|log|show|branch|rev-parse|merge-base)\b|\s*sed\s+-n\b)/i;
const explicitReresolution=/engineering-knowledge-resolve\.mjs\b.*--packet-id/i;
const consequential=(tool==="Edit"||tool==="Write"||((tool==="Bash"||tool==="PowerShell")&&!readOnlyShell.test(String(ti.command||""))&&!explicitReresolution.test(String(ti.command||""))));
if(packetId&&consequential){
 const activation=loadSkillActivationForPacket(packetId,root);
 if(!activation){d="deny";reason="DIAL VEKL 2.2 guard: material tool use requires a persisted packet knowledge activation.";}
 else if(activation.knowledge_context?.unit_lineage_id){const check=checkKnowledgeBinding({repoDir,root,packetId});if(!check.ok){d="deny";reason=`DIAL VEKL 2.2 guard: stale Unit knowledge binding (${check.reasons.join(', ')}). Re-resolve before material tool use.`;}}
 else if(activation.knowledge_context?.scope==="POLICY_EXEMPTION"){const check=checkKnowledgeExemption({repoDir,root,packetId});if(!check.ok){d="deny";reason=`DIAL VEKL 2.2 guard: stale knowledge exemption (${check.reasons.join(', ')}).`;}}
 else{d="deny";reason="DIAL VEKL 2.2 guard: unscoped planning may inspect only; resolve a Feature/Unit or explicit allowed exemption before material tool use.";}
}
if(tool==="Bash"||tool==="PowerShell"){
 const cmd=String(ti.command||"");
 const deny=[
  /git\s+push\b.*--force/i,
  /git\s+reset\s+--hard/i,
  /\brm\s+-rf\s+\/(?:\s|$)/i,
  /\bterraform\s+destroy\b/i,
  /\bsupabase\s+db\s+reset\b.*(?:prod|remote)/i,
  /\b(cat|type)\s+.*(?:\.env|credentials|secrets?)/i
 ];
 const ask=[
  /\b(vercel|fly|railway|render)\b.*\b(prod|deploy)\b/i,
  /\bkubectl\s+(delete|apply)\b/i,
  /\bterraform\s+apply\b/i,
  /\b(psql|supabase)\b.*\b(prod|production)\b/i
 ];
 if(deny.some(r=>r.test(cmd))){d="deny";reason="DIAL guard: destructive/secret-sensitive command blocked."}
 else if(ask.some(r=>r.test(cmd))){d="ask";reason="DIAL guard: production/infrastructure mutation requires explicit confirmation."}
}
if(tool==="Edit"||tool==="Write"){
 const p=String(ti.file_path||"").replaceAll("\\","/");
 if(/agent-system\/canon\/PROJECT_TRUTH\.md$|agent-system\/registries\/DECISION_LOG\.json$/.test(p)){
  d="ask";reason="DIAL guard: canonical truth/decision changes require explicit review.";
 }
}
if(d) console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:d,permissionDecisionReason:reason}}));
