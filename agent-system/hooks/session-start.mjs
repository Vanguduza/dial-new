import fs from "node:fs";
import {execSync} from "node:child_process";
function sh(cmd){try{return execSync(cmd,{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{return ""}}
const branch=sh("git branch --show-current");
const status=sh("git status --short").split("\n").filter(Boolean).slice(0,12).join("\n");
let active={}; try{active=JSON.parse(fs.readFileSync("agent-system/registries/ACTIVE_WORK.json","utf8"))}catch{}
const ctx=[
`DIAL branch: ${branch||"unknown"}`,
`Active Feature ID: ${active.feature_id||"none selected"}`,
`Dirty files (max 12):\n${status||"clean"}`,
"Material work should resolve a Feature ID with: node agent-system/bin/context-get.mjs <FEATURE_ID>",
"Planning documents do not prove implementation."
].join("\n");
const specific={hookEventName:"SessionStart",additionalContext:ctx};
if(active.feature_id) specific.sessionTitle=`DIAL ${active.feature_id}`;
console.log(JSON.stringify({hookSpecificOutput:specific}));
