#!/usr/bin/env node
import { renderContextCapsulesForPacket } from './context-capsule-builder.mjs';
import { hashObject } from './knowledge-graph-core.mjs';
import { renderSkillActivationBundle } from './skill-activation-store.mjs';

export const WORKER_DELIVERY_VERSION='vekl-worker-delivery-1';
export function buildWorkerKnowledgeDelivery({packetId,manifest,instruction='',root}={}){
 if(!packetId||!manifest)throw new Error('packetId and activation manifest are required');
 const capsules=renderContextCapsulesForPacket(packetId,root);
 const activation=renderSkillActivationBundle(manifest,root);
 const text=[
  'DIAL VEKL 2.2 MATERIAL WORKER DELIVERY',
  `Activation ID: ${manifest.activation_id}`,
  `Activation manifest: ${manifest.manifest_sha256}`,
  capsules,
  activation,
  '',
  'SCOPED PACKET INSTRUCTION',
  String(instruction||'').trim(),
 ].filter((x)=>x!==''&&x!=null).join('\n');
 return {
  delivery_version:WORKER_DELIVERY_VERSION,
  text,
  worker_delivery_hash:hashObject({delivery_version:WORKER_DELIVERY_VERSION,text}),
 };
}
