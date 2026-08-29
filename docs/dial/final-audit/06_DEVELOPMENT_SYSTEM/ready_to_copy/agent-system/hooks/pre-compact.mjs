import fs from "node:fs";
import {execSync} from "node:child_process";
let input=""; for await (const c of process.stdin) input+=c;
function sh(c){try{return execSync(c,{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim()}catch{return ""}}
fs.mkdirSync(".claude/state",{recursive:true});
const stamp=new Date().toISOString().replaceAll(":","-");
const body=`# DIAL pre-compact checkpoint
Time: ${new Date().toISOString()}
Branch: ${sh("git branch --show-current")}
Status:
${sh("git status --short")}
Recent commits:
${sh("git log -5 --oneline")}
`;
fs.writeFileSync(`.claude/state/${stamp}.md`,body);
