import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const base = '1405daaa4b21b9ae35374282b191475e5bcc3ff6';
const target = 'cf6d23a8b79929ab8b1b16c00ab112fb7f35aa17';
const out = execFileSync('git', [
  'diff','--binary','--no-ext-diff','--no-renames',base,target,'--','.',
  ':(exclude)docs/project-state/CHANGE_LEDGER.jsonl',
  ':(exclude)docs/project-state/CURRENT_STATE.json',
  ':(exclude)docs/project-state/LOCAL_CHANGE_LEDGER.jsonl'
]);
const sha = createHash('sha256').update(out).digest('hex');
console.error('NATIVE_DIAL_DIFF_SHA256=' + sha);
console.error('NATIVE_DIAL_DIFF_BYTES=' + out.length);
process.exitCode = 41;
