#!/usr/bin/env node
import { resolvePacketEngineeringKnowledge, reResolvePacketEngineeringKnowledge } from '../orchestration/engineering-knowledge-broker.mjs';
import { resolveEngineeringSkills } from '../orchestration/skill-resolver.mjs';

const args = process.argv.slice(2);
let featureId = null, task = '', packetId = null, reason = null, activate = false;
const affected = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith('--') && !featureId) { featureId = arg; continue; }
  if (arg === '--task') { task = args[++i] || ''; continue; }
  if (arg === '--packet-id') { packetId = args[++i] || ''; continue; }
  if (arg === '--path') { affected.push(args[++i] || ''); continue; }
  if (arg === '--activate') { activate = true; continue; }
  if (arg === '--reason') { reason = args[++i] || ''; continue; }
}
const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const metadata = { feature_id: featureId, affected_paths: affected };
if (!activate) {
  console.log(JSON.stringify(resolveEngineeringSkills({ repoDir, featureId, instruction: task, affectedPaths: affected, metadata }), null, 2));
} else {
  const id = packetId || process.env.DIAL_PACKET_ID;
  if (!id) throw new Error('--packet-id or DIAL_PACKET_ID is required with --activate');
  const manifest = reason
    ? reResolvePacketEngineeringKnowledge({ repoDir, packetId: id, instruction: task, metadata, reason })
    : resolvePacketEngineeringKnowledge({ repoDir, packetId: id, instruction: task, metadata });
  console.log(JSON.stringify(manifest, null, 2));
}
