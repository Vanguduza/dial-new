import fs from "node:fs";
import path from "node:path";

const roots=["CLAUDE.md","AGENTS.md",".claude",".cursor","agent-system/canon"].filter(fs.existsSync);
const files=[];
function walk(p){
  const s=fs.statSync(p);
  if(s.isDirectory()) for(const e of fs.readdirSync(p)) walk(path.join(p,e));
  else if(/\.(md|mdc|json|yaml|yml)$/.test(p)) files.push(p);
}
for(const r of roots) walk(r);

const forbidden=[
  {re:/DIAL_OWNED/i,msg:"superseded Spare owned-stock term"},
  {re:/E6a[^\n]{0,80}Integration Green/i,msg:"E6a cannot be inherited green without explicit evidence"},
  {re:/FixItNow[^\n]{0,120}PORT-WHOLESALE/i,msg:"stale FixItNow wholesale-port directive; DEC-039 makes external repositories reference/inspiration only"},
  {re:/SPECIALIST_VERTICAL_PENDING_PORTFOLIO_LOCK/i,msg:"stale Dial Health portfolio-candidate status; Health is a required standalone division"}
];

let fail=[];
for(const f of files){
  const t=fs.readFileSync(f,"utf8");
  for(const x of forbidden) if(x.re.test(t)) fail.push(`${f}: ${x.msg}`);
}
if(fail.length){
  console.error(fail.join("\n"));
  process.exit(1);
}
console.log(`DIAL agent drift check green across ${files.length} instruction/canon files.`);
