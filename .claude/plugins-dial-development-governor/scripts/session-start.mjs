import fs from 'node:fs';
const req=['CLAUDE.md','agent-system'];
const missing=req.filter(p=>!fs.existsSync(p));
if(missing.length){console.error('DIAL v2 bootstrap missing: '+missing.join(', '));process.exit(2)}
console.log('DIAL v2 session: bootstrap present; resolve ACTIVE_WORK + Feature ID before material edits.');
