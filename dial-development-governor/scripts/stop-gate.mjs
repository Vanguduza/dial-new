import {spawnSync} from 'node:child_process';
const r=spawnSync('node',['agent-system/bin/v2-closure-check.mjs'],{stdio:'inherit'});
if(r.status!==0){console.error('DIAL closure check failed. Do not claim broad completion.');process.exit(r.status||2)}
