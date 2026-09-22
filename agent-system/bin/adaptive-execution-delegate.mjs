#!/usr/bin/env node
import { executeAdaptiveSoloWithReroute } from '../orchestration/adaptive-execution-runner.mjs';
import { getProject } from '../orchestration/project-registry.mjs';
import { DEFAULT_CONTROL_HOME } from '../orchestration/state-store.mjs';

function take(args, name) {
  const i=args.indexOf(name); if(i<0) return null;
  const v=args[i+1]; if(!v) throw new Error(`${name} requires a value`);
  args.splice(i,2); return v;
}
function takeMany(args, name) {
  const out=[]; for(;;){const i=args.indexOf(name); if(i<0) break; const v=args[i+1]; if(!v) throw new Error(`${name} requires a value`); out.push(v); args.splice(i,2);} return out;
}
async function main() {
  const args=process.argv.slice(2);
  const projectSlug=take(args,'--project') || process.env.DIAL_PROJECT_SLUG || 'dial';
  const packetId=take(args,'--packet') || process.env.DIAL_PACKET_ID;
  const instruction=take(args,'--instruction');
  const budgetClass=take(args,'--budget') || 'S';
  const allowedPaths=takeMany(args,'--allow');
  const deniedPaths=takeMany(args,'--deny');
  const networkAllowlist=takeMany(args,'--network');
  if(args.length) throw new Error(`unknown arguments: ${args.join(' ')}`);
  if(!packetId || !instruction) throw new Error('--packet and --instruction are required');
  const root=process.env.DIAL_CONTROL_HOME || DEFAULT_CONTROL_HOME;
  const project=getProject(projectSlug,root);
  const result=await executeAdaptiveSoloWithReroute({
    repoDir: project.repo_dir, root, projectSlug, packetId, instruction, budgetClass,
    allowedPaths, deniedPaths, networkAllowlist, worktreePath:null,
  });
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}
main().catch((error)=>{console.error(error.stack||error);process.exitCode=1;});
