import {execSync} from "node:child_process";
let input=""; for await (const c of process.stdin) input+=c;
let j={}; try{j=JSON.parse(input)}catch{}
if(j.stop_hook_active) process.exit(0);
function sh(c){try{return {ok:true,out:execSync(c,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim()}}catch(e){return {ok:false,out:String(e.stdout||"")+"\n"+String(e.stderr||"")}}}
const diff=sh("git diff --name-only").out.split("\n").filter(Boolean);
if(!diff.length || (process.env.DIAL_HOOK_PROFILE||"standard")==="minimal") process.exit(0);
const gate=sh("pnpm -s typecheck && pnpm -s test");
if(!gate.ok) console.log(JSON.stringify({decision:"block",reason:"DIAL stop gate: changed code exists and the fast typecheck/test gate failed. Fix the failure or explicitly interrupt after review."}));
