let input=""; for await (const c of process.stdin) input+=c;
let j={}; try{j=JSON.parse(input)}catch{}
const tool=j.tool_name||"", ti=j.tool_input||{};
let d=null, reason="";
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
