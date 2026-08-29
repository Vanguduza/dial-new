import fs from 'node:fs';
fs.mkdirSync('agent-system/checkpoints',{recursive:true});
const body=`checkpoint_at: ${new Date().toISOString()}\nstatus: context compaction requested\nnext: reload ACTIVE_WORK and bounded Feature context\n`;
fs.writeFileSync('agent-system/checkpoints/LATEST.md',body);
