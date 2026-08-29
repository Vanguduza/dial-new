import fs from "node:fs";
const r=JSON.parse(fs.readFileSync("agent-system/registries/FEATURE_REGISTRY.json","utf8"));
const by={};
for(const f of r){(by[f.status]??=[]).push(f.feature_id)}
console.log(JSON.stringify({total:r.length,by_status:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,v.length]))},null,2));
